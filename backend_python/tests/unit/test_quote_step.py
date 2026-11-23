"""
The step of the quote, computed by code (strada B, passo 1: log only).

One test per arrow of the diagram in the analysis ("I passi nella strada B"),
then the edge cases: session rebuilt without history, yes with a courtesy,
turn run again without an unreadable video.
"""
import ast
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pytest
from google.adk.events import Event
from google.genai import types
from src.adk.quote_facts import quote_facts
from src.adk.session_context import HOUSE_QUOTE_STATE_KEY
from src.adk.video_attachments import skipped_model_note
from src.services import quote_step as quote_step_module
from src.services.quote_step import NEEDS_DETAILS, QuoteFacts, QuoteStep, quote_step
from src.tools.quote_tools import _rooms_reply, _single_unit_reply
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


def test_a_negative_request_is_no_request():
    assert _step(client_words="non fatemi ancora il preventivo") is QuoteStep.RACCOLTA


def test_a_request_asked_as_a_question_is_no_request():
    assert _step(client_words="Registra la richiesta anche per la cucina?") is QuoteStep.RACCOLTA


def test_a_question_with_a_change_at_the_registration_question_goes_back_to_collecting():
    assert _step(last_reply=REGISTER_ASK, client_words="si può aggiungere la cucina?") is QuoteStep.RACCOLTA


def test_an_offer_that_also_sends_is_the_send_question():
    """Registering and sending in one question is never the registration alone."""
    assert _step(last_reply="Registro la richiesta e la invio al team?", client_words="sì") is QuoteStep.RACCOLTA


def test_a_no_elsewhere_in_the_message_keeps_the_request():
    assert _step(client_words="prepara il preventivo, non serve altro") is QuoteStep.REGISTRA


@pytest.mark.parametrize("words", [
    "Posso registrare un video per il preventivo?",
    "Cosa devo preparare per il preventivo?",
    "Quando mi fate avere il preventivo",
])
def test_a_question_about_the_quote_is_no_request(words):
    assert _step(is_guest=True, client_words=words) is QuoteStep.RACCOLTA


@pytest.mark.parametrize("ask", [
    "Per prepararti il preventivo, mi dici se i sanitari li sostituiamo tutti?",
    "Preferisci registrare un video o caricare foto per il preventivo?",
])
def test_a_collecting_question_naming_the_quote_is_not_the_registration_question(ask):
    assert _step(is_guest=True, last_reply=ask, client_words="sì, tutti") is QuoteStep.RACCOLTA


def test_a_guest_who_confirms_goes_to_the_login():
    """G (sì) -> L."""
    assert _step(is_guest=True, last_reply=REGISTER_ASK, client_words="sì") is QuoteStep.ACCESSO


