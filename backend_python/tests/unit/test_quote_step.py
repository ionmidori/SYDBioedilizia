"""
The step of the quote, computed by code (strada B, passo 1: log only).

One test per arrow of the diagram in the analysis ("I passi nella strada B"),
then the edge cases: session rebuilt without history, yes with a courtesy,
turn run again without an unreadable video.
"""
from dataclasses import replace

import pytest
from google.adk.events import Event
from google.genai import types
from src.adk.video_attachments import skipped_model_note
from src.services.quote_step import QuoteFacts, QuoteStep, quote_facts, quote_step
from tests.unit.send_consent_fakes import TURN, text_event, user_message

REGISTER_ASK = "Ho tutto quello che mi serve. Preparo la richiesta di preventivo?"
SEND_ASK = "Bagno: rifacimento completo. Invio al nostro team la richiesta di preventivo per Bagno. Confermi?"
PHONE_ASK = (
    "Vuoi ricevere aggiornamenti anche su WhatsApp? Se sì, lasciami il numero "
    "*(opzionale — lo ricordo per i prossimi progetti)*"
)

BASE = QuoteFacts(
    is_guest=False,
    phone_on_file=True,
    quote_status=None,
    delivery_status=None,
    card_pending=None,
    last_reply="",
    last_turn_calls=(),
    turn_calls=(),
    client_words="",
)


def _step(**changes) -> QuoteStep:
    return quote_step(replace(BASE, **changes))


# ── RACCOLTA ──────────────────────────────────────────────────────────────────

def test_a_new_chat_collects_the_works():
    assert _step(client_words="vorrei rifare il bagno") is QuoteStep.RACCOLTA


def test_the_registration_question_waits_for_the_answer():
    """R -> D: the question was asked; a question back keeps the client there."""
    assert _step(last_reply=REGISTER_ASK, client_words="quanto tempo ci vuole?") is QuoteStep.DOMANDA_REGISTRAZIONE


@pytest.mark.parametrize("answer", ["no, aggiungi anche la cucina", "aspetta", "sì ma cambia le piastrelle"])
def test_anything_but_a_yes_to_the_registration_question_goes_back_to_collecting(answer):
    """D -> R (altro)."""
    assert _step(last_reply=REGISTER_ASK, client_words=answer) is QuoteStep.RACCOLTA


# ── registration confirmed: ospite? ───────────────────────────────────────────

def test_a_yes_to_the_registration_question_registers():
    """D -> G (no) -> T (phone on file) -> S."""
    assert _step(last_reply=REGISTER_ASK, client_words="sì") is QuoteStep.REGISTRA


@pytest.mark.parametrize("ask", [
    "Vuoi che prepari il preventivo?",
    "Preparo la richiesta di preventivo per bagno e cucina. Confermi?",
    "Registro la richiesta?",
])
def test_other_wordings_of_the_registration_question_count(ask):
    assert _step(last_reply=ask, client_words="sì") is QuoteStep.REGISTRA


@pytest.mark.parametrize("ask", [
    "Procedo con l'invio della richiesta al team?",
    "Invio al team la richiesta registrata?",
])
def test_the_send_question_is_not_the_registration_question(ask):
    assert _step(last_reply=ask, client_words="sì") is QuoteStep.RACCOLTA


@pytest.mark.parametrize("words", ["prepara il preventivo", "registra la richiesta", "fammi il preventivo"])
def test_an_explicit_request_registers_without_the_question(words):
    """R -> G ('prepara / registra il preventivo')."""
    assert _step(client_words=words) is QuoteStep.REGISTRA


def test_a_request_with_a_no_is_no_request():
    assert _step(client_words="non preparare ancora il preventivo") is QuoteStep.RACCOLTA


def test_a_guest_who_confirms_goes_to_the_login():
    """G (sì) -> L."""
    assert _step(is_guest=True, last_reply=REGISTER_ASK, client_words="sì") is QuoteStep.ACCESSO


LOGIN_ASK = "Per registrare la richiesta di preventivo serve un account gratuito. Accedi qui sotto e riprendo subito da qui."
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


