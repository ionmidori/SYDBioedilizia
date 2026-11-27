"""
The step of the quote, computed by code.

Flow of 27 Nov (plan "card-recap-flow", PR A): collect → (a guest logs in) →
register → the card is the summary → "Invia al team" on the card. No question
to register, no phone step, no send question: the click on the card is the consent.
One test per arrow, then the edge cases: session rebuilt without history, the
completeness gate, the hidden signals of the card.
"""
import ast
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pytest
from google.adk.events import Event
from google.genai import types
from src.adk.quote_facts import quote_facts
from src.adk.session_context import CARD_EVENT_STATE_KEY, HOUSE_QUOTE_STATE_KEY
from src.adk.video_attachments import skipped_model_note
from src.services import quote_step as quote_step_module
from src.services.quote_step import (
    NEEDS_DETAILS,
    STEP_REFUSED_PREFIX,
    QuoteFacts,
    QuoteStep,
    quote_step,
)
from src.tools.quote_tools import _rooms_reply, _single_unit_reply
from tests.unit.adk_event_fakes import TURN, text_event, user_message

BASE = QuoteFacts(
    is_guest=False,
    quote_status=None,
    delivery_status=None,
    card_pending=None,
    last_reply="",
    last_turn_calls=(),
    turn_calls=(),
    client_words="",
    last_register_reply="",
)


def _step(**changes) -> QuoteStep:
    return quote_step(replace(BASE, **changes))


def test_the_step_is_a_service_without_adk():
    """The services layer does not import the ADK layer: the facts are read from the
    session in src/adk/quote_facts.py, the step is computed here."""
    tree = ast.parse(Path(quote_step_module.__file__).read_text(encoding="utf-8"))
    imported = [n.module or "" for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)]
    imported += [a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names]
    assert not [m for m in imported if m.startswith(("src.adk", "google.adk"))]


def test_the_steps_of_the_card_flow():
    """No registration question, no phone step, no send question (U1, U2)."""
    assert [s.value for s in QuoteStep] == [
        "raccolta", "accesso", "registra", "scheda", "riepilogo", "al_team", "inoltro",
    ]


# ── RACCOLTA ──────────────────────────────────────────────────────────────────

def test_a_new_chat_collects_the_works():
    assert _step(client_words="vorrei rifare il bagno") is QuoteStep.RACCOLTA


@pytest.mark.parametrize("answer", ["sì", "3331234567", "no grazie"])
def test_the_answers_while_collecting_keep_collecting(answer):
    """The model decides when the data are enough and calls the tool (U2): no yes moves the step."""
    assert _step(last_reply="Quanti metri quadri è il bagno?", client_words=answer) is QuoteStep.RACCOLTA


@pytest.mark.parametrize("words", ["prepara il preventivo", "registra la richiesta", "fammi il preventivo"])
def test_an_explicit_request_registers(words):
    assert _step(client_words=words) is QuoteStep.REGISTRA


def test_a_request_with_a_no_is_no_request():
    assert _step(client_words="non preparare ancora il preventivo") is QuoteStep.RACCOLTA


def test_a_negative_request_is_no_request():
    assert _step(client_words="non fatemi ancora il preventivo") is QuoteStep.RACCOLTA


def test_a_request_asked_as_a_question_is_no_request():
    assert _step(client_words="Registra la richiesta anche per la cucina?") is QuoteStep.RACCOLTA


def test_a_no_elsewhere_in_the_message_keeps_the_request():
    assert _step(client_words="prepara il preventivo, non serve altro") is QuoteStep.REGISTRA


@pytest.mark.parametrize("words", [
    "Posso registrare un video per il preventivo?",
    "Cosa devo preparare per il preventivo?",
    "Quando mi fate avere il preventivo",
])
def test_a_question_about_the_quote_is_no_request(words):
    assert _step(is_guest=True, client_words=words) is QuoteStep.RACCOLTA


def test_a_phone_saved_while_collecting_keeps_collecting():
    """The phone is asked once while collecting (U2): saving it moves nothing."""
    words = "bagno 6 m², rifare il pavimento, il mio numero è 3331234567"
    assert _step(client_words=words, turn_calls=("save_contact_phone",)) is QuoteStep.RACCOLTA