LOGIN_ASK = (  # modes.py, STEP AUTH_GATE
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


def test_after_the_login_the_confirmed_registration_goes_on():
    """L (login fatto) -> T -> S: the confirmation is not asked again."""
    assert _step(last_reply=LOGIN_ASK, last_turn_calls=("request_login",), client_words="fatto") is QuoteStep.REGISTRA


def test_after_the_login_without_a_phone_asks_the_phone():
    assert _step(phone_on_file=False, last_reply=LOGIN_ASK, last_turn_calls=("request_login",)) is QuoteStep.TELEFONO


def test_a_session_rebuilt_after_the_login_reads_the_login_message():
    """History restored from Firestore keeps no tool calls (a guest who logs in
    to an existing account gets a new session): the message is the trace."""
    assert _step(phone_on_file=False, last_reply=LOGIN_ASK, client_words="fatto") is QuoteStep.TELEFONO


def test_a_rebuilt_session_after_a_render_login_is_no_quote_step():
    assert _step(last_reply=RENDER_LOGIN, client_words="fatto") is QuoteStep.RACCOLTA


# ── TELEFONO ──────────────────────────────────────────────────────────────────

def test_a_registration_without_a_phone_asks_the_phone():
    """G (no) -> T: only when it is missing."""
    assert _step(phone_on_file=False, last_reply=REGISTER_ASK, client_words="sì") is QuoteStep.TELEFONO


@pytest.mark.parametrize("answer", ["3331234567", "no grazie"])
def test_the_phone_is_asked_once(answer):
    """T -> S whatever the answer."""
    assert _step(phone_on_file=False, last_reply=PHONE_ASK, client_words=answer) is QuoteStep.REGISTRA


def test_a_call_from_the_technician_is_not_the_phone_question():
    ask = "Vuoi che il tecnico ti chiami al telefono per un sopralluogo?"
    assert _step(last_reply=ask, client_words="sì") is QuoteStep.RACCOLTA


def test_a_guest_is_never_asked_the_phone():
    step = _step(is_guest=True, phone_on_file=False, last_reply=PHONE_ASK, client_words="3331234567")
    assert step is QuoteStep.RACCOLTA


def test_a_question_about_a_number_is_not_the_phone_question():
    assert _step(last_reply="Qual è il numero dei bagni da rifare?", client_words="due") is QuoteStep.RACCOLTA


def test_a_phone_saved_in_this_turn_registers():
    """The client confirms and leaves the number in the same message."""
    facts = {"phone_on_file": False, "last_reply": REGISTER_ASK, "client_words": "sì, il mio numero è 3331234567"}
    assert _step(**facts, turn_calls=("save_contact_phone",)) is QuoteStep.REGISTRA


def test_a_phone_saved_while_collecting_does_not_skip_the_confirmation():
    words = "bagno 6 m², rifare il pavimento, il mio numero è 3331234567"
    assert _step(phone_on_file=False, client_words=words, turn_calls=("save_contact_phone",)) is QuoteStep.RACCOLTA


# ── SCHEDA ────────────────────────────────────────────────────────────────────

def test_the_registration_in_this_turn_leads_to_the_card():
    """S -> C."""
    assert _step(last_reply=REGISTER_ASK, client_words="sì", turn_calls=("suggest_quote_items",)) is QuoteStep.SCHEDA


def test_a_draft_with_measures_to_confirm_is_at_the_card():
    assert _step(quote_status="draft", card_pending=True, client_words="ok") is QuoteStep.SCHEDA


@pytest.mark.parametrize("card_pending", [True, False])
def test_more_work_on_a_draft_goes_back_to_collecting(card_pending):
    """Not only at the send question: new work is a new request (modifiche -> R)."""
    step = _step(quote_status="draft", card_pending=card_pending, client_words="aggiungi anche la cucina")
    assert step is QuoteStep.RACCOLTA


# ── DOMANDA INVIO / INVIO ─────────────────────────────────────────────────────

def test_a_confirmed_card_asks_to_send():
    """C (tutto confermato) -> I."""
    assert _step(quote_status="draft", card_pending=False, client_words="fatto") is QuoteStep.DOMANDA_INVIO


def test_a_draft_whose_card_is_unknown_asks_to_send():
    """The card could not be read: the send stays guarded by the explicit yes."""
    assert _step(quote_status="draft") is QuoteStep.DOMANDA_INVIO


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


@pytest.mark.parametrize("words", ["Grazie anche a te!", "Quando mi fate avere il preventivo?"])
def test_thanks_or_a_question_with_the_team_is_no_new_request(words):
    assert _step(quote_status="in_review", client_words=words) is QuoteStep.AL_TEAM


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
    assert _step(quote_status="sent", phone_on_file=False, client_words=answer, **GATED) is QuoteStep.REGISTRA


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
    """Turn 11: the last turn registered (no questions), the client says yes to the send."""
    step = _step(quote_status="draft", card_pending=False, last_reply=SEND_ASK, client_words="Confermo",
                 last_turn_calls=("suggest_quote_items",), last_register_reply="Ho registrato la nuova revisione.")
    assert step is QuoteStep.INVIO


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
        "syd_card_pending": True,  # read by the orchestrator before the turn
    }
    facts = quote_facts(events, TURN, user_message("###\nsì\n###"), state)
    assert facts == QuoteFacts(
        is_guest=False, phone_on_file=True, quote_status="draft", delivery_status=None, card_pending=True,
        last_reply=REGISTER_ASK, last_turn_calls=("request_login",), turn_calls=("save_contact_phone",),
        client_words="###\nsì\n###", last_register_reply="",
    )


def test_facts_without_session_context_are_a_guest_without_quote():
    facts = quote_facts([], TURN, user_message("ciao"), {})
    assert facts.is_guest and not facts.phone_on_file and facts.quote_status is None


def test_facts_of_an_unreadable_quote_are_no_quote():
    state = {"syd_session_context": {"is_guest": False}, "syd_house_quote": None}
    assert quote_facts([], TURN, user_message("ciao"), state).quote_status is None


def test_facts_of_a_turn_without_its_video_read_the_failed_message():
    failed = types.Content(role="user", parts=[
        types.Part(text="###\nsì\n###"),
        types.Part(file_data=types.FileData(file_uri="gs://b/v.mp4", mime_type="video/mp4")),
    ])
    events = [text_event("quote", SEND_ASK), Event(invocation_id="inv-failed", author="user", content=failed)]
    note = types.Content(role="user", parts=[skipped_model_note(1)])
    facts = quote_facts(events, TURN, note, {})
    assert facts.client_words == "###\nsì\n###" and facts.last_reply == SEND_ASK


def _response(name: str, invocation_id: str, result: object) -> Event:
    return Event(
        invocation_id=invocation_id,
        author="quote",
        content=types.Content(role="user", parts=[
            types.Part(function_response=types.FunctionResponse(name=name, response=result)),
        ]),
    )


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


def test_a_draft_left_without_lines_by_a_clear_is_collected_again_not_sent():
    """Review finding (PR 3): after a full clear the draft has no lines: never the send question."""
    step = _step(quote_status="draft", card_pending=False, client_words="ciao", quote_empty=True)
    assert step is QuoteStep.RACCOLTA


def test_the_facts_read_an_empty_draft_from_the_house_quote():
    facts = quote_facts([], "inv", None, {HOUSE_QUOTE_STATE_KEY: {"status": "draft", "empty": True}})
    assert facts.quote_empty is True
