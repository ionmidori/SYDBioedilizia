
import json
import logging
from typing import Any, AsyncGenerator, AsyncIterator, Dict, List, Union

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# AI SDK v6 — UI Message Stream protocol
#
# The frontend runs `@ai-sdk/react` v3 / `ai` v6, whose `DefaultChatTransport`
# parses the response with `parseJsonEventStream` against `uiMessageChunkSchema`.
# That means it expects Server-Sent Events:
#
#     data: {"type":"start"}\n\n
#     data: {"type":"text-start","id":"0"}\n\n
#     data: {"type":"text-delta","id":"0","delta":"Ciao"}\n\n
#     data: {"type":"text-end","id":"0"}\n\n
#     data: {"type":"finish"}\n\n
#     data: [DONE]\n\n
#
# The previous implementation emitted the AI SDK *v5* data-stream protocol
# (`0:"text"\n`, header `x-vercel-ai-data-stream: v1`). v6 cannot parse it: the
# lines are not SSE `data:` lines, so the EventSourceParser silently drops them
# and the streamed assistant reply never enters `useChat` state (it only showed
# up after a refresh, rendered from Firestore history). This module now emits the
# v6 protocol so streaming works as designed.
#
# Custom/ADK data (status, interrupts, ui widgets, artifacts, reasoning, tool
# activity) is emitted as **transient** `data-*` chunks: v6 delivers them to the
# `onData` callback but does NOT add them to `message.parts`, so message
# rendering stays text-only (matching prior behaviour) while the frontend can
# still react to them.
# ──────────────────────────────────────────────────────────────────────────────

# Single text part id reused for every text-delta within one assistant turn so
# the v6 reducer concatenates them into a single text part.
TEXT_PART_ID = "0"

_DONE = "data: [DONE]\n\n"


def _sse(chunk: Dict[str, Any]) -> str:
    """Serialize one UI message chunk as an SSE `data:` event."""
    return f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"


async def stream_text(text: str) -> AsyncGenerator[Dict[str, Any], None]:
    """Yield a v6 `text-delta` chunk (lifecycle handled by `to_ui_message_stream`)."""
    if text:
        yield {"type": "text-delta", "id": TEXT_PART_ID, "delta": text}


async def stream_error(error: str) -> AsyncGenerator[Dict[str, Any], None]:
    """Yield a v6 `error` chunk."""
    yield {"type": "error", "errorText": error}


async def stream_tool_call(
    tool_call_id: str,
    tool_name: str,
    args: Dict[str, Any],
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Tool invocation, emitted as a transient data part.

    Kept transient (not a real v6 `tool-input-available` part) so it does not
    alter the assistant message during streaming — tool details are rendered
    from Firestore history (toolInvocations) after the turn, as before.
    """
    yield {
        "type": "data-tool_call",
        "data": {"type": "tool_call", "toolCallId": tool_call_id, "toolName": tool_name, "args": args},
        "transient": True,
    }


async def stream_tool_result(
    tool_call_id: str,
    result: Any,
) -> AsyncGenerator[Dict[str, Any], None]:
    """Tool result, emitted as a transient data part (see `stream_tool_call`)."""
    yield {
        "type": "data-tool_result",
        "data": {"type": "tool_result", "toolCallId": tool_call_id, "result": result},
        "transient": True,
    }


async def stream_data(
    data: Union[Dict[str, Any], List[Any], str, int, float, bool],
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Arbitrary ADK event payload (e.g. HITL interrupts) as a transient data part.

    `data` is the original event object (it carries its own `type`, e.g.
    `{"type": "interrupt", "payload": {...}}`) so the frontend `onData` handler
    receives the exact shape it already expects.
    """
    yield {"type": "data-event", "data": data, "transient": True}


async def stream_status(message: str) -> AsyncGenerator[Dict[str, Any], None]:
    """Status update as a transient `data-status` chunk."""
    yield {
        "type": "data-status",
        "data": {"type": "status", "message": message},
        "transient": True,
    }


async def stream_ui_widget(widget_data: Dict[str, Any]) -> AsyncGenerator[Dict[str, Any], None]:
    """
    UiWidget event (ADK 1.27+ `render_ui_widget`) as a transient `data-ui_widget` chunk.
    """
    yield {
        "type": "data-ui_widget",
        "data": {
            "type": "ui_widget",
            "widget_id": widget_data.get("id", ""),
            "provider": widget_data.get("provider", "syd"),
            "payload": widget_data.get("payload", {}),
        },
        "transient": True,
    }


async def stream_artifact_event(artifact_data: Dict[str, Any]) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Artifact delta event (ADK 1.27+ `save_artifact`) as a transient `data-artifact` chunk.
    """
    yield {
        "type": "data-artifact",
        "data": {
            "type": "artifact",
            "filename": artifact_data.get("filename", ""),
            "version": artifact_data.get("version", 0),
        },
        "transient": True,
    }


async def stream_reasoning(step_data: Dict[str, Any]) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Reasoning step (CoT) as a transient `data-reasoning` chunk.

    🛡️ SECURITY: redacts `tool_args` for sensitive tools.
    """
    safe_data = step_data.copy()
    SENSITIVE_TOOLS = ["submit_lead", "submit_lead_data", "store_user_data", "update_profile"]
    if safe_data.get("tool_name") in SENSITIVE_TOOLS:
        safe_data["tool_args"] = {"REDACTED": "*** PII HIDDEN ***"}
    yield {
        "type": "data-reasoning",
        "data": {"type": "reasoning", "data": safe_data},
        "transient": True,
    }


async def to_ui_message_stream(
    source: AsyncIterator[Dict[str, Any]],
    message_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    Wrap a stream of v6 UI message chunk dicts as a serialized SSE byte stream,
    injecting the required lifecycle frames:

    - a leading `start` chunk (carrying `messageId` when provided, so the AI SDK
      adopts the backend-assigned id — `state.message.id = chunk.messageId` — and
      keeps the streamed message on the same identity as its persisted Firestore
      row; without it the post-turn id swap re-mounts the bubble and flickers),
    - `text-start` / `text-end` brackets around any run of `text-delta` chunks,
    - a trailing `finish` chunk and the `[DONE]` sentinel.

    Errors raised by `source` are surfaced as a v6 `error` chunk and the stream
    is closed cleanly. On client disconnect (GeneratorExit) nothing is yielded,
    avoiding "async generator ignored GeneratorExit" runtime errors.
    """
    text_open = False
    start_chunk: Dict[str, Any] = {"type": "start"}
    if message_id:
        start_chunk["messageId"] = message_id
    yield _sse(start_chunk)
    try:
        async for chunk in source:
            ctype = chunk.get("type")
            if ctype == "text-delta":
                if not text_open:
                    yield _sse({"type": "text-start", "id": TEXT_PART_ID})
                    text_open = True
                yield _sse(chunk)
            else:
                if text_open:
                    yield _sse({"type": "text-end", "id": TEXT_PART_ID})
                    text_open = False
                yield _sse(chunk)
        if text_open:
            yield _sse({"type": "text-end", "id": TEXT_PART_ID})
            text_open = False
        yield _sse({"type": "finish"})
        yield _DONE
    except Exception as exc:  # noqa: BLE001 — convert any error into a clean v6 error frame
        logger.error("Error while streaming UI message: %s", exc, exc_info=True)
        if text_open:
            yield _sse({"type": "text-end", "id": TEXT_PART_ID})
        yield _sse({"type": "error", "errorText": "Errore durante la generazione della risposta."})
        yield _sse({"type": "finish"})
        yield _DONE