# ── ACCESSO (a guest) ─────────────────────────────────────────────────────────

def test_a_guest_asking_for_the_quote_logs_in():
    assert _step(is_guest=True, client_words="prepara il preventivo") is QuoteStep.ACCESSO


def test_a_guest_whose_collection_is_complete_logs_in():
    """The model tried to register: the gate refused it for a guest, so the login comes next."""
    assert _step(is_guest=True, register_refused=True) is QuoteStep.ACCESSO


LOGIN_ASK = (  # quote_step.LOGIN_MESSAGE
    "Per registrare la richiesta di preventivo serve un account gratuito — bastano pochi secondi! "
    "Accedi qui sotto e riprendo subito da qui."
)
RENDER_LOGIN = "Per creare il rendering serve un account gratuito. Accedi qui sotto e riprendo subito da qui."


def test_a_guest_stays_at_the_login_until_signed_in():
    step = _step(is_guest=True, last_reply=LOGIN_ASK, last_turn_calls=("request_login",), client_words="ok")
    assert step is QuoteStep.ACCESSO


def test_a_login_for_a_render_is_no_quote_step():
    assert _step(last_reply=RENDER_LOGIN, last_turn_calls=("request_login",), client_words="fatto") is (
        QuoteStep.RACCOLTA
    )


def test_the_login_in_this_turn_is_the_login_step():
    assert _step(is_guest=True, turn_calls=("request_login",)) is QuoteStep.ACCESSO


@pytest.mark.parametrize("phone_on_file", [True, False])
def test_after_the_login_the_request_is_registered(phone_on_file):
    """L (login fatto) -> S: no confirmation and no phone step in between."""
    step = _step(last_reply=LOGIN_ASK, last_turn_calls=("request_login",), client_words="fatto")
    assert step is QuoteStep.REGISTRA


def test_a_session_rebuilt_after_the_login_reads_the_login_message():
    """History restored from Firestore keeps no tool calls (a guest who logs in
    to an existing account gets a new session): the message is the trace."""
    assert _step(last_reply=LOGIN_ASK, client_words="fatto") is QuoteStep.REGISTRA


def test_a_rebuilt_session_after_a_render_login_is_no_quote_step():
    assert _step(last_reply=RENDER_LOGIN, client_words="fatto") is QuoteStep.RACCOLTA


# ── SCHEDA / RIEPILOGO ────────────────────────────────────────────────────────

def test_the_registration_in_this_turn_leads_to_the_card():
    assert _step(client_words="bagno 6 mq", turn_calls=("suggest_quote_items",)) is QuoteStep.SCHEDA


def test_a_draft_with_something_to_answer_is_at_the_card():
    assert _step(quote_status="draft", card_pending=True, client_words="ok") is QuoteStep.SCHEDA


@pytest.mark.parametrize("card_pending", [False, None])
def test_a_draft_with_nothing_to_answer_is_the_summary(card_pending):
    """The card is complete (or could not be read): the client sends it with the button."""
    assert _step(quote_status="draft", card_pending=card_pending, client_words="ok") is QuoteStep.RIEPILOGO


@pytest.mark.parametrize("words", ["invia", "sì, invia la richiesta", "Confermo"])
def test_a_yes_on_a_draft_is_still_the_summary(words):
    """U1: no send from the chat; the agent points to the button."""
    assert _step(quote_status="draft", card_pending=False, client_words=words) is QuoteStep.RIEPILOGO


@pytest.mark.parametrize("card_pending", [True, False])
def test_more_work_on_a_draft_goes_back_to_collecting(card_pending):
    step = _step(quote_status="draft", card_pending=card_pending, client_words="aggiungi anche la cucina")
    assert step is QuoteStep.RACCOLTA


def test_a_courtesy_that_closes_the_request_is_no_change():
    step = _step(quote_status="draft", card_pending=False, client_words="ok, non ho altro da aggiungere")
    assert step is QuoteStep.RIEPILOGO


