"""
The step of the quote in the chat, computed by code (strada B).

The order of the steps (collect, login for a guest, register, the card as the
summary, the team) is computed from facts the code already knows: guest or not,
the stored house quote and its card, the reply the client saw before this turn,
the tools called, a registration the gate refused and the client's words (the
readers of `src/services/reply_reading.py`). The model reads the step, it does
not choose it.

Flow of 27 Nov (plan "card-recap-flow", PR A): the model registers as soon as
the data are there (no "Preparo la richiesta?"), the phone is asked once while
collecting, the card is a summary that asks only what is missing, and only the
"Invia al team" button of the card sends: the click is the consent (U1-U3).

`QuoteStepPlugin` logs the step once per turn. The `quote` agent reads it in its
session block (`step_line`) and a tool called out of step is not run
(`step_refusal`, applied by `src/adk/quote_gate.py`). A wrong step costs at most
one more question.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum

from src.services.quote_state import ai_draft_action
from src.services.reply_reading import without_courtesies

REGISTER_TOOL = "suggest_quote_items"
LOGIN_TOOL = "request_login"


class QuoteStep(StrEnum):
    RACCOLTA = "raccolta"
    ACCESSO = "accesso"
    REGISTRA = "registra"
    SCHEDA = "scheda"
    RIEPILOGO = "riepilogo"
    AL_TEAM = "al_team"
    INOLTRO = "inoltro"


@dataclass(frozen=True)
class QuoteFacts:
    """What the step is computed from."""
    is_guest: bool
    quote_status: str | None  # None: no quote, or it could not be read
    delivery_status: str | None
    card_pending: bool | None  # the card still asks something; None: unknown
    last_reply: str  # what the assistant wrote in the last turn before this one
    last_turn_calls: tuple[str, ...]
    turn_calls: tuple[str, ...]  # tools called so far in this turn (refused ones left out)
    client_words: str
    last_register_reply: str = ""  # what suggest_quote_items answered in the last turn ("": not called)
    card_confirmed: bool = False  # this turn is the signal of the last confirmation on the card
    quote_sent: bool = False  # this turn is the signal of the "Invia al team" button of the card
    quote_empty: bool = False  # the draft has no line (a full chat clear emptied it)
    register_refused: bool = False  # the gate refused a registration in this turn (a guest's)


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
# The login message of the quote (`LOGIN_MESSAGE`): the trace of the login when the
# session was rebuilt from Firestore, whose history keeps no tool calls.
_LOGIN_TEXT = re.compile(r"account gratuito|accedi qui", re.IGNORECASE)
# The completeness gate of suggest_quote_items (src/tools/quote_tools.py): questions instead
# of a quote. The tool writes this constant; the rule reads it back.
NEEDS_DETAILS = "ho bisogno di qualche dettaglio in più"
_GATE_TEXT = re.compile(rf"{re.escape(NEEDS_DETAILS)}|ho bisogno di qualche informazione", re.IGNORECASE)


def asks_to_register(words: str) -> bool:
    """The client asks to prepare or register the quote (a request, not a question)."""
    return "?" not in words and bool(_REGISTER_REQUEST.search(words))


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


def _to_register(f: QuoteFacts) -> QuoteStep:
    """The request is ready to register: a guest logs in first."""
    return QuoteStep.ACCESSO if f.is_guest else QuoteStep.REGISTRA


def _with_team(f: QuoteFacts) -> QuoteStep:
    relayed = REGISTER_TOOL in f.turn_calls or _asks_change(f.client_words) or asks_to_register(f.client_words)
    return QuoteStep.INOLTRO if relayed else QuoteStep.AL_TEAM


def _on_draft(f: QuoteFacts) -> QuoteStep:
    if f.card_confirmed:
        return QuoteStep.RIEPILOGO  # the client closed the card: the signal is no request
    if asks_to_register(f.client_words):
        return QuoteStep.REGISTRA
    if _asks_change(f.client_words):
        return QuoteStep.RACCOLTA  # new work, at the card or anywhere: modifiche -> R
    if _gate_asked(f):
        return QuoteStep.REGISTRA  # the details the gate asked for: register again
    # A "sì" or an "invia" is no send (U1): the summary points to the button.
    return QuoteStep.SCHEDA if f.card_pending else QuoteStep.RIEPILOGO


def _without_draft(f: QuoteFacts) -> QuoteStep:
    if _gate_asked(f) and not _asks_change(f.client_words):
        return _to_register(f)  # the details the gate asked for
    if _quote_login(f):
        return _to_register(f)  # still a guest: still the login; signed in: register
    if asks_to_register(f.client_words) or f.register_refused:
        return _to_register(f)  # asked for, or the model found the data complete
    return QuoteStep.RACCOLTA


def quote_step(f: QuoteFacts) -> QuoteStep:
    """The step of the quote this turn is at."""
    if f.quote_sent:
        return QuoteStep.AL_TEAM  # the button sent it; the quote read before the turn may be older
    action = ai_draft_action(f.quote_status, f.delivery_status)
    if action == "relay":
        return _with_team(f)
    if REGISTER_TOOL in f.turn_calls:
        return QuoteStep.SCHEDA
    if LOGIN_TOOL in f.turn_calls:
        return QuoteStep.ACCESSO
    if action == "update" and not f.quote_empty:
        return _on_draft(f)
    return _without_draft(f)  # no quote, or a sent/rejected one: the next revision is a new request


# ── The step as a control ────────────────────────────────────────────────────
# The login message the model writes with these exact words: the reader above reads it
# back in the next turn (`_LOGIN_TEXT`). The phone question is asked once while collecting.
LOGIN_MESSAGE = (
    "Per registrare la richiesta di preventivo serve un account gratuito — bastano pochi secondi! "
    "Accedi qui sotto e riprendo subito da qui."
)
PHONE_QUESTION = (
    "Vuoi ricevere aggiornamenti anche su WhatsApp? Se sì, lasciami il numero "
    "*(opzionale — lo ricordo per i prossimi progetti)*"
)
# The button of the card that sends the request (web_client ConfirmationCard).
SEND_BUTTON = "Invia al team"

# The line of the quote agent's session block, and the start of a refused call's
# answer (`src/adk/turn_reading.py` does not count such a call as called).
STEP_LINE_MARKER = "PASSO DEL PREVENTIVO"
STEP_REFUSED_PREFIX = "⛔ NON ESEGUITO"

_UPDATE = "update"  # ai_draft_action: a draft the client is still shaping

_LOGIN_GUIDE = (
    f"chiama request_login_adk una sola volta (se non l'hai già fatto in questo turno), scrivi «{LOGIN_MESSAGE}» "
    "e fermati."
)
_PHONE_ONCE = (
    f"Se PHONE_ON_FILE è false e in questa chat non l'hai ancora chiesto, chiedi una sola volta «{PHONE_QUESTION}»: "
    "è facoltativo, non aspettare la risposta per proseguire e non richiederlo."
)
_NO_SEND = (
    f"Nessuna domanda di conferma o di invio in chat: la richiesta parte solo quando il cliente preme «{SEND_BUTTON}» "
    "sulla scheda. Se il cliente scrive di inviarla, ricordagli il pulsante."
)

_GUIDE: dict[QuoteStep, str] = {
    QuoteStep.RACCOLTA: (
        "raccogli i dati: comune, lavori stanza per stanza, misure (lunghezza, larghezza e altezza, o i m² del "
        f"pavimento). {_PHONE_ONCE} Quando hai i dati, chiama {REGISTER_TOOL} senza chiedere conferma: la scheda "
        "qui sotto farà da riepilogo (per un ospite lo strumento ti dirà di chiedere prima l'accesso)."
    ),
    QuoteStep.ACCESSO: f"la richiesta è pronta ma il cliente è un ospite: {_LOGIN_GUIDE}",
    QuoteStep.REGISTRA: (
        f"la richiesta è pronta: chiama {REGISTER_TOOL} ora, senza chiedere conferma (se il cliente ha appena dato "
        "il numero di telefono, prima save_contact_phone)."
    ),
    QuoteStep.SCHEDA: (
        f"la richiesta è registrata e la scheda qui sotto la riepiloga: riporta la risposta di {REGISTER_TOOL} come "
        f"dice lo STEP 1 (la scheda chiede solo ciò che manca, il resto è riepilogo). {_NO_SEND} {_PHONE_ONCE} "
        "In un turno successivo richiamalo solo se il cliente dà o corregge misure a parole, o cambia lavori."
    ),
    QuoteStep.RIEPILOGO: (
        "la richiesta è nella scheda qui sotto e non le manca niente: invita il cliente a controllarla e, se è tutto "
        f"giusto, a premere «{SEND_BUTTON}». {_NO_SEND} Misure date a parole o lavori nuovi: prima {REGISTER_TOOL}."
    ),
    QuoteStep.AL_TEAM: (
        "il preventivo è già dal team. Se il cliente chiede modifiche, raccogli i lavori (i m² del pavimento una "
        f"volta, per una stanza nuova), poi {REGISTER_TOOL} le inoltra al team."
    ),
    QuoteStep.INOLTRO: (
        f"il cliente chiede una modifica a un preventivo già dal team: {REGISTER_TOOL} la inoltra (riporta la sua "
        "risposta). Se non l'hai ancora chiamato in questo turno e la modifica porta una stanza nuova di cui non "
        "conosci i m² del pavimento, chiedili prima, una volta, e fermati: lo chiami nel turno della risposta, "
        "anche se il cliente non li sa."
    ),
}
_COLLECT_ON_DRAFT = (
    "il cliente cambia o aggiunge lavori alla richiesta già registrata: raccogli i dettagli che mancano, poi "
    f"{REGISTER_TOOL} la aggiorna. Poi la scheda ne mostra il riepilogo, da inviare col pulsante «{SEND_BUTTON}»."
)
_JUST_SENT = (
    f"il cliente ha appena inviato la richiesta al team con il pulsante «{SEND_BUTTON}» della scheda: confermalo in "
    "una frase (il team la esamina e il preventivo arriva via email dopo la revisione), senza strumenti; poi, come "
    "dice il post_execution_check, l'eventuale proposta del rendering."
)


def step_guide(step: QuoteStep, action: str | None, *, quote_sent: bool = False) -> str:
    """What the agent does at this step (`action`: `ai_draft_action` of the house quote;
    `quote_sent`: the turn is the signal of the send button)."""
    if quote_sent and step is QuoteStep.AL_TEAM:
        return _JUST_SENT
    if step is QuoteStep.RACCOLTA and action == _UPDATE:
        return _COLLECT_ON_DRAFT
    return _GUIDE[step]


def step_line(step: QuoteStep, action: str | None, *, quote_sent: bool = False) -> str:
    """The step line of the quote agent's session block."""
    return f"{STEP_LINE_MARKER}: {step.value} — {step_guide(step, action, quote_sent=quote_sent)}"


