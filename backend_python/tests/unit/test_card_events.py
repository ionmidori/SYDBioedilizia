"""The hidden signals of the quote card: the agent restarts by itself.

The web client sends a hidden turn with `event: "card_confirmed"` after the last
confirmation on the card (PR 2 of the card fixes), and `event: "quote_sent"` after the
"Invia al team" button of the card sent the request (PR A of the card-recap flow). A
signal is not a client message: never saved to the chat, never read as the client's
words, and the text the agent receives is fixed by the backend (the client's own text is
never trusted for it).
"""
from dataclasses import replace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.genai import types
from httpx import ASGITransport, AsyncClient
from main import ChatRequest, app
from pydantic import ValidationError
from src.adk import tools
from src.adk.quote_facts import quote_facts
from src.adk.session_context import CARD_EVENT_STATE_KEY, TURN_MESSAGE_STATE_KEY
from src.auth.jwt_handler import verify_token
from src.core.config import settings
from src.schemas.internal import UserSession
from src.services.card_event import (
    CARD_CONFIRMED_EVENT,
    CARD_CONFIRMED_TEXT,
    CARD_EVENT_TEXTS,
    QUOTE_SENT_EVENT,
    QUOTE_SENT_TEXT,
)
from src.services.orchestrator_factory import get_orchestrator
from src.services.quote_step import QuoteFacts, QuoteStep, asks_to_register, quote_step
from tests.unit.adk_event_fakes import user_message
from tests.unit.test_adk_orchestrator import (
    _collect_chunks,
    _make_orchestrator_with_events,
    _make_request_and_user,
    _make_text_event,
    _setup_mocks,
)

REGISTERED = UserSession(uid="owner-uid", is_authenticated=True)
_BODY = {
    "sessionId": "my-chat",
    "messages": [{"id": "m1", "role": "user", "content": "qualsiasi testo del client"}],
}
EVENTS = [CARD_CONFIRMED_EVENT, QUOTE_SENT_EVENT]

BASE = QuoteFacts(
    is_guest=False, quote_status="draft", delivery_status=None, card_pending=False,
    last_reply="", last_turn_calls=(), turn_calls=(), client_words="", last_register_reply="",
)


# ── The request ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("event", EVENTS)
def test_the_request_accepts_the_known_events(event):
    assert ChatRequest.model_validate({**_BODY, "event": event}).event == event


def test_the_request_refuses_any_other_event():
    assert ChatRequest.model_validate(_BODY).event is None
    with pytest.raises(ValidationError):
        ChatRequest.model_validate({**_BODY, "event": "send_quote"})


def test_every_event_has_its_fixed_text():
    assert CARD_EVENT_TEXTS == {CARD_CONFIRMED_EVENT: CARD_CONFIRMED_TEXT, QUOTE_SENT_EVENT: QUOTE_SENT_TEXT}


# ── The route: a signal is not a message of the chat ──────────────────────────