def test_a_change_after_a_courtesy_is_still_a_change():
    step = _step(quote_status="draft", card_pending=False, client_words="è tutto, ma cambia il pavimento")
    assert step is QuoteStep.RACCOLTA


def test_an_explicit_request_on_a_draft_registers_again():
    assert _step(quote_status="draft", card_pending=False, client_words="registra la richiesta") is QuoteStep.REGISTRA


@pytest.mark.parametrize("card_pending", [False, True, None])
def test_the_card_confirmed_signal_is_the_summary(card_pending):
    step = _step(quote_status="draft", card_pending=card_pending, card_confirmed=True,
                 client_words="Evento di sistema: il cliente ha confermato tutte le sezioni della scheda.")
    assert step is QuoteStep.RIEPILOGO


# ── AL TEAM / INOLTRO ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("status", ["pending_review", "in_review", "approved"])
def test_a_quote_with_the_team_is_with_the_team(status):
    assert _step(quote_status=status, client_words="a che punto siamo?") is QuoteStep.AL_TEAM


def test_a_sent_quote_still_in_the_mail_is_with_the_team():
    assert _step(quote_status="sent", delivery_status="queued", client_words="ciao") is QuoteStep.AL_TEAM


@pytest.mark.parametrize("status", ["pending_review", None, "draft"])
def test_the_quote_sent_signal_is_with_the_team(status):
    """The button sent it: the turn only confirms, even if the quote read before the turn is older."""
    step = _step(quote_status=status, quote_sent=True,
                 client_words="Evento di sistema: il cliente ha inviato la richiesta al team dalla scheda.")
    assert step is QuoteStep.AL_TEAM


@pytest.mark.parametrize("words", ["aggiungi anche il balcone", "vorrei cambiare le piastrelle", "prepara il preventivo"])
def test_new_requests_with_the_team_are_relayed(words):
    assert _step(quote_status="in_review", client_words=words) is QuoteStep.INOLTRO


def test_a_no_with_the_team_is_no_new_request():
    assert _step(quote_status="in_review", client_words="no grazie, aspetto") is QuoteStep.AL_TEAM


@pytest.mark.parametrize("words", ["Grazie anche a te!", "Quando mi fate avere il preventivo?"])
def test_thanks_or_a_question_with_the_team_is_no_new_request(words):
    assert _step(quote_status="in_review", client_words=words) is QuoteStep.AL_TEAM


def test_the_relay_in_this_turn_is_the_relay_step():
    assert _step(quote_status="pending_review", turn_calls=("suggest_quote_items",)) is QuoteStep.INOLTRO


@pytest.mark.parametrize("status", ["sent", "rejected"])
def test_a_sent_or_rejected_quote_starts_collecting_again(status):
    """The next revision is a new request."""
    assert _step(quote_status=status, delivery_status="delivered", client_words="vorrei aggiungere la cucina") is (
        QuoteStep.RACCOLTA
    )


def test_a_deleted_quote_is_no_quote():
    assert _step(quote_status="deleted", client_words="ciao") is QuoteStep.RACCOLTA


# ── edge cases ────────────────────────────────────────────────────────────────

def test_a_session_rebuilt_without_history_reads_the_stored_quote():
    """No last reply: the step comes from Firestore (the draft and its card)."""
    assert _step(quote_status="draft", card_pending=True, last_reply="") is QuoteStep.SCHEDA


# ── after the completeness gate: the answer is registered ────────────────────

# What suggest_quote_items answered in the test chat of 18/11 (turn 8).
GATE_REPLY = (
    "Prima di prepararti un preventivo accurato per tutta la casa ho bisogno di qualche dettaglio in più.\n\n"
    "**Soggiorno**: Quali interventi vorresti realizzare nel soggiorno?"
)
GATED = {"last_turn_calls": ("suggest_quote_items",), "last_register_reply": GATE_REPLY}


@pytest.mark.parametrize("answer", ["Il soggiorno non lo includere", "Sì lascia solo camera da letto e bagno"])
def test_the_answer_to_the_gate_registers(answer):
    """The tool asked instead of registering: the answer goes back to it (turns 9 and 10)."""
    assert _step(quote_status="sent", client_words=answer, **GATED) is QuoteStep.REGISTRA