def test_after_the_login_the_confirmed_registration_goes_on():
    """L (login fatto) -> T -> S: the confirmation is not asked again."""
    assert _step(last_reply=LOGIN_ASK, last_turn_calls=("request_login",), client_words="fatto") is QuoteStep.REGISTRA


def test_after_the_login_without_a_phone_asks_the_phone():
    assert _step(phone_on_file=False, last_reply=LOGIN_ASK, last_turn_calls=("request_login",)) is QuoteStep.TELEFONO


# ── TELEFONO ──────────────────────────────────────────────────────────────────

def test_a_registration_without_a_phone_asks_the_phone():
    """G (no) -> T: only when it is missing."""
    assert _step(phone_on_file=False, last_reply=REGISTER_ASK, client_words="sì") is QuoteStep.TELEFONO


@pytest.mark.parametrize("answer", ["3331234567", "no grazie"])
def test_the_phone_is_asked_once(answer):
    """T -> S whatever the answer."""
    assert _step(phone_on_file=False, last_reply=PHONE_ASK, client_words=answer) is QuoteStep.REGISTRA


def test_a_question_about_a_number_is_not_the_phone_question():
    assert _step(last_reply="Qual è il numero dei bagni da rifare?", client_words="due") is QuoteStep.RACCOLTA


def test_a_phone_saved_in_this_turn_registers():
    assert _step(phone_on_file=False, turn_calls=("save_contact_phone",)) is QuoteStep.REGISTRA


# ── SCHEDA ────────────────────────────────────────────────────────────────────

def test_the_registration_in_this_turn_leads_to_the_card():
    """S -> C."""
    assert _step(last_reply=REGISTER_ASK, client_words="sì", turn_calls=("suggest_quote_items",)) is QuoteStep.SCHEDA


def test_a_draft_with_measures_to_confirm_is_at_the_card():
    assert _step(quote_status="draft", card_pending=True, client_words="ok") is QuoteStep.SCHEDA


# ── DOMANDA INVIO / INVIO ─────────────────────────────────────────────────────

def test_a_confirmed_card_asks_to_send():
    """C (tutto confermato) -> I."""
    assert _step(quote_status="draft", card_pending=False, client_words="fatto") is QuoteStep.DOMANDA_INVIO


def test_a_draft_whose_card_is_unknown_asks_to_send():
    """The card could not be read: the send stays guarded by the explicit yes."""
    assert _step(quote_status="draft", card_pending=None) is QuoteStep.DOMANDA_INVIO


def test_a_yes_to_the_send_question_sends():
    """I (sì semplice) -> V."""
    assert _step(quote_status="draft", card_pending=False, last_reply=SEND_ASK, client_words="sì") is QuoteStep.INVIO


@pytest.mark.parametrize("answer", ["sì, ma aggiungi il corridoio", "cambia il pavimento", "no"])
def test_changes_at_the_send_question_go_back_to_collecting(answer):
    """I (modifiche) -> R."""
    step = _step(quote_status="draft", card_pending=False, last_reply=SEND_ASK, client_words=answer)
    assert step is QuoteStep.RACCOLTA


def test_a_question_with_a_change_at_the_send_question_goes_back_to_collecting():
    step = _step(quote_status="draft", card_pending=False, last_reply=SEND_ASK,
                 client_words="si può aggiungere il balcone?")
    assert step is QuoteStep.RACCOLTA


def test_a_question_at_the_send_question_asks_again():
    step = _step(quote_status="draft", card_pending=False, last_reply=SEND_ASK, client_words="quando arriva?")
    assert step is QuoteStep.DOMANDA_INVIO


def test_an_explicit_request_on_a_draft_registers_again():
    assert _step(quote_status="draft", card_pending=False, client_words="registra la richiesta") is QuoteStep.REGISTRA


# ── AL TEAM / INOLTRO ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("status", ["pending_review", "in_review", "approved"])
def test_a_quote_with_the_team_is_with_the_team(status):
    """V -> X."""
    assert _step(quote_status=status, client_words="a che punto siamo?") is QuoteStep.AL_TEAM


def test_a_sent_quote_still_in_the_mail_is_with_the_team():
    assert _step(quote_status="sent", delivery_status="queued", client_words="ciao") is QuoteStep.AL_TEAM


