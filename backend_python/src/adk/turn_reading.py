"""
What the conversation says, read from the ADK session events: the reply the
client saw before this turn, the tools called and the client's own words.

Shared by the explicit-yes check of the send (`src/tools/send_consent.py`) and
the facts of the quote step (`src/adk/quote_facts.py`): both read the same
facts the same way. What a text says (a plain yes, the send question) is in
`src/services/reply_reading.py`.
"""
from __future__ import annotations

from collections.abc import Sequence

from google.adk.events import Event
from google.genai import types

from src.adk.video_attachments import is_skipped_video_note


def message_text(content: types.Content | None) -> str:
    """The visible text of a message: thoughts and tool parts left out."""
    if content is None or not content.parts:
        return ""
    return " ".join(p.text for p in content.parts if p.text and not p.thought).strip()


def tool_calls(event: Event) -> list[str]:
    """Names of the tools the event calls."""
    return [p.function_call.name or "" for p in (event.content.parts or []) if p.function_call] if event.content else []


def turn_calls(events: Sequence[Event], invocation_id: str) -> list[str]:
    """Tools called so far in this turn, in order."""
    return [name for e in events if e.invocation_id == invocation_id for name in tool_calls(e)]


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
        for e in events if e.invocation_id == invocation_id and e.content
        for p in e.content.parts or []
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
