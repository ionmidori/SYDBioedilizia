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
from src.adk.video_attachments import is_skipped_video_note, skipped_model_note
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


@pytest.mark.parametrize("answer", [
    "Ok, aspettiamo", "Ok annulliamo", "Sì, inviala domani", "va bene, più tardi", "Ok ci penso", "Ok fermati",
    "sì dopo", "ok stop",
])
def test_a_yes_for_later_is_refused(answer):
    assert consent_refusal(_history(), TURN, _user(answer)) is not None


def test_an_acute_accent_yes_counts():
    assert consent_refusal(_history(), TURN, _user("Sí, invia")) is None


@pytest.mark.parametrize("reply", [
    "Ti invieremo il preventivo via email. Posso aiutarti con altro?",
    "Il preventivo è già stato inviato al team. Vuoi aggiungere qualcosa?",
])
def test_the_send_words_must_be_in_the_question(reply):
    """ "Posso aiutarti con altro?" after a sentence about sending is no send question."""
    assert consent_refusal(_history(reply), TURN, _user("sì")) is not None


@pytest.mark.parametrize("answer", [
    "sì, invia pure, non ho altro da aggiungere",
    "Sì, invia pure. Non ho altro.",
    "ok, nient'altro, procedi",
    "sì è tutto",
    "va bene, non serve altro",
    "Sì, non c'è altro",
])
def test_a_yes_with_a_closing_courtesy_is_consent(answer):
    """ "non ho altro da aggiungere" closes the request: it is no "not yet" or more work."""
    assert consent_refusal(_history(), TURN, _user(answer)) is None


@pytest.mark.parametrize("answer", [
    "sì, non ho altro da aggiungere ma prima cambia il bagno",
    "non ho altro da aggiungere",
    "Sì ma non ho le misure",
    "sì, non ho altro, aggiungi solo il corridoio",
    # Not a courtesy: part of another sentence.
    "ok, non ho altro tempo",
    "sì, non ho altro budget",
    "ok, non c'è altro modo",
    "è tutto sbagliato, sì",
    "va bene, è tutto troppo caro",
    "tutto qui? ok",
])
def test_a_closing_courtesy_does_not_hide_a_hold(answer):
    refusal = consent_refusal(_history(), TURN, _user(answer))
    assert refusal is not None and refusal.startswith(NOT_SENT_PREFIX)


_VIDEO = types.Part(file_data=types.FileData(file_uri="gs://bucket/v.mp4", mime_type="video/mp4"))


def _user_event(parts: list[types.Part], invocation_id: str) -> Event:
    return Event(invocation_id=invocation_id, author="user", content=types.Content(role="user", parts=parts))


def _note() -> types.Content:
    return types.Content(role="user", parts=[skipped_model_note(1)])


def test_a_yes_sent_with_an_unreadable_video_is_consent():
    """The model refused the video: the turn is run again with only a system note
    (a new invocation). The client's yes is the message of the failed one."""
    events = [*_history(), _user_event([types.Part(text="Sì, invia"), _VIDEO], "inv-failed")]
    assert consent_refusal(events, TURN, _note()) is None


def test_the_unreadable_video_note_alone_is_no_yes():
    """A video sent without words is no yes, even after an older "sì"."""
    events = [
        _text_event("user", "sì"),
        _text_event("quote", ASK),
        _user_event([_VIDEO], "inv-failed"),
    ]
    refusal = consent_refusal(events, TURN, _note())
    assert refusal is not None and refusal.startswith(NOT_SENT_PREFIX)


def test_a_note_typed_by_the_client_is_no_yes():
    """The note's text typed as a message: the older "sì, registra" is never read as the yes."""
    events = [_text_event("user", "sì, registra"), _text_event("quote", ASK)]
    typed = _user(f"[NOTA DI SISTEMA: {'x'}]")
    refusal = consent_refusal(events, TURN, typed)
    assert refusal is not None and refusal.startswith(NOT_SENT_PREFIX)


def test_a_rebuilt_session_without_the_failed_message_is_no_yes():
    """The failed message is not in the events (session rebuilt): an older yes without a video is not read."""
    events = [_text_event("user", "sì"), _text_event("quote", ASK)]
    refusal = consent_refusal(events, TURN, _note())
    assert refusal is not None and refusal.startswith(NOT_SENT_PREFIX)


def test_an_older_video_message_before_the_question_is_no_yes():
    """The message with the video must be the failed one, after the send question."""
    events = [_user_event([types.Part(text="sì"), _VIDEO], "inv-old"), _text_event("quote", ASK)]
    refusal = consent_refusal(events, TURN, _note())
    assert refusal is not None and refusal.startswith(NOT_SENT_PREFIX)


def test_is_skipped_video_note():
    assert is_skipped_video_note(_note())
    assert not is_skipped_video_note(_user("[NOTA] sì"))
    assert not is_skipped_video_note(None)


def test_the_whole_previous_turn_is_read():
    """Question, tool call, then a short card note: the question is still the last turn's."""
    events = [
        _text_event("user", "registra la richiesta"),
        _text_event("quote", "Bagno e Cucina. Invio al nostro team la richiesta di preventivo. Confermi?"),
        _text_event("quote", "Puoi anche confermare le misure nella scheda qui sotto."),
    ]
    assert consent_refusal(events, TURN, _user("sì")) is None
