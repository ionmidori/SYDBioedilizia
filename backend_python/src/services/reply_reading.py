"""
What a reply or a message says, read from its text alone: the sentences of a
reply, the send question, a plain yes, the courtesies that close a request.

Shared by the explicit-yes check of the send (`src/tools/send_consent.py`) and
the step of the quote (`src/services/quote_step.py`). Readers of the ADK
session events (last reply, tool calls, the client's words) are in
`src/adk/turn_reading.py`.
"""
from __future__ import annotations

import re

# The send question: "Invio al nostro team…? Confermi?", "Vuoi che invii la richiesta?", "Procedo con
# l'invio al team?". A send word alone is not enough: "Vuoi inviare altre foto?" is another question.
_SEND_WORD = re.compile(r"\binvi\w*", re.IGNORECASE)
_SEND_OBJECT = re.compile(r"\b(team|richiesta|preventivo|revisione)\b", re.IGNORECASE)
# A sentence of the reply, with its end mark.
_SENTENCE = re.compile(r"[^.!?\n]+[.!?]*")
# A bare confirmation question: the send words are in the sentence before it ("Invio al team… Confermi?").
_BARE_CONFIRM = re.compile(r"(me lo |lo |la )?(confermi|procedo|posso procedere|va bene|d'accordo|ok)\s*\?", re.IGNORECASE)
_YES = re.compile(
    r"\b(s[iìí]|confermo|conferma|invia|inviala|invii|procedi|vai|ok|okay|certo|va bene|d'accordo|perfetto"
    r"|volentieri|esatto|assolutamente|giusto|yes)\b",
    re.IGNORECASE,
)
# A yes with any of these is not a plain yes: a change, more work, a doubt, a "not now".
_HOLD = re.compile(
    r"\?|\b(no|non|ma|però|prima|aspett\w*|aspe|annull\w*|modific\w*|aggiung\w*|cambi\w*|togli\w*"
    r"|anche|invece|dubbio|scheda|dopo|domani|tardi|ci pens\w*|ferm\w*|stop|sbagli\w*|troppo)\b",
    re.IGNORECASE,
)
# A clause that only closes the request ("non ho altro da aggiungere", "è tutto"): left
# out before the hold check, its "non"/"aggiungere" are no "not yet" and no more work.
# Whole clauses only: "non ho altro tempo" or "è tutto sbagliato" are no courtesy.
_CLAUSE = re.compile(r"[,.;!]+")
_COURTESY = re.compile(
    r"non ho (più )?(altro|nient['’ ]?altro|niente( altro)?)( da (aggiungere|dire|chiedere))?"
    r"|non (c['’]è|serve|mi serve) (più )?(altro|nient['’ ]?altro|niente( altro)?)"
    r"|nient['’ ]?altro|niente altro|(è|e['’]) tutto",
    re.IGNORECASE,
)


def without_courtesies(text: str) -> str:
    return ", ".join(c for c in (c.strip() for c in _CLAUSE.split(text)) if c and not _COURTESY.fullmatch(c))


def sentences(reply: str) -> list[str]:
    """The sentences of a reply, with their end marks."""
    return [s.strip() for s in _SENTENCE.findall(reply) if s.strip()]


def is_bare_confirm(sentence: str) -> bool:
    """"Confermi?", "Procedo?": a question that leans on the sentence before it."""
    return bool(_BARE_CONFIRM.fullmatch(sentence))


def names_send(sentence: str) -> bool:
    """The sentence is about sending the request to the team."""
    return bool(_SEND_WORD.search(sentence)) and bool(_SEND_OBJECT.search(sentence))


def asked_to_send(reply: str) -> bool:
    """A question of the reply is about sending the request: it names the send
    ("Vuoi che invii la richiesta al team?"), or it is a bare "Confermi?" right
    after a sentence that does. "Ti invieremo il preventivo. Posso aiutarti con
    altro?" is not."""
    parts = sentences(reply)
    for i, sentence in enumerate(parts):
        if not sentence.endswith("?"):
            continue
        if names_send(sentence) or (i > 0 and is_bare_confirm(sentence) and names_send(parts[i - 1])):
            return True
    return False


def plain_yes(message: str) -> bool:
    """A yes with no change, doubt or question ("sì, non ho altro da aggiungere" is one)."""
    text = without_courtesies(message.strip().strip("#").strip())
    return bool(_YES.search(text)) and not _HOLD.search(text)
