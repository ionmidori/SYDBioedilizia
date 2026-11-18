"""
What the last `suggest_quote_items` call left behind, read from the chat history:
the rooms its completeness gate asked about and the rooms the client talked
about since. The quote tool uses it to leave out a room without works instead of
asking about it again and again.

The gate writes one line per room (`gate_line`) and the same function reads it
back here: one format, one place.
"""
from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from src.services.quote_step import REGISTER_TOOL


def gate_line(label: str, questions: str) -> str:
    """The gate's line for one room: its label and what is missing."""
    return f"{_gate_prefix(label)} {questions}"


def _gate_prefix(label: str) -> str:
    return f"**{label}**:"


# A line written by gate_line: "**<label>**: ...".
_GATE_LINE = re.compile(r"^\*\*([^*\n]+)\*\*:", re.MULTILINE)


@dataclass(frozen=True)
class LastRound:
    asked: frozenset[str]  # labels of the rooms the last call's gate asked about
    talked: frozenset[str | None]  # rooms (by id) of the client's messages after that call


def _quote_call_ids(history: list[dict[str, Any]]) -> set[str]:
    return {
        call["id"]
        for m in history if m.get("role") == "assistant"
        for call in m.get("tool_calls") or []
        if isinstance(call, dict) and call.get("name") == REGISTER_TOOL and isinstance(call.get("id"), str)
    }


def _reply_text(content: str) -> str:
    """The tool's reply as it wrote it. The orchestrator saves the result as ADK
    returns it, a `str` wrapped as {"result": ...} and JSON-encoded."""
    try:
        decoded = json.loads(content)
    except ValueError:
        return content
    return str(decoded.get("result", "")) if isinstance(decoded, dict) else content


def last_round(history: list[dict[str, Any]], owner: Mapping[int, str | None]) -> LastRound | None:
    """The last quote call of the history (None: there was none). `owner` is the
    room of each message by `id(message)` (`room_mentions.message_rooms`)."""
    calls = _quote_call_ids(history)
    last = next(
        (i for i in range(len(history) - 1, -1, -1)
         if history[i].get("role") == "tool" and history[i].get("tool_call_id") in calls),
        None,
    )
    if last is None:
        return None
    reply = _reply_text(str(history[last].get("content") or ""))
    return LastRound(
        asked=frozenset(_GATE_LINE.findall(reply)),
        talked=frozenset(owner.get(id(m)) for m in history[last + 1:] if m.get("role") == "user"),
    )
