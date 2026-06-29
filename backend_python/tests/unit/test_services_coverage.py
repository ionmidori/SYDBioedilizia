"""
Unit Tests - Services & Utils (Coverage Boost)
================================================
Tests for low-coverage modules:
  - src/services/intent_classifier.py (0%)
  - src/utils/stream_protocol.py (56%)
"""

from __future__ import annotations

import json
import pytest


# ---------------------------------------------------------------------------
# 1. src/services/intent_classifier.py
# ---------------------------------------------------------------------------

class TestIntentClassifier:
    async def test_empty_messages_returns_reasoning(self):
        from src.services.intent_classifier import IntentClassifier
        assert await IntentClassifier.classify_intent([]) == "reasoning"

    async def test_non_user_role_returns_reasoning(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "assistant", "content": "hello"}])
        assert result == "reasoning"

    async def test_greeting_ciao_returns_execution(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": "ciao"}])
        assert result == "execution"

    async def test_greeting_hello_returns_execution(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": "hello"}])
        assert result == "execution"

    async def test_greeting_buongiorno_returns_execution(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": "buongiorno"}])
        assert result == "execution"

    async def test_greeting_buonasera_returns_execution(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": "buonasera"}])
        assert result == "execution"

    async def test_greeting_hi_returns_execution(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": "hi"}])
        assert result == "execution"

    async def test_greeting_case_insensitive(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": "CIAO!"}])
        assert result == "execution"

    async def test_long_message_returns_reasoning(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([
            {"role": "user", "content": "I want to renovate my bathroom and kitchen please"}
        ])
        assert result == "reasoning"

    async def test_multimodal_list_content_returns_reasoning(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([
            {"role": "user", "content": [{"type": "text", "text": "hello"}]}
        ])
        assert result == "reasoning"

    async def test_object_style_message(self):
        from src.services.intent_classifier import IntentClassifier

        class Msg:
            role = "user"
            content = "ciao"

        result = await IntentClassifier.classify_intent([Msg()])
        assert result == "execution"

    async def test_only_inspects_last_message(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([
            {"role": "user", "content": "I want a full renovation of my apartment"},
            {"role": "user", "content": "ciao"},
        ])
        assert result == "execution"

    async def test_non_greeting_short_message_returns_reasoning(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": "prezzo?"}])
        assert result == "reasoning"

    async def test_empty_string_content_returns_reasoning(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": ""}])
        assert result == "reasoning"

    async def test_multimodal_list_with_string_parts(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([
            {"role": "user", "content": ["hello", "there"]}
        ])
        # list content → reasoning (complexity check)
        assert result == "reasoning"


# ---------------------------------------------------------------------------
# 2. src/utils/stream_protocol.py
# ---------------------------------------------------------------------------

# NOTE: as of the AI SDK v6 migration, the stream_protocol helpers yield
# UI-message **chunk dicts** (not serialized strings). SSE serialization and
# lifecycle framing (start / text-start / text-end / finish / [DONE]) are added
# by `to_ui_message_stream`. See TestToUiMessageStream below.

class TestStreamText:
    async def test_yields_text_delta_chunk(self):
        from src.utils.stream_protocol import stream_text, TEXT_PART_ID
        chunks = [c async for c in stream_text("hello")]
        assert chunks == [{"type": "text-delta", "id": TEXT_PART_ID, "delta": "hello"}]

    async def test_empty_text_yields_nothing(self):
        from src.utils.stream_protocol import stream_text
        chunks = [c async for c in stream_text("")]
        assert len(chunks) == 0

    async def test_special_chars_preserved(self):
        from src.utils.stream_protocol import stream_text
        chunks = [c async for c in stream_text('he said "hi"')]
        assert chunks[0]["delta"] == 'he said "hi"'


class TestStreamData:
    async def test_event_payload_wrapped_transient(self):
        from src.utils.stream_protocol import stream_data
        payload = {"type": "interrupt", "payload": {"k": "v"}}
        chunks = [c async for c in stream_data(payload)]
        assert chunks == [{"type": "data-event", "data": payload, "transient": True}]

    async def test_scalar_data(self):
        from src.utils.stream_protocol import stream_data
        chunks = [c async for c in stream_data(42)]
        assert chunks[0]["type"] == "data-event"
        assert chunks[0]["data"] == 42
        assert chunks[0]["transient"] is True


class TestStreamError:
    async def test_error_chunk(self):
        from src.utils.stream_protocol import stream_error
        chunks = [c async for c in stream_error("something went wrong")]
        assert chunks == [{"type": "error", "errorText": "something went wrong"}]


class TestStreamToolCall:
    async def test_tool_call_transient(self):
        from src.utils.stream_protocol import stream_tool_call
        chunks = [c async for c in stream_tool_call("tc-1", "analyze_room", {"url": "test"})]
        assert chunks[0]["type"] == "data-tool_call"
        assert chunks[0]["transient"] is True
        assert chunks[0]["data"]["toolCallId"] == "tc-1"
        assert chunks[0]["data"]["toolName"] == "analyze_room"
        assert chunks[0]["data"]["args"] == {"url": "test"}


class TestStreamToolResult:
    async def test_tool_result_transient(self):
        from src.utils.stream_protocol import stream_tool_result
        chunks = [c async for c in stream_tool_result("tc-1", {"status": "ok"})]
        assert chunks[0]["type"] == "data-tool_result"
        assert chunks[0]["transient"] is True
        assert chunks[0]["data"]["toolCallId"] == "tc-1"
        assert chunks[0]["data"]["result"] == {"status": "ok"}


class TestStreamStatus:
    async def test_status_transient(self):
        from src.utils.stream_protocol import stream_status
        chunks = [c async for c in stream_status("Processing...")]
        assert chunks == [
            {"type": "data-status", "data": {"type": "status", "message": "Processing..."}, "transient": True}
        ]


class TestStreamReasoning:
    async def test_reasoning_transient(self):
        from src.utils.stream_protocol import stream_reasoning
        chunks = [c async for c in stream_reasoning({"analysis": "testing"})]
        assert chunks[0]["type"] == "data-reasoning"
        assert chunks[0]["transient"] is True
        assert chunks[0]["data"] == {"type": "reasoning", "data": {"analysis": "testing"}}

    async def test_sensitive_tool_redacted_submit_lead(self):
        from src.utils.stream_protocol import stream_reasoning
        data = {"tool_name": "submit_lead", "tool_args": {"email": "pii@test.com"}}
        chunks = [c async for c in stream_reasoning(data)]
        assert chunks[0]["data"]["data"]["tool_args"] == {"REDACTED": "*** PII HIDDEN ***"}

    async def test_sensitive_tool_redacted_store_user_data(self):
        from src.utils.stream_protocol import stream_reasoning
        data = {"tool_name": "store_user_data", "tool_args": {"name": "John"}}
        chunks = [c async for c in stream_reasoning(data)]
        assert chunks[0]["data"]["data"]["tool_args"] == {"REDACTED": "*** PII HIDDEN ***"}

    async def test_sensitive_tool_redacted_update_profile(self):
        from src.utils.stream_protocol import stream_reasoning
        data = {"tool_name": "update_profile", "tool_args": {"phone": "+39123"}}
        chunks = [c async for c in stream_reasoning(data)]
        assert chunks[0]["data"]["data"]["tool_args"] == {"REDACTED": "*** PII HIDDEN ***"}

    async def test_safe_tool_not_redacted(self):
        from src.utils.stream_protocol import stream_reasoning
        data = {"tool_name": "analyze_room", "tool_args": {"url": "test.jpg"}}
        chunks = [c async for c in stream_reasoning(data)]
        assert chunks[0]["data"]["data"]["tool_args"] == {"url": "test.jpg"}

    async def test_original_dict_not_mutated(self):
        from src.utils.stream_protocol import stream_reasoning
        original = {"tool_name": "submit_lead", "tool_args": {"email": "pii@test.com"}}
        original_copy = original.copy()
        _ = [c async for c in stream_reasoning(original)]
        assert original["tool_args"] == original_copy["tool_args"]

    async def test_no_tool_name_key(self):
        from src.utils.stream_protocol import stream_reasoning
        data = {"analysis": "No tool involved"}
        chunks = [c async for c in stream_reasoning(data)]
        assert chunks[0]["data"]["data"]["analysis"] == "No tool involved"


class TestToUiMessageStream:
    """The lifecycle wrapper that produces the actual AI SDK v6 SSE byte stream."""

    @staticmethod
    def _events(data):
        async def gen():
            for d in data:
                yield d
        return gen()

    @staticmethod
    def _parse(sse_lines):
        # Each item is "data: <json>\n\n" or the "[DONE]" sentinel.
        out = []
        for line in sse_lines:
            assert line.startswith("data: "), f"not an SSE data line: {line!r}"
            assert line.endswith("\n\n"), f"missing SSE terminator: {line!r}"
            body = line[len("data: "):].rstrip("\n")
            out.append(body if body == "[DONE]" else json.loads(body))
        return out

    async def test_text_is_bracketed_and_finished(self):
        from src.utils.stream_protocol import stream_text, to_ui_message_stream, TEXT_PART_ID

        async def source():
            async for c in stream_text("Ciao "):
                yield c
            async for c in stream_text("mondo"):
                yield c

        sse = [c async for c in to_ui_message_stream(source())]
        parsed = self._parse(sse)
        assert parsed[0] == {"type": "start"}
        assert parsed[1] == {"type": "text-start", "id": TEXT_PART_ID}
        assert parsed[2] == {"type": "text-delta", "id": TEXT_PART_ID, "delta": "Ciao "}
        assert parsed[3] == {"type": "text-delta", "id": TEXT_PART_ID, "delta": "mondo"}
        assert parsed[4] == {"type": "text-end", "id": TEXT_PART_ID}
        assert parsed[5] == {"type": "finish"}
        assert parsed[6] == "[DONE]"

    async def test_no_text_still_starts_and_finishes(self):
        from src.utils.stream_protocol import to_ui_message_stream
        sse = [c async for c in to_ui_message_stream(self._events([]))]
        parsed = self._parse(sse)
        assert parsed == [{"type": "start"}, {"type": "finish"}, "[DONE]"]

    async def test_transient_data_not_bracketed_as_text(self):
        from src.utils.stream_protocol import stream_status, to_ui_message_stream

        async def source():
            async for c in stream_status("thinking"):
                yield c

        sse = [c async for c in to_ui_message_stream(source())]
        parsed = self._parse(sse)
        assert parsed[0] == {"type": "start"}
        assert parsed[1]["type"] == "data-status"
        assert parsed[1]["transient"] is True
        assert parsed[2] == {"type": "finish"}
        assert parsed[3] == "[DONE]"

    async def test_text_end_emitted_before_following_data(self):
        from src.utils.stream_protocol import stream_text, stream_status, to_ui_message_stream, TEXT_PART_ID

        async def source():
            async for c in stream_text("hi"):
                yield c
            async for c in stream_status("done"):
                yield c

        sse = [c async for c in to_ui_message_stream(source())]
        parsed = self._parse(sse)
        types = [p["type"] if isinstance(p, dict) else p for p in parsed]
        assert types == ["start", "text-start", "text-delta", "text-end", "data-status", "finish", "[DONE]"]

    async def test_source_error_becomes_error_frame(self):
        from src.utils.stream_protocol import stream_text, to_ui_message_stream

        async def source():
            async for c in stream_text("partial"):
                yield c
            raise RuntimeError("boom")

        sse = [c async for c in to_ui_message_stream(source())]
        parsed = self._parse(sse)
        types = [p["type"] if isinstance(p, dict) else p for p in parsed]
        # text is closed, an error frame is surfaced, then the stream finishes cleanly
        assert "text-end" in types
        assert "error" in types
        assert types[-2] == "finish"
        assert types[-1] == "[DONE]"
