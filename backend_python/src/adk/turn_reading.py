"""
What the conversation says, read from the ADK session events: the reply the
client saw before this turn, the tools called and the client's own words.

Read by the facts of the quote step (`src/adk/quote_facts.py`) and by the
tools that need the client's words of this turn. What a text says (a change,
a courtesy) is in `src/services/reply_reading.py`.
"""
from __future__ import annotations

from collections.abc import Sequence

from google.adk.events import Event
from google.genai import types

from src.adk.video_attachments import is_skipped_video_note
from src.services.quote_step import STEP_REFUSED_PREFIX


def message_text(content: types.Content | None) -> str:
    """The visible text of a message: thoughts and tool parts left out."""
    if content is None or not content.parts:
        return ""
    return " ".join(p.text for p in content.parts if p.text and not p.thought).strip()


def _parts(events: Sequence[Event], invocation_id: str) -> list[types.Part]:
    return [p for e in events if e.invocation_id == invocation_id and e.content for p in e.content.parts or []]


def _refused(response: types.FunctionResponse) -> bool:
    """The step gate answered instead of the tool (src/adk/quote_gate.py)."""
    result = (response.response or {}).get("result")
    return isinstance(result, str) and result.startswith(STEP_REFUSED_PREFIX)


def _turn_call_list(events: Sequence[Event], invocation_id: str) -> tuple[list[types.FunctionCall], set[str]]:
    """The turn's calls in order, without those the step gate refused (they did not
    run: the step must not move on because of them), and the ids already answered."""
    parts = _parts(events, invocation_id)
    responses = [p.function_response for p in parts if p.function_response]
    refused = {r.id for r in responses if r.id and _refused(r)}
    answered = {r.id for r in responses if r.id}
    calls = [p.function_call for p in parts if p.function_call and p.function_call.id not in refused]
    return calls, answered


def turn_calls(events: Sequence[Event], invocation_id: str, *, answered_only: bool = False) -> list[str]:
    """Tools called so far in this turn, in order. `answered_only`: only the calls
    whose tool has answered. For the step gate: ADK stores a model response with
    all its parallel calls before running them, so the others have neither run nor
    been checked yet (a call without an id is an old event: kept)."""
    calls, answered = _turn_call_list(events, invocation_id)
    return [
        c.name or "" for c in calls
        if not answered_only or c.id is None or c.id in answered
    ]


def refused_calls(events: Sequence[Event], invocation_id: str) -> list[str]:
    """The tools the step gate refused in this turn (they did not run)."""
    return [
        p.function_response.name or ""
        for p in _parts(events, invocation_id)
        if p.function_response and _refused(p.function_response)
    ]


def calls_before(events: Sequence[Event], invocation_id: str, call_id: str | None) -> list[str]:
    """The turn's calls before `call_id`, run or still waiting (refused ones left
    out): of two parallel registrations, the first one goes."""
    calls, _ = _turn_call_list(events, invocation_id)
    names: list[str] = []
    for call in calls:
        if call_id is not None and call.id == call_id:
            break
        names.append(call.name or "")
    return names


def _previous_turn(events: Sequence[Event], invocation_id: str) -> str | None:
    """The invocation of the last assistant event before this turn."""
    shown = [e.invocation_id for e in events if e.invocation_id != invocation_id and e.author != "user"]
    return shown[-1] if shown else None


def last_reply(events: Sequence[Event], invocation_id: str) -> str:
    """Everything the assistant wrote in the last turn before this one (a question,
    a tool call, then a short note: the question is still part of it)."""
    shown = [
        (event.invocation_id, text) for event in events
        if event.invocation_id != invocation_id and event.author != "user" and not event.partial
        and (text := message_text(event.content))
    ]
    if not shown:
        return ""
    last = shown[-1][0]
    return "\n".join(text for turn, text in shown if turn == last)


def last_turn_calls(events: Sequence[Event], invocation_id: str) -> list[str]:
    """Tools the assistant called in the last turn before this one."""
    previous = _previous_turn(events, invocation_id)
    return turn_calls(events, previous) if previous is not None else []


def tool_responses(events: Sequence[Event], invocation_id: str, name: str) -> list[str]:
    """What the tool answered in that turn: the text of its responses (ADK wraps a
    `str` result as {"result": ...})."""
    return [
        str(response.get("result", response))
        for p in _parts(events, invocation_id)
        if p.function_response and p.function_response.name == name
        and (response := p.function_response.response) is not None
    ]


def last_turn_responses(events: Sequence[Event], invocation_id: str, name: str) -> list[str]:
    """What the tool answered in the last turn before this one."""
    previous = _previous_turn(events, invocation_id)
    return tool_responses(events, previous, name) if previous is not None else []


def _has_video(content: types.Content) -> bool:
    return any(
        p.file_data is not None and (p.file_data.mime_type or "").startswith("video/") for p in content.parts or []
    )


def client_words(events: Sequence[Event], invocation_id: str, user_content: types.Content | None) -> str:
    """What the client wrote in this turn. A turn run again without its videos (the
    model refused one) carries only a system note: the client's words are in the
    message of the failed invocation: the last one before it, after the assistant's
    last reply, and with the video. Anything else (the note typed by the client, a
    session rebuilt without the message) has no words: never an older message's yes."""
    if not is_skipped_video_note(user_content):
        return message_text(user_content)
    # A state-only event (the refused video forgotten) has no parts: not a message.
    before = [e for e in events if e.invocation_id != invocation_id and e.content and e.content.parts]
    failed = before[-1] if before else None
    if failed is None or failed.author != "user" or failed.content is None or not _has_video(failed.content):
        return ""
    return message_text(failed.content)
