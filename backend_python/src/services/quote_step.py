"""
The step of the quote in the chat, computed by code (strada B, passo 1).

Today the order of the steps (collect, confirm the registration, login, phone,
register, card, send question, send, team) lives in the prompt of the `quote`
agent, and the model gets it wrong. This module computes the step from facts
the code already knows: guest or not, the stored house quote and its card, the
phone on file, the reply the client saw before this turn, the tools called and
the client's words (the same readers as the explicit yes of the send,
`src/services/reply_reading.py`). The model will read the step, not choose it.

Passo 1 logs the step once per turn (`QuoteStepPlugin`). PR 2 makes it a
control: the `quote` agent reads the step in its session block (`step_line`)
and a tool called out of step is not run (`step_refusal`, applied by
`src/adk/quote_gate.py`). The arrows are the diagram "I passi nella strada B" of
the analysis (https://claude.ai/artifact/F4xsPCoVBbqLTLPRCfcYWL). A wrong step
costs at most one more question.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum

from src.services.quote_state import ai_draft_action
from src.services.reply_reading import (
    asked_to_send,
    is_bare_confirm,
    names_send,
    plain_yes,
    sentences,
    without_courtesies,
)

REGISTER_TOOL = "suggest_quote_items"
LOGIN_TOOL = "request_login"
_PHONE_TOOL = "save_contact_phone"


class QuoteStep(StrEnum):
    RACCOLTA = "raccolta"
    DOMANDA_REGISTRAZIONE = "domanda_registrazione"
    ACCESSO = "accesso"
    TELEFONO = "telefono"
    REGISTRA = "registra"
    SCHEDA = "scheda"
    DOMANDA_INVIO = "domanda_invio"
    INVIO = "invio"
    AL_TEAM = "al_team"
    INOLTRO = "inoltro"


@dataclass(frozen=True)
class QuoteFacts:
    """What the step is computed from."""
    is_guest: bool
    phone_on_file: bool
    quote_status: str | None  # None: no quote, or it could not be read
    delivery_status: str | None
    card_pending: bool | None  # the card still asks something; None: unknown
    last_reply: str  # what the assistant wrote in the last turn before this one
    last_turn_calls: tuple[str, ...]
    turn_calls: tuple[str, ...]  # tools called so far in this turn
    client_words: str
    last_register_reply: str = ""  # what suggest_quote_items answered in the last turn ("": not called)
    card_confirmed: bool = False  # this turn is the signal of the last confirmation on the card


# The assistant offers to do it, at the start of the sentence: "Preparo la richiesta di preventivo?",
# "Vuoi che prepari il preventivo?", "Registro la richiesta?". Not "Per prepararti il preventivo, …?"
# nor "Preferisci registrare un video …?": collecting questions that name the quote.
_REGISTER_OFFER = re.compile(
    r"^\W*(?:(?:allora|ok|bene|perfetto),?\s+)?(?:vuoi che (?:io )?|posso |procedo a )?(?:ti |la |lo )?"
    r"(?:prepar(?:o|i|are)|registr(?:o|i|are))\b",
    re.IGNORECASE,
)
_QUOTE_OBJECT = re.compile(r"\b(preventivo|richiesta)\b", re.IGNORECASE)
# The client asks for it, as a request (never a question): "prepara il preventivo", "registra la
# richiesta", "fammi il preventivo". "Non preparare…" uses the infinitive: no match.
_REGISTER_REQUEST = re.compile(
    r"(?<!non )\b(prepara(?:mi|lo|la)?|registra(?:mi|lo|la)?|fammi|fatemi|crea(?:mi)?)\b"
    r"[^.!?\n]{0,30}?\b(preventivo|richiesta)\b",
    re.IGNORECASE,
)
# More or different work: the request is not the one registered ("anche" alone is a thank-you too).
_CHANGE = re.compile(r"\b(aggiung\w*|cambi\w*|modific\w*|togli\w*|sostitu\w*|rifa\w*|invece)\b", re.IGNORECASE)
# The phone question ("Vuoi ricevere aggiornamenti anche su WhatsApp?"); "numero" alone is any number.
_PHONE = re.compile(r"\b(whatsapp|telefono|cellulare)\b", re.IGNORECASE)
# The login message of the quote (modes.py, STEP AUTH_GATE): the trace of the login when the
# session was rebuilt from Firestore, whose history keeps no tool calls.
_LOGIN_TEXT = re.compile(r"account gratuito|accedi qui", re.IGNORECASE)
# The completeness gate of suggest_quote_items (src/tools/quote_tools.py): questions instead
# of a quote. The tool writes this constant; the rule reads it back.
NEEDS_DETAILS = "ho bisogno di qualche dettaglio in più"
_GATE_TEXT = re.compile(rf"{re.escape(NEEDS_DETAILS)}|ho bisogno di qualche informazione", re.IGNORECASE)


def _names_registration(sentence: str) -> bool:
    return bool(_REGISTER_OFFER.search(sentence)) and bool(_QUOTE_OBJECT.search(sentence)) and not names_send(sentence)


def asked_to_register(reply: str) -> bool:
    """A question of the reply asks to register the request, or is a bare
    "Confermi?" right after a sentence that names it. The send question is not one."""
    parts = sentences(reply)
    for i, sentence in enumerate(parts):
        if not sentence.endswith("?"):
            continue
        if _names_registration(sentence) or (i > 0 and is_bare_confirm(sentence) and _names_registration(parts[i - 1])):
            return True
    return False


def asks_to_register(words: str) -> bool:
    """The client asks to prepare or register the quote (a request, not a question)."""
    return "?" not in words and bool(_REGISTER_REQUEST.search(words))


def _asked_phone(reply: str) -> bool:
    return any(s.endswith("?") and _PHONE.search(s) for s in sentences(reply))


def _asks_change(words: str) -> bool:
    """"Non ho altro da aggiungere" closes the request: no change."""
    return bool(_CHANGE.search(without_courtesies(words)))


def _quote_login(f: QuoteFacts) -> bool:
    """The login card of the last turn was for the quote (a render asks it too). A
    rebuilt session has no tool calls: the login message itself counts."""
    asked = LOGIN_TOOL in f.last_turn_calls or bool(_LOGIN_TEXT.search(f.last_reply))
    return asked and bool(_QUOTE_OBJECT.search(f.last_reply))


def _gate_asked(f: QuoteFacts) -> bool:
    """The last registration stopped at the completeness gate and asked for details. A
    rebuilt session has no tool calls: the questions in the reply count."""
    return bool(_GATE_TEXT.search(f.last_register_reply) or _GATE_TEXT.search(f.last_reply))


def _confirmed(f: QuoteFacts) -> QuoteStep:
    """The registration is confirmed: login for a guest, then the phone once, then
    register. A phone saved in this turn counts as asked: only once the registration
    is confirmed (a number given while collecting does not skip the confirmation)."""
    if f.is_guest:
        return QuoteStep.ACCESSO
    return QuoteStep.REGISTRA if f.phone_on_file or _PHONE_TOOL in f.turn_calls else QuoteStep.TELEFONO


def _answer(f: QuoteFacts, asked: QuoteStep, on_yes: QuoteStep) -> QuoteStep:
    """The client's answer to a question of the last reply: a plain yes goes on, a
    question without a change asks again, anything else goes back to collecting."""
    if plain_yes(f.client_words):
        return on_yes
    if "?" in f.client_words and not _asks_change(f.client_words):
        return asked
    return QuoteStep.RACCOLTA


def _with_team(f: QuoteFacts) -> QuoteStep:
    relayed = REGISTER_TOOL in f.turn_calls or _asks_change(f.client_words) or asks_to_register(f.client_words)
    return QuoteStep.INOLTRO if relayed else QuoteStep.AL_TEAM


def _on_draft(f: QuoteFacts) -> QuoteStep:
    if f.card_confirmed and f.card_pending is False:
        return QuoteStep.DOMANDA_INVIO  # the client closed the card: the signal answers no question
    if asks_to_register(f.client_words):
        return QuoteStep.REGISTRA  # the phone was asked at the first registration
    if _asks_change(f.client_words):
        return QuoteStep.RACCOLTA  # new work, at the card or anywhere: modifiche -> R
    if _gate_asked(f):
        return QuoteStep.REGISTRA  # the details the gate asked for: register again
    if f.card_pending:
        return QuoteStep.SCHEDA
    if asked_to_send(f.last_reply):
        return _answer(f, QuoteStep.DOMANDA_INVIO, QuoteStep.INVIO)
    return QuoteStep.DOMANDA_INVIO


def _without_draft(f: QuoteFacts) -> QuoteStep:
    if not f.is_guest and not f.phone_on_file and _asked_phone(f.last_reply):
        return QuoteStep.REGISTRA  # asked once, whatever the answer
    if _gate_asked(f) and not _asks_change(f.client_words):
        # The details the gate asked for (the phone was asked before the first try).
        return QuoteStep.ACCESSO if f.is_guest else QuoteStep.REGISTRA
    if _quote_login(f):
        return _confirmed(f)  # still a guest: still the login; signed in: the confirmation holds
    if asks_to_register(f.client_words):
        return _confirmed(f)
    if asked_to_register(f.last_reply):
        return _answer(f, QuoteStep.DOMANDA_REGISTRAZIONE, _confirmed(f))
    return QuoteStep.RACCOLTA


def quote_step(f: QuoteFacts) -> QuoteStep:
    """The step of the quote this turn is at."""
    action = ai_draft_action(f.quote_status, f.delivery_status)
    if action == "relay":
        return _with_team(f)
    if REGISTER_TOOL in f.turn_calls:
        return QuoteStep.SCHEDA
    if LOGIN_TOOL in f.turn_calls:
        return QuoteStep.ACCESSO
    if action == "update":
        return _on_draft(f)
    return _without_draft(f)  # no quote, or a sent/rejected one: the next revision is a new request


# ── The step as a control (PR 2) ─────────────────────────────────────────────
# The questions the model asks with these exact words: the readers above read them
# back in the next turn (`asked_to_register`, `_LOGIN_TEXT`, `_PHONE`, `asked_to_send`).
REGISTER_QUESTION = "Ho tutto quello che mi serve. Preparo la richiesta di preventivo?"
LOGIN_MESSAGE = (
    "Per registrare la richiesta di preventivo serve un account gratuito — bastano pochi secondi! "
    "Accedi qui sotto e riprendo subito da qui."
)
PHONE_QUESTION = (
    "Vuoi ricevere aggiornamenti anche su WhatsApp? Se sì, lasciami il numero "
    "*(opzionale — lo ricordo per i prossimi progetti)*"
)
SEND_QUESTION = "Invio al nostro team la richiesta di preventivo per [stanze]. Confermi?"

# The line of the quote agent's session block, and the start of a refused call's
# answer (`src/adk/turn_reading.py` does not count such a call as called).
STEP_LINE_MARKER = "PASSO DEL PREVENTIVO"
STEP_REFUSED_PREFIX = "⛔ NON ESEGUITO"

_UPDATE = "update"  # ai_draft_action: a draft the client is still shaping

_GUIDE: dict[QuoteStep, str] = {
    QuoteStep.RACCOLTA: (
        "raccogli i dati (comune, lavori stanza per stanza, m² del pavimento). Quando hai tutto chiedi "
        f"«{REGISTER_QUESTION}» e fermati. Prima del sì del cliente niente {REGISTER_TOOL} e niente request_login_adk."
    ),
    QuoteStep.DOMANDA_REGISTRAZIONE: (
        f"il cliente ha risposto alla domanda di registrazione con una domanda: rispondi, poi chiedi di nuovo "
        f"«{REGISTER_QUESTION}» e fermati."
    ),
    QuoteStep.ACCESSO: (
        "il cliente ha confermato la registrazione ma è un ospite: chiama request_login_adk una sola volta (se non "
        f"l'hai già fatto in questo turno), scrivi «{LOGIN_MESSAGE}» e fermati."
    ),
    QuoteStep.TELEFONO: (
        f"registrazione confermata, manca il telefono: chiedi una sola volta «{PHONE_QUESTION}» e fermati. "
        "La richiesta si registra al turno dopo, qualunque sia la risposta."
    ),
    QuoteStep.REGISTRA: (
        f"registrazione confermata: chiama {REGISTER_TOOL} ora, senza chiedere di nuovo conferma (se il cliente ha "
        "appena dato il numero di telefono, prima save_contact_phone)."
    ),
    QuoteStep.SCHEDA: (
        f"la richiesta è registrata e la scheda di conferma aspetta il cliente: riporta la risposta di {REGISTER_TOOL} "
        "come dice lo STEP 1. In un turno successivo richiamalo solo se il cliente dà o corregge misure a parole, o "
        "cambia lavori."
    ),
    QuoteStep.DOMANDA_INVIO: (
        "la richiesta è registrata e la scheda è completa: riepiloga le stanze (solo descrizione, nessun prezzo) e "
        f"chiedi «{SEND_QUESTION}», poi aspetta il sì. Misure date a parole o lavori nuovi: prima {REGISTER_TOOL}."
    ),
    QuoteStep.INVIO: "il cliente ha detto sì all'invio: chiama submit_quote_request.",
    QuoteStep.AL_TEAM: (
        "il preventivo è già dal team: niente submit_quote_request. Se il cliente chiede modifiche, raccogli i lavori "
        f"(i m² del pavimento una volta, per una stanza nuova), poi {REGISTER_TOOL} le inoltra al team."
    ),
    QuoteStep.INOLTRO: (
        f"il cliente chiede una modifica a un preventivo già dal team: {REGISTER_TOOL} la inoltra (riporta la sua "
        "risposta). Se non l'hai ancora chiamato in questo turno e la modifica porta una stanza nuova di cui non "
        "conosci i m² del pavimento, chiedili prima, una volta, e fermati: lo chiami nel turno della risposta, "
        "anche se il cliente non li sa. Niente submit_quote_request."
    ),
}
_COLLECT_ON_DRAFT = (
    "il cliente cambia o aggiunge lavori alla richiesta già registrata: raccogli i dettagli che mancano, poi "
    f"{REGISTER_TOOL} la aggiorna. Niente submit_quote_request in questo turno."
)


def step_guide(step: QuoteStep, action: str | None) -> str:
    """What the agent does at this step (`action`: `ai_draft_action` of the house quote)."""
    if step is QuoteStep.RACCOLTA and action == _UPDATE:
        return _COLLECT_ON_DRAFT
    return _GUIDE[step]


def step_line(step: QuoteStep, action: str | None) -> str:
    """The step line of the quote agent's session block."""
    return f"{STEP_LINE_MARKER}: {step.value} — {step_guide(step, action)}"


