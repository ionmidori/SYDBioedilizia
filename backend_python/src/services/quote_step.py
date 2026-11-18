"""
The step of the quote in the chat, computed by code (strada B, passo 1).

Today the order of the steps (collect, confirm the registration, login, phone,
register, card, send question, send, team) lives in the prompt of the `quote`
agent, and the model gets it wrong. This module computes the step from facts
the code already knows: guest or not, the stored house quote and its card, the
phone on file, the reply the client saw before this turn, the tools called and
the client's words (the same readers as the explicit yes of the send,
`src/services/reply_reading.py`). The model will read the step, not choose it.

Passo 1 only logs the step once per turn (`QuoteStepPlugin`): no behaviour
changes. The arrows are the diagram "I passi nella strada B" of the analysis
(https://claude.ai/artifact/F4xsPCoVBbqLTLPRCfcYWL). A wrong step costs at most
one more question once the tools check it (passo 2).
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

_REGISTER_TOOL = "suggest_quote_items"
_LOGIN_TOOL = "request_login"
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
    asked = _LOGIN_TOOL in f.last_turn_calls or bool(_LOGIN_TEXT.search(f.last_reply))
    return asked and bool(_QUOTE_OBJECT.search(f.last_reply))


def _confirmed(f: QuoteFacts) -> QuoteStep:
    """The registration is confirmed: login for a guest, then the phone once, then register."""
    if f.is_guest:
        return QuoteStep.ACCESSO
    return QuoteStep.REGISTRA if f.phone_on_file else QuoteStep.TELEFONO


def _answer(f: QuoteFacts, asked: QuoteStep, on_yes: QuoteStep) -> QuoteStep:
    """The client's answer to a question of the last reply: a plain yes goes on, a
    question without a change asks again, anything else goes back to collecting."""
    if plain_yes(f.client_words):
        return on_yes
    if "?" in f.client_words and not _asks_change(f.client_words):
        return asked
    return QuoteStep.RACCOLTA


def _with_team(f: QuoteFacts) -> QuoteStep:
    relayed = _REGISTER_TOOL in f.turn_calls or _asks_change(f.client_words) or asks_to_register(f.client_words)
    return QuoteStep.INOLTRO if relayed else QuoteStep.AL_TEAM


def _on_draft(f: QuoteFacts) -> QuoteStep:
    if asks_to_register(f.client_words):
        return QuoteStep.REGISTRA  # the phone was asked at the first registration
    if _asks_change(f.client_words):
        return QuoteStep.RACCOLTA  # new work, at the card or anywhere: modifiche -> R
    if f.card_pending:
        return QuoteStep.SCHEDA
    if asked_to_send(f.last_reply):
        return _answer(f, QuoteStep.DOMANDA_INVIO, QuoteStep.INVIO)
    return QuoteStep.DOMANDA_INVIO


def _without_draft(f: QuoteFacts) -> QuoteStep:
    if not f.is_guest and not f.phone_on_file and _asked_phone(f.last_reply):
        return QuoteStep.REGISTRA  # asked once, whatever the answer
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
    if _REGISTER_TOOL in f.turn_calls:
        return QuoteStep.SCHEDA
    if _LOGIN_TOOL in f.turn_calls:
        return QuoteStep.ACCESSO
    if _PHONE_TOOL in f.turn_calls:
        return QuoteStep.REGISTRA
    if action == "update":
        return _on_draft(f)
    return _without_draft(f)  # no quote, or a sent/rejected one: the next revision is a new request
