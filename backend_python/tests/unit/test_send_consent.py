"""
submit_quote_request sends only on the client's explicit yes (PR 1 · B).

The prompt rule ("call it only after an explicit yes") was not enough: in an
eval the agent sent the quote in the turn the client asked to register it.
The tool now checks the conversation itself: the previous assistant reply asked
to send, the current user message is an explicit yes, and suggest_quote_items
did not run in this turn.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.adk.events import Event
from google.genai import types
from src.adk import tools
from src.tools.quote_submit_tools import NOT_SENT_PREFIX
from src.tools.send_consent import consent_refusal
from tests.unit.send_consent_fakes import EXPLICIT_YES as YES
from tests.unit.send_consent_fakes import TURN
from tests.unit.send_consent_fakes import text_event as _text_event
from tests.unit.send_consent_fakes import user_message as _user

ASK = "Bagno: rifacimento completo; Cucina: top in quarzo. Invio al nostro team la richiesta di preventivo. Confermi?"


def _call_event(name: str, invocation_id: str = TURN) -> Event:
    return Event(
        invocation_id=invocation_id,
        author="quote",
        content=types.Content(role="model", parts=[types.Part(function_call=types.FunctionCall(name=name, args={}))]),
    )


def _history(ask: str = ASK) -> list[Event]:
    return [_text_event("user", "registra la richiesta"), _text_event("quote", ask)]


def test_an_explicit_yes_to_the_send_question_is_consent():
    assert consent_refusal([*_history(), _text_event("user", YES, TURN)], TURN, _user(YES)) is None


@pytest.mark.parametrize("ask", [
    "Vuoi che invii la richiesta al team?",
    "Procedo con l'invio al nostro team?",
])
def test_other_wordings_of_the_send_question_count(ask):
    assert consent_refusal(_history(ask), TURN, _user("sì")) is None


@pytest.mark.parametrize("answer", [
    "registra adesso la richiesta",
    "prepara il preventivo",
    "Sì, ma aggiungi anche il corridoio",
    "no, aspetta",
    "Non ancora",
    "si può aggiungere il balcone?",
    "Ho confermato le misure nella scheda",
])
def test_anything_but_an_explicit_yes_is_refused(answer):
    refusal = consent_refusal(_history(), TURN, _user(answer))
    assert refusal is not None and refusal.startswith(NOT_SENT_PREFIX)


def test_a_yes_to_another_question_is_refused():
    history = _history("Ho registrato la richiesta. Vuoi aggiungere altri lavori?")
    assert consent_refusal(history, TURN, _user("sì")) is not None


def test_a_yes_without_a_previous_reply_is_refused():
    assert consent_refusal([], TURN, _user("sì, invia")) is not None


def test_the_question_is_read_from_the_last_reply_before_this_turn():
    """The current turn's own text (e.g. the agent's summary before the call) and
    its thoughts do not count: only what the client saw before answering."""
    events = [
        *_history("Ho registrato la richiesta."),
        _text_event("quote", "Invio al team. Confermi?", TURN),
        _text_event("quote", "Devo chiedere l'invio? Confermi?", "inv-before", thought=True),
    ]
    assert consent_refusal(events, TURN, _user("sì")) is not None


def test_a_send_in_the_same_turn_as_suggest_quote_items_is_refused():
    events = [*_history(), _call_event("suggest_quote_items")]
    refusal = consent_refusal(events, TURN, _user("sì"))
    assert refusal is not None and "registrata" in refusal


# ─── the ADK tool ────────────────────────────────────────────────────────────

def _tool_context(events: list[Event], user_text: str) -> MagicMock:
    ctx = MagicMock()
    ctx.session.id = "sess-1"
    ctx.session.events = events
    ctx.invocation_id = TURN
    ctx.user_content = _user(user_text)
    ctx.user_id = "uid-1"
    return ctx


@pytest.fixture(autouse=True)
def _registered_user():
    with patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)):
        yield


async def test_the_tool_sends_after_the_explicit_yes():
    wrapper = AsyncMock(return_value="✅ inviata")
    with patch.object(tools, "submit_quote_request_wrapper", new=wrapper):
        out = await tools.submit_quote_request(session_id="sess-1", tool_context=_tool_context(_history(), YES))
    assert out == "✅ inviata"
    wrapper.assert_awaited_once()


async def test_the_tool_sends_nothing_without_the_yes():
    wrapper = AsyncMock(return_value="✅ inviata")
    with patch.object(tools, "submit_quote_request_wrapper", new=wrapper):
        out = await tools.submit_quote_request(
            session_id="sess-1", tool_context=_tool_context(_history(), "registra la richiesta")
        )
    assert out.startswith(NOT_SENT_PREFIX)
    wrapper.assert_not_awaited()


@pytest.mark.parametrize("answer", ["volentieri", "Esatto, invia", "assolutamente sì", "giusto, procedi"])
def test_other_plain_yes_words_count(answer):
    """Refusing a plain "volentieri" would loop: the agent asks again, the client says it again."""
    assert consent_refusal(_history(), TURN, _user(answer)) is None


@pytest.mark.parametrize("answer", ["sì, e anche il soggiorno", "sì, invece del bagno fai la cucina", "sì ma ho un dubbio"])
def test_a_yes_with_more_work_or_a_doubt_is_refused(answer):
    assert consent_refusal(_history(), TURN, _user(answer)) is not None


def test_a_send_word_about_something_else_is_no_send_question():
    """ "Vuoi inviare altre foto?" is not the question about sending the request."""
    assert consent_refusal(_history("Vuoi inviare altre foto del bagno?"), TURN, _user("sì")) is not None
