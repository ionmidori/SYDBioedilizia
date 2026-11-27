"""
QuoteStepPlugin logs the step of the quote once per turn (strada B, passo 1):
no id in the line (session_ref is added by the formatter), never a change to
the turn, never an error that stops it. The card of a draft comes from the
session state (the orchestrator reads it before the turn), never from Firestore.
"""
import asyncio
import logging
import uuid
from types import SimpleNamespace

import pytest
from src.adk.quote_step_plugin import QuoteStepPlugin
from src.adk.session_context import CARD_PENDING_STATE_KEY, HOUSE_QUOTE_STATE_KEY, SESSION_CONTEXT_STATE_KEY
from src.core.context import set_request_id
from tests.unit.adk_event_fakes import TURN, text_event, user_message


@pytest.fixture(autouse=True)
def _no_request():
    """Other tests leave a request id behind: start each test outside a request."""
    set_request_id("system")


def _context(state: dict, events: list | None = None, words: str = "sì") -> SimpleNamespace:
    return SimpleNamespace(
        invocation_id=TURN,
        user_content=user_message(words),
        session=SimpleNamespace(id="proj-1", state=state, events=events or []),
    )


def _signed_in(quote: dict | None = None, card: bool | None = None) -> dict:
    state: dict = {SESSION_CONTEXT_STATE_KEY: {"is_guest": False, "phone_on_file": True, "session_id": "proj-1"}}
    if quote is not None:
        state[HOUSE_QUOTE_STATE_KEY] = quote
    state[CARD_PENDING_STATE_KEY] = card
    return state


def _steps(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [r for r in caplog.records if getattr(r, "event", None) == "quote_step"]


async def test_the_step_is_logged_once_without_ids(caplog):
    caplog.set_level(logging.INFO)
    events = [text_event("user", "rifare il bagno"), text_event("quote", "Quanti metri quadri è?")]
    context = _context(_signed_in({}), events, words="registra la richiesta")
    result = await QuoteStepPlugin().before_run_callback(invocation_context=context)
    assert result is None
    [record] = _steps(caplog)
    assert record.quote_step == "registra"
    assert "proj-1" not in record.getMessage() and "proj-1" not in str(record.__dict__)


@pytest.mark.parametrize(("quote", "read"), [({}, True), (None, False)])
async def test_the_line_says_whether_the_house_quote_was_read(caplog, quote, read):
    """An unreadable quote (None in state) is computed as no quote: the line says so."""
    caplog.set_level(logging.INFO)
    state = _signed_in()
    state[HOUSE_QUOTE_STATE_KEY] = quote
    await QuoteStepPlugin().before_run_callback(invocation_context=_context(state))
    [record] = _steps(caplog)
    assert record.quote_read is read


async def test_a_turn_without_session_facts_is_not_logged(caplog):
    caplog.set_level(logging.INFO)
    await QuoteStepPlugin().before_run_callback(invocation_context=_context({}))
    assert _steps(caplog) == []


@pytest.mark.parametrize(("card", "step"), [(True, "scheda"), (False, "riepilogo"), (None, "riepilogo")])
async def test_the_card_of_a_draft_comes_from_the_state(caplog, card, step):
    caplog.set_level(logging.INFO)
    state = _signed_in({"status": "draft", "version": 1, "quote_number": "PRV-2026-0001"}, card=card)
    await QuoteStepPlugin().before_run_callback(invocation_context=_context(state, words="fatto"))
    [record] = _steps(caplog)
    assert record.quote_step == step and record.card_pending is card


async def test_a_turn_run_again_logs_its_step_once(caplog):
    """The retry without the refused videos (or after a lost session) runs the
    plugin again in the same request: one line per turn."""
    caplog.set_level(logging.INFO)
    plugin = QuoteStepPlugin()
    set_request_id(f"req-{uuid.uuid4().hex}")
    # Each run may be in its own copied context (a task): the first mark must still count.
    for _ in range(2):
        await asyncio.create_task(plugin.before_run_callback(invocation_context=_context(_signed_in({}))))
    assert len(_steps(caplog)) == 1
    set_request_id(f"req-{uuid.uuid4().hex}")
    await plugin.before_run_callback(invocation_context=_context(_signed_in({})))
    assert len(_steps(caplog)) == 2


async def test_runs_without_a_request_are_all_logged(caplog):
    """Evals and tests have no request id ("system"): nothing to tell apart."""
    caplog.set_level(logging.INFO)
    plugin = QuoteStepPlugin()
    set_request_id("system")
    await plugin.before_run_callback(invocation_context=_context(_signed_in({})))
    await plugin.before_run_callback(invocation_context=_context(_signed_in({})))
    assert len(_steps(caplog)) == 2


async def test_a_broken_session_never_stops_the_turn(caplog):
    caplog.set_level(logging.INFO)
    context = SimpleNamespace(invocation_id=TURN, user_content=None, session=None)
    assert await QuoteStepPlugin().before_run_callback(invocation_context=context) is None
    assert _steps(caplog) == []
