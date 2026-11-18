"""
QuoteStepPlugin logs the step of the quote once per turn (strada B, passo 1):
no id in the line (session_ref is added by the formatter), never a change to
the turn, never an error that stops it.
"""
import asyncio
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from src.adk import quote_step_plugin
from src.adk.quote_step_plugin import QuoteStepPlugin
from src.adk.session_context import HOUSE_QUOTE_STATE_KEY, SESSION_CONTEXT_STATE_KEY
from src.schemas.confirmation import ConfirmationState
from tests.unit.send_consent_fakes import TURN, text_event, user_message

REGISTER_ASK = "Ho tutto quello che mi serve. Preparo la richiesta di preventivo?"


def _context(state: dict, events: list | None = None, words: str = "sì") -> SimpleNamespace:
    return SimpleNamespace(
        invocation_id=TURN,
        user_content=user_message(words),
        session=SimpleNamespace(id="proj-1", state=state, events=events or []),
    )


def _signed_in(quote: dict | None = None) -> dict:
    state: dict = {SESSION_CONTEXT_STATE_KEY: {"is_guest": False, "phone_on_file": True, "session_id": "proj-1"}}
    if quote is not None:
        state[HOUSE_QUOTE_STATE_KEY] = quote
    return state


def _steps(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [r for r in caplog.records if getattr(r, "event", None) == "quote_step"]


def _card(*pending: bool) -> ConfirmationState:
    return ConfirmationState.model_validate({
        "sections": [
            {"section_key": f"r{i}", "label": None, "pending": p, "measures": [], "element_choices": []}
            for i, p in enumerate(pending)
        ],
        "editable": True,
        "precision": None,
    })


async def _drain() -> None:
    for _ in range(5):
        await asyncio.sleep(0)


async def test_the_step_is_logged_once_without_ids(caplog):
    caplog.set_level(logging.INFO)
    events = [text_event("user", "rifare il bagno"), text_event("quote", REGISTER_ASK)]
    result = await QuoteStepPlugin().before_run_callback(invocation_context=_context(_signed_in({}), events))
    assert result is None
    [record] = _steps(caplog)
    assert record.quote_step == "registra"
    assert "proj-1" not in record.getMessage() and "proj-1" not in str(record.__dict__)


async def test_a_turn_without_session_facts_is_not_logged(caplog):
    caplog.set_level(logging.INFO)
    await QuoteStepPlugin().before_run_callback(invocation_context=_context({}))
    assert _steps(caplog) == []


async def test_a_draft_reads_its_card_before_logging(caplog):
    caplog.set_level(logging.INFO)
    state = _signed_in({"status": "draft", "version": 1, "quote_number": "PRV-2026-0001"})
    with patch.object(quote_step_plugin, "confirmation_state", AsyncMock(return_value=_card(False, True))) as read:
        await QuoteStepPlugin().before_run_callback(invocation_context=_context(state, words="ok"))
        await _drain()
    read.assert_awaited_once_with("proj-1")
    [record] = _steps(caplog)
    assert record.quote_step == "scheda" and record.card_pending is True


async def test_a_confirmed_card_asks_to_send(caplog):
    caplog.set_level(logging.INFO)
    state = _signed_in({"status": "draft", "version": 1})
    with patch.object(quote_step_plugin, "confirmation_state", AsyncMock(return_value=_card(False))):
        await QuoteStepPlugin().before_run_callback(invocation_context=_context(state, words="fatto"))
        await _drain()
    [record] = _steps(caplog)
    assert record.quote_step == "domanda_invio" and record.card_pending is False


async def test_an_unreadable_card_logs_the_step_anyway(caplog):
    caplog.set_level(logging.INFO)
    state = _signed_in({"status": "draft", "version": 1})
    with patch.object(quote_step_plugin, "confirmation_state", AsyncMock(side_effect=RuntimeError("down"))):
        await QuoteStepPlugin().before_run_callback(invocation_context=_context(state, words="fatto"))
        await _drain()
    [record] = _steps(caplog)
    assert record.quote_step == "domanda_invio" and record.card_pending is None


async def test_no_quote_does_not_read_the_card(caplog):
    caplog.set_level(logging.INFO)
    with patch.object(quote_step_plugin, "confirmation_state", AsyncMock()) as read:
        await QuoteStepPlugin().before_run_callback(invocation_context=_context(_signed_in({})))
        await _drain()
    read.assert_not_awaited()


async def test_a_broken_session_never_stops_the_turn(caplog):
    caplog.set_level(logging.INFO)
    context = SimpleNamespace(invocation_id=TURN, user_content=None, session=None)
    assert await QuoteStepPlugin().before_run_callback(invocation_context=context) is None
    assert _steps(caplog) == []