def test_the_answer_to_the_gate_on_a_draft_registers():
    step = _step(quote_status="draft", card_pending=True, client_words="il soggiorno non lo includere", **GATED)
    assert step is QuoteStep.REGISTRA


def test_a_rebuilt_session_reads_the_gate_in_the_reply():
    """No tool calls after a rebuild from Firestore: the model copied the questions."""
    assert _step(last_reply=GATE_REPLY, client_words="il soggiorno è 20 mq") is QuoteStep.REGISTRA


def test_a_guest_answering_the_gate_still_logs_in():
    assert _step(is_guest=True, last_reply=GATE_REPLY, client_words="20 mq") is QuoteStep.ACCESSO


def test_a_change_at_the_gate_goes_back_to_collecting():
    assert _step(client_words="aggiungi anche il soggiorno, 20 mq", **GATED) is QuoteStep.RACCOLTA


def test_a_registered_draft_is_not_a_gate():
    """The last turn registered (no questions): the client is at the summary."""
    step = _step(quote_status="draft", card_pending=False, client_words="ok",
                 last_turn_calls=("suggest_quote_items",), last_register_reply="Ho registrato la nuova revisione.")
    assert step is QuoteStep.RIEPILOGO


def _gated_unit() -> SimpleNamespace:
    return SimpleNamespace(
        needs_info=True, proposed_lines=True, questions=["Quanti metri quadri?"], asks_card=False,
        unit=SimpleNamespace(room=None), unknown_skus=[], expansion=SimpleNamespace(missing_measures=[]),
        analysis=SimpleNamespace(summary="bagno", packages=["p"], suggestions=[], missing_info=["mq"],
                                 completeness_score=0.5),
    )


def test_the_gate_replies_of_the_tool_carry_the_marker():
    """The rule reads the tool's own words: they come from the same constant."""
    for reply in (_rooms_reply([_gated_unit()]), _single_unit_reply(_gated_unit())):
        assert reply is not None and NEEDS_DETAILS in reply


def test_the_step_is_a_plain_string_for_the_log():
    assert QuoteStep.RIEPILOGO == "riepilogo"


def test_a_draft_left_without_lines_by_a_clear_is_collected_again_not_sent():
    """Review finding (PR 3): after a full clear the draft has no lines: never the summary to send."""
    step = _step(quote_status="draft", card_pending=False, client_words="ciao", quote_empty=True)
    assert step is QuoteStep.RACCOLTA


# ── facts from the ADK session ────────────────────────────────────────────────

def _call(name: str, invocation_id: str, call_id: str | None = None) -> Event:
    return Event(
        invocation_id=invocation_id,
        author="quote",
        content=types.Content(role="model", parts=[
            types.Part(function_call=types.FunctionCall(id=call_id, name=name, args={})),
        ]),
    )


def _response(name: str, invocation_id: str, result: object, call_id: str | None = None) -> Event:
    return Event(
        invocation_id=invocation_id,
        author="quote",
        content=types.Content(role="user", parts=[
            types.Part(function_response=types.FunctionResponse(id=call_id, name=name, response=result)),
        ]),
    )


def test_facts_read_the_session():
    ask = "Quanti metri quadri è il bagno?"
    events = [
        text_event("user", "vorrei rifare il bagno"),
        _call("request_login", "inv-before"),
        text_event("quote", ask),
        text_event("user", "6", TURN),
        _call("save_contact_phone", TURN),
    ]
    state = {
        "syd_session_context": {"is_guest": False, "phone_on_file": True, "session_id": "s"},
        "syd_house_quote": {"quote_number": "PRV-2026-0001", "status": "draft", "version": 1,
                            "delivery_status": None},
        "syd_card_pending": True,  # read by the orchestrator before the turn
    }
    facts = quote_facts(events, TURN, user_message("###\n6\n###"), state)
    assert facts == QuoteFacts(
        is_guest=False, quote_status="draft", delivery_status=None, card_pending=True,
        last_reply=ask, last_turn_calls=("request_login",), turn_calls=("save_contact_phone",),
        client_words="###\n6\n###", last_register_reply="",
    )