def _refused(step: QuoteStep, why: str) -> str:
    return f"{STEP_REFUSED_PREFIX} (passo: {step.value}): {why}"


def step_refusal(step: QuoteStep, tool: str, *, registered_this_turn: bool, is_guest: bool) -> str | None:
    """None when `tool` may run at this step, otherwise what the agent does instead.

    Only where the reader is reliable and the error costs: a guest's registration
    (the login first: the tool would refuse it too, but its answer would count as a
    registration), the login while collecting (a photo or a price question is no
    reason: it comes when the model finds the data complete and tries to register),
    a second registration in one turn."""
    if tool == REGISTER_TOOL:
        if is_guest or step is QuoteStep.ACCESSO:
            return _refused(step, f"il cliente è un ospite: {_LOGIN_GUIDE}")
        if registered_this_turn:
            return _refused(step, f"{REGISTER_TOOL} è già stato chiamato in questo turno: riporta la sua risposta, "
                                  "non richiamarlo.")
    if tool == LOGIN_TOOL and step is QuoteStep.RACCOLTA:
        return _refused(step, "l'accesso si chiede solo quando la richiesta è pronta: quando hai i dati chiama "
                              f"{REGISTER_TOOL} (per un ospite ti dirà di chiedere l'accesso), altrimenti continua "
                              "a raccogliere.")
    return None
