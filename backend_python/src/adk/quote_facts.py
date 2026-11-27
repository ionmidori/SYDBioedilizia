"""
The facts of the quote step (`src/services/quote_step.py`), read from the ADK
session: its events and the state the orchestrator writes (`session_context.py`),
the card of a draft included (read before the turn, `CARD_PENDING_STATE_KEY`).
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from google.adk.events import Event
from google.genai import types

from src.adk.session_context import (
    CARD_EVENT_STATE_KEY,
    CARD_PENDING_STATE_KEY,
    HOUSE_QUOTE_STATE_KEY,
    SESSION_CONTEXT_STATE_KEY,
)
from src.adk.turn_reading import (
    client_words,
    last_reply,
    last_turn_calls,
    last_turn_responses,
    refused_calls,
    turn_calls,
)
from src.services.card_event import CARD_CONFIRMED_EVENT, QUOTE_SENT_EVENT
from src.services.quote_step import REGISTER_TOOL, QuoteFacts


def quote_facts(
    events: Sequence[Event],
    invocation_id: str,
    user_content: types.Content | None,
    state: Mapping[str, Any],
    *,
    answered_only: bool = False,
) -> QuoteFacts:
    """The facts of this turn, from the ADK session and its state (the session
    block the orchestrator writes: `session_context.py`). `answered_only`: the
    turn's calls are only those already run (the step gate, `turn_calls`)."""
    session = state.get(SESSION_CONTEXT_STATE_KEY) or {}
    quote = state.get(HOUSE_QUOTE_STATE_KEY) or {}
    card = state.get(CARD_PENDING_STATE_KEY)
    event = state.get(CARD_EVENT_STATE_KEY)
    return QuoteFacts(
        is_guest=bool(session.get("is_guest", True)),
        quote_status=quote.get("status"),
        delivery_status=quote.get("delivery_status"),
        card_pending=card if isinstance(card, bool) else None,
        last_reply=last_reply(events, invocation_id),
        last_turn_calls=tuple(last_turn_calls(events, invocation_id)),
        turn_calls=tuple(turn_calls(events, invocation_id, answered_only=answered_only)),
        client_words=client_words(events, invocation_id, user_content),
        last_register_reply="\n".join(last_turn_responses(events, invocation_id, REGISTER_TOOL)),
        card_confirmed=event == CARD_CONFIRMED_EVENT,
        quote_sent=event == QUOTE_SENT_EVENT,
        quote_empty=bool(quote.get("empty")),
        register_refused=REGISTER_TOOL in refused_calls(events, invocation_id),
    )