def test_facts_read_a_registration_the_gate_refused_in_this_turn():
    refusal = {"result": f"{STEP_REFUSED_PREFIX} (passo: raccolta): il cliente è un ospite…"}
    events = [
        text_event("user", "bagno 6 mq a Roma", TURN),
        _call("suggest_quote_items", TURN, "c-1"),
        _response("suggest_quote_items", TURN, refusal, "c-1"),
    ]
    facts = quote_facts(events, TURN, user_message("bagno 6 mq a Roma"), {}, answered_only=True)
    assert facts.register_refused and facts.turn_calls == ()


def test_facts_ignore_a_refusal_of_an_older_turn():
    refusal = {"result": f"{STEP_REFUSED_PREFIX} (passo: raccolta): …"}
    events = [_call("suggest_quote_items", "inv-old", "c-1"), _response("suggest_quote_items", "inv-old", refusal, "c-1")]
    assert not quote_facts(events, TURN, user_message("ok"), {}).register_refused


@pytest.mark.parametrize(("event", "card_confirmed", "quote_sent"), [
    ("card_confirmed", True, False), ("quote_sent", False, True), (None, False, False),
])
def test_facts_read_the_hidden_signal(event, card_confirmed, quote_sent):
    facts = quote_facts([], TURN, None, {CARD_EVENT_STATE_KEY: event})
    assert (facts.card_confirmed, facts.quote_sent) == (card_confirmed, quote_sent)


def test_facts_without_session_context_are_a_guest_without_quote():
    facts = quote_facts([], TURN, user_message("ciao"), {})
    assert facts.is_guest and facts.quote_status is None


def test_facts_of_an_unreadable_quote_are_no_quote():
    state = {"syd_session_context": {"is_guest": False}, "syd_house_quote": None}
    assert quote_facts([], TURN, user_message("ciao"), state).quote_status is None


def test_facts_of_a_turn_without_its_video_read_the_failed_message():
    ask = "Quanti metri quadri è il bagno?"
    failed = types.Content(role="user", parts=[
        types.Part(text="###\n6\n###"),
        types.Part(file_data=types.FileData(file_uri="gs://b/v.mp4", mime_type="video/mp4")),
    ])
    events = [text_event("quote", ask), Event(invocation_id="inv-failed", author="user", content=failed)]
    note = types.Content(role="user", parts=[skipped_model_note(1)])
    facts = quote_facts(events, TURN, note, {})
    assert facts.client_words == "###\n6\n###" and facts.last_reply == ask


def test_facts_read_the_register_reply_of_the_last_turn():
    events = [
        text_event("user", "procedi"),
        _call("suggest_quote_items", "inv-before"),
        _response("suggest_quote_items", "inv-before", {"result": GATE_REPLY}),
        text_event("quote", GATE_REPLY),
        text_event("user", "il soggiorno non lo includere", TURN),
    ]
    assert quote_facts(events, TURN, user_message("x"), {}).last_register_reply == GATE_REPLY


def test_facts_ignore_a_register_reply_of_an_older_turn():
    events = [
        _call("suggest_quote_items", "inv-old"),
        _response("suggest_quote_items", "inv-old", {"result": GATE_REPLY}),
        text_event("quote", "Ecco la bozza."),
        text_event("user", "ok", TURN),
    ]
    assert quote_facts(events, TURN, user_message("ok"), {}).last_register_reply == ""


def test_the_forward_step_asks_the_floor_area_of_a_new_room_first():
    """Test chat of 19/11 (salone sent with no m²): the step line is read last, so it must say it."""
    guide = quote_step_module.step_guide(QuoteStep.INOLTRO, None)
    assert "m² del pavimento" in guide and "chiedili prima" in guide and "nel turno della risposta" in guide


def test_the_facts_read_an_empty_draft_from_the_house_quote():
    facts = quote_facts([], "inv", None, {HOUSE_QUOTE_STATE_KEY: {"status": "draft", "empty": True}})
    assert facts.quote_empty is True