@pytest.mark.parametrize("words", ["aggiungi anche il balcone", "vorrei cambiare le piastrelle", "prepara il preventivo"])
def test_new_requests_with_the_team_are_relayed(words):
    """X (nuove richieste) -> F."""
    assert _step(quote_status="in_review", client_words=words) is QuoteStep.INOLTRO


def test_a_no_with_the_team_is_no_new_request():
    assert _step(quote_status="in_review", client_words="no grazie, aspetto") is QuoteStep.AL_TEAM


def test_the_relay_in_this_turn_is_the_relay_step():
    assert _step(quote_status="pending_review", turn_calls=("suggest_quote_items",)) is QuoteStep.INOLTRO


@pytest.mark.parametrize("status", ["sent", "rejected"])
def test_a_sent_or_rejected_quote_starts_collecting_again(status):
    """X (inviato al cliente / rifiutato) -> R: the next revision is a new request."""
    assert _step(quote_status=status, delivery_status="delivered", client_words="vorrei aggiungere la cucina") is (
        QuoteStep.RACCOLTA
    )


def test_a_deleted_quote_is_no_quote():
    assert _step(quote_status="deleted", client_words="ciao") is QuoteStep.RACCOLTA


# ── edge cases ────────────────────────────────────────────────────────────────

def test_a_session_rebuilt_without_history_reads_the_stored_quote():
    """No last reply: the step comes from Firestore (the draft and its card)."""
    assert _step(quote_status="draft", card_pending=True, last_reply="") is QuoteStep.SCHEDA


def test_a_yes_with_a_courtesy_is_a_yes():
    step = _step(quote_status="draft", card_pending=False, last_reply=SEND_ASK,
                 client_words="sì, non ho altro da aggiungere")
    assert step is QuoteStep.INVIO


def test_the_step_is_a_plain_string_for_the_log():
    assert QuoteStep.DOMANDA_INVIO == "domanda_invio"


# ── facts from the ADK session ────────────────────────────────────────────────

def _call(name: str, invocation_id: str) -> Event:
    return Event(
        invocation_id=invocation_id,
        author="quote",
        content=types.Content(role="model", parts=[types.Part(function_call=types.FunctionCall(name=name, args={}))]),
    )


def test_facts_read_the_session():
    events = [
        text_event("user", "vorrei rifare il bagno"),
        _call("request_login", "inv-before"),
        text_event("quote", REGISTER_ASK),
        text_event("user", "sì", TURN),
        _call("save_contact_phone", TURN),
    ]
    state = {
        "syd_session_context": {"is_guest": False, "phone_on_file": True, "session_id": "s"},
        "syd_house_quote": {"quote_number": "PRV-2026-0001", "status": "draft", "version": 1,
                            "delivery_status": None},
    }
    facts = quote_facts(events, TURN, user_message("###\nsì\n###"), state, card_pending=True)
    assert facts == QuoteFacts(
        is_guest=False, phone_on_file=True, quote_status="draft", delivery_status=None, card_pending=True,
        last_reply=REGISTER_ASK, last_turn_calls=("request_login",), turn_calls=("save_contact_phone",),
        client_words="###\nsì\n###",
    )


def test_facts_without_session_context_are_a_guest_without_quote():
    facts = quote_facts([], TURN, user_message("ciao"), {}, card_pending=None)
    assert facts.is_guest and not facts.phone_on_file and facts.quote_status is None


def test_facts_of_an_unreadable_quote_are_no_quote():
    state = {"syd_session_context": {"is_guest": False}, "syd_house_quote": None}
    assert quote_facts([], TURN, user_message("ciao"), state, card_pending=None).quote_status is None


def test_facts_of_a_turn_without_its_video_read_the_failed_message():
    failed = types.Content(role="user", parts=[
        types.Part(text="###\nsì\n###"),
        types.Part(file_data=types.FileData(file_uri="gs://b/v.mp4", mime_type="video/mp4")),
    ])
    events = [text_event("quote", SEND_ASK), Event(invocation_id="inv-failed", author="user", content=failed)]
    note = types.Content(role="user", parts=[skipped_model_note(1)])
    facts = quote_facts(events, TURN, note, {}, card_pending=None)
    assert facts.client_words == "###\nsì\n###" and facts.last_reply == SEND_ASK