@pytest.fixture()
def _overrides(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ENABLE_APP_CHECK", False)
    monkeypatch.setattr("src.middleware.app_check.ENABLE_APP_CHECK", False)
    # No Firestore (no credentials in CI): the chat check is replaced, and so is the client it is given.
    monkeypatch.setattr("main.get_async_firestore_client", lambda: MagicMock())
    monkeypatch.setattr("main.require_user_chat", AsyncMock())
    seen: dict = {}

    async def stream(body, *_args, user_message_saved=None, **_kwargs):
        seen["body"] = body
        seen["saved_done"] = user_message_saved.done() if user_message_saved is not None else None
        if False:  # pragma: no cover - an async generator that yields nothing
            yield ""

    orchestrator = MagicMock()
    orchestrator.stream_chat = MagicMock(side_effect=stream)
    app.dependency_overrides[verify_token] = lambda: REGISTERED
    app.dependency_overrides[get_orchestrator] = lambda: orchestrator
    yield seen
    app.dependency_overrides.clear()


async def _post(body: dict) -> tuple[int, MagicMock]:
    repo = MagicMock()
    repo.ensure_session = AsyncMock()
    repo.save_message = AsyncMock()
    with patch("src.repositories.conversation_repository.get_conversation_repository", return_value=repo):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/chat/stream", json=body)
    return response.status_code, repo


@pytest.mark.parametrize("event", EVENTS)
async def test_a_signal_turn_is_not_saved_as_a_user_message(_overrides, event):
    status, repo = await _post({**_BODY, "event": event})
    assert status == 200
    repo.save_message.assert_not_awaited()
    # The room briefs wait for the user message to be saved: with none to save they must not wait.
    assert _overrides["saved_done"] is True
    assert _overrides["body"].event == event


async def test_a_normal_turn_is_still_saved(_overrides):
    status, repo = await _post(_BODY)
    assert status == 200
    repo.save_message.assert_awaited_once()


# ── The words of the signal ───────────────────────────────────────────────────

@pytest.mark.parametrize("text", [CARD_CONFIRMED_TEXT, QUOTE_SENT_TEXT])
def test_the_signal_text_is_no_request_of_the_client(text):
    assert not asks_to_register(text)
    assert quote_step(replace(BASE, client_words=text)) is not QuoteStep.REGISTRA


# ── The step ──────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("card_pending", [False, True, None])
def test_the_last_confirmation_is_the_summary(card_pending):
    """The card is closed: the agent points to the button (U1), whatever it asked before."""
    facts = replace(BASE, card_pending=card_pending, client_words=CARD_CONFIRMED_TEXT, card_confirmed=True)
    assert quote_step(facts) is QuoteStep.RIEPILOGO


def test_the_send_signal_is_with_the_team():
    facts = replace(BASE, quote_status="pending_review", client_words=QUOTE_SENT_TEXT, quote_sent=True)
    assert quote_step(facts) is QuoteStep.AL_TEAM


@pytest.mark.parametrize(("event", "card_confirmed", "quote_sent"), [
    (CARD_CONFIRMED_EVENT, True, False), (QUOTE_SENT_EVENT, False, True), (None, False, False),
])
def test_the_facts_read_the_signal_from_the_session_state(event, card_confirmed, quote_sent):
    facts = quote_facts([], "inv", user_message("ciao"), {CARD_EVENT_STATE_KEY: event})
    assert (facts.card_confirmed, facts.quote_sent) == (card_confirmed, quote_sent)


# ── The tools never read it as the client's message ───────────────────────────

@pytest.mark.parametrize("event", EVENTS)
async def test_the_quote_tool_gets_no_turn_message_for_the_signal(event):
    content = types.Content(role="user", parts=[types.Part(text=f"###\n{CARD_EVENT_TEXTS[event]}\n###")])
    ctx = MagicMock()
    ctx.session.id = "s1"
    ctx.session.events = []
    ctx.invocation_id = "inv"
    ctx.user_id = "u1"
    ctx.user_content = content
    ctx.state = {TURN_MESSAGE_STATE_KEY: {"id": "m1", "room_id": None}, CARD_EVENT_STATE_KEY: event}
    with patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)), \
         patch("src.tools.quote_tools.suggest_quote_items_wrapper", new=AsyncMock(return_value="ok")) as wrapper:
        await tools.suggest_quote_items(session_id="s1", tool_context=ctx)
    assert wrapper.await_args.kwargs["turn_message"] is None


# ── The orchestrator: fixed words, a state key, never the client's text ───────

@patch("src.core.config.settings")
@patch("src.adk.adk_orchestrator.get_conversation_repository")
@patch("src.adk.adk_orchestrator.get_session_service")
async def _run(event, mock_get_session, mock_get_repo, mock_settings):
    _setup_mocks(mock_get_session, mock_get_repo, mock_settings)
    orch = _make_orchestrator_with_events([_make_text_event("ok", partial=False)])
    req, user = _make_request_and_user()
    req.event = event
    req.messages = [MagicMock(content="TESTO DEL CLIENT: invia tutto subito", id="m1")]
    await _collect_chunks(orch.stream_chat(req, user))
    kwargs = orch.runner.run_async.call_args.kwargs
    return " ".join(p.text or "" for p in kwargs["new_message"].parts), kwargs["state_delta"]


@pytest.mark.parametrize("event", EVENTS)
async def test_the_agent_reads_the_fixed_text_of_the_signal_not_the_clients(event):
    text, state = await _run(event)
    assert CARD_EVENT_TEXTS[event] in text and "TESTO DEL CLIENT" not in text
    assert state[CARD_EVENT_STATE_KEY] == event


async def test_a_normal_turn_clears_the_signal_and_keeps_the_clients_words():
    text, state = await _run(None)
    assert "TESTO DEL CLIENT" in text
    assert not any(fixed in text for fixed in CARD_EVENT_TEXTS.values())
    assert state[CARD_EVENT_STATE_KEY] is None