def _refused(step: QuoteStep, why: str) -> str:
    return f"{STEP_REFUSED_PREFIX} (passo: {step.value}): {why}"


def step_refusal(
    step: QuoteStep, action: str | None, tool: str, *, registered_this_turn: bool, quote_known: bool = True
) -> str | None:
    """None when `tool` may run at this step, otherwise what the agent does instead.

    Only where the reader is reliable and the error costs: registering before the
    client confirmed (on a draft the tool only updates it, and measures given in
    words are not read), a guest's registration (the login first: the tool would
    refuse it too, but its answer would count as a registration), the login before
    the confirmation, the phone not asked yet, a second registration in one turn.
    `quote_known` False: the house quote could not be read, so a draft may exist
    and the registration is not held back while collecting. The send has its own
    check (`send_consent`)."""
    before_confirmation = step in (QuoteStep.RACCOLTA, QuoteStep.DOMANDA_REGISTRAZIONE)
    if tool == REGISTER_TOOL:
        if before_confirmation and action != _UPDATE and quote_known:
            return _refused(step, f"il cliente non ha ancora confermato la registrazione. Chiedi «{REGISTER_QUESTION}» "
                                  "e fermati.")
        if step is QuoteStep.ACCESSO:
            return _refused(step, "il cliente è un ospite: chiama request_login_adk una sola volta (se non l'hai già "
                                  f"fatto in questo turno), scrivi «{LOGIN_MESSAGE}» e fermati.")
        if step is QuoteStep.TELEFONO:
            return _refused(step, f"prima chiedi una sola volta «{PHONE_QUESTION}» e fermati: la richiesta si "
                                  "registra al turno dopo.")
        if registered_this_turn:
            return _refused(step, f"{REGISTER_TOOL} è già stato chiamato in questo turno: riporta la sua risposta, "
                                  "non richiamarlo.")
    if tool == LOGIN_TOOL and before_confirmation:
        return _refused(step, "l'accesso si chiede solo nel turno in cui il cliente conferma la registrazione. "
                              f"Chiedi «{REGISTER_QUESTION}» e fermati.")
    return None
