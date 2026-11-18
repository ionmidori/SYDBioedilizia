"""The quote is sent, then the model times out: the client still reads the confirmation.

Test chat of 18/11 (session_ref 242f0596): `submit_quote_request` sent the quote
at 20:06:41, gemini-3.8-flash then timed out twice (ReadTimeout, 20 s each) and
the client got an error and no saved reply, as if nothing had been sent.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from src.adk.turn_fallback import sent_reply
from src.tools.quote_submit_tools import NOT_SENT_PREFIX, SENT_MARK
from src.utils.circuit_breaker import vertex_ai_breaker
from tests.unit.test_adk_orchestrator import (
    _collect_chunks,
    _make_request_and_user,
    _make_text_event,
    _parse_sse,
    _setup_mocks,
)

SENT = f"{SENT_MARK} Richiesta di preventivo inviata (riferimento PRV-2026-0001). Il nostro team è stato avvisato."
NOT_SENT = f"{NOT_SENT_PREFIX} si è verificato un problema durante l'invio."


@pytest.fixture(autouse=True)
def _fresh_breaker():
    vertex_ai_breaker._failures = 0
    vertex_ai_breaker._state = type(vertex_ai_breaker._state).CLOSED
    vertex_ai_breaker._opened_at = None
    yield
    vertex_ai_breaker._failures = 0
    vertex_ai_breaker._state = type(vertex_ai_breaker._state).CLOSED
    vertex_ai_breaker._opened_at = None


def _tool_response_event(name: str, text: str):
    """A function_response as ADK gives it: a str result wrapped as {"result": ...}."""
    fr = MagicMock()
    fr.name = name
    fr.response = {"result": text}
    fr.call_id = "call-submit-1"
    part = MagicMock()
    part.text = None
    part.function_call = None
    part.function_response = fr
    event = MagicMock()
    event.content = MagicMock(parts=[part])
    event.partial = False
    event.author = "quote"
    event.event_type = None
    return event


async def _events_then_raise(events: list, exc: BaseException):
    for event in events:
        yield event
    raise exc


async def _turn(events: list, exc: BaseException) -> tuple[list, AsyncMock]:
    from src.adk.adk_orchestrator import ADKOrchestrator

    with patch("src.adk.adk_orchestrator.get_session_service") as get_session, \
         patch("src.adk.adk_orchestrator.get_conversation_repository") as get_repo, \
         patch("src.core.config.settings") as settings:
        _setup_mocks(get_session, get_repo, settings)
        orch = ADKOrchestrator.__new__(ADKOrchestrator)
        orch.runner = MagicMock()
        orch.runner.run_async = MagicMock(return_value=_events_then_raise(events, exc))
        req, user = _make_request_and_user()
        parsed = _parse_sse(await _collect_chunks(orch.stream_chat(req, user)))
    return parsed, get_repo.return_value.save_message


def _text(parsed: list) -> str:
    return "".join(p["delta"] for p in parsed if isinstance(p, dict) and p.get("type") == "text-delta")


def _errors(parsed: list) -> list[str]:
    return [p["errorText"] for p in parsed if isinstance(p, dict) and p.get("type") == "error"]


def _assistant_saves(save_message: AsyncMock) -> list[str]:
    return [c.kwargs["content"] for c in save_message.await_args_list if c.kwargs.get("role") == "assistant"]


# ── The reply of the send tool ────────────────────────────────────────────────

def test_the_confirmation_of_a_successful_send_is_the_reply():
    assert sent_reply("submit_quote_request", {"result": SENT}) == SENT
    assert sent_reply("submit_quote_request", SENT) == SENT


def test_a_failed_send_or_another_tool_gives_no_reply():
    assert sent_reply("submit_quote_request", {"result": NOT_SENT}) is None
    assert sent_reply("suggest_quote_items", {"result": SENT}) is None
    assert sent_reply("submit_quote_request", {"status": "error"}) is None
    assert sent_reply(None, None) is None


# ── The turn ──────────────────────────────────────────────────────────────────

async def test_a_model_timeout_after_the_send_streams_and_saves_the_confirmation():
    parsed, save_message = await _turn(
        [_tool_response_event("submit_quote_request", SENT)], httpx.ReadTimeout("")
    )

    assert SENT in _text(parsed)
    assert _errors(parsed) == []
    assert any(SENT in content for content in _assistant_saves(save_message))
    assert vertex_ai_breaker._failures == 1  # the model did fail


async def test_the_180s_timeout_after_the_send_streams_the_confirmation():
    parsed, _ = await _turn([_tool_response_event("submit_quote_request", SENT)], TimeoutError())

    assert SENT in _text(parsed)
    assert _errors(parsed) == []


async def test_the_confirmation_follows_text_shown_before_the_send():
    parsed, _ = await _turn(
        [_make_text_event("Invio la richiesta."), _tool_response_event("submit_quote_request", SENT)],
        httpx.ReadTimeout(""),
    )

    assert _text(parsed).startswith("Invio la richiesta.") and SENT in _text(parsed)


async def test_the_confirmation_is_not_repeated_when_the_model_already_gave_it():
    parsed, _ = await _turn(
        [_tool_response_event("submit_quote_request", SENT), _make_text_event(f"Fatto! {SENT_MARK} Richiesta inviata.")],
        httpx.ReadTimeout(""),
    )

    assert _text(parsed) == f"Fatto! {SENT_MARK} Richiesta inviata."


async def test_a_code_error_after_the_send_is_not_hidden_behind_the_confirmation():
    """Only a model or network failure gets the fallback: a bug keeps the error and its trace."""
    parsed, save_message = await _turn([_tool_response_event("submit_quote_request", SENT)], KeyError("x"))

    assert _errors(parsed) == ["Errore durante la generazione della risposta AI."]
    assert _assistant_saves(save_message) == []


async def test_a_model_timeout_without_a_send_still_streams_the_error():
    parsed, _ = await _turn([], httpx.ReadTimeout(""))

    assert _errors(parsed) == ["Errore durante la generazione della risposta AI."]


async def test_a_model_timeout_after_a_failed_send_streams_the_error():
    """Never a confirmation for a quote that did not leave."""
    parsed, _ = await _turn([_tool_response_event("submit_quote_request", NOT_SENT)], httpx.ReadTimeout(""))

    assert SENT_MARK not in _text(parsed)
    assert _errors(parsed) == ["Errore durante la generazione della risposta AI."]
