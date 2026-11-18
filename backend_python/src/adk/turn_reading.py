"""
What the conversation says, read from the ADK session events: the reply the
client saw before this turn, the tools called, the client's own words, and
whether a message is a plain yes.

Shared by the explicit-yes check of the send (`src/tools/send_consent.py`) and
the step of the quote (`src/services/quote_step.py`): both read the same facts
the same way.
"""
from __future__ import annotations

import re
from collections.abc import Sequence

from google.adk.events import Event
from google.genai import types

from src.adk.video_attachments import is_skipped_video_note

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


def _without_courtesies(text: str) -> str:
    return ", ".join(c for c in (c.strip() for c in _CLAUSE.split(text)) if c and not _COURTESY.fullmatch(c))


def message_text(content: types.Content | None) -> str:
    """The visible text of a message: thoughts and tool parts left out."""
    if content is None or not content.parts:
        return ""
    return " ".join(p.text for p in content.parts if p.text and not p.thought).strip()


def tool_calls(event: Event) -> list[str]:
    """Names of the tools the event calls."""
    return [p.function_call.name or "" for p in (event.content.parts or []) if p.function_call] if event.content else []


def turn_calls(events: Sequence[Event], invocation_id: str) -> list[str]:
    """Tools called so far in this turn, in order."""
    return [name for e in events if e.invocation_id == invocation_id for name in tool_calls(e)]


def _previous_turn(events: Sequence[Event], invocation_id: str) -> str | None:
    """The invocation of the last assistant event before this turn."""
    shown = [e.invocation_id for e in events if e.invocation_id != invocation_id and e.author != "user"]
    return shown[-1] if shown else None


def last_reply(events: Sequence[Event], invocation_id: str) -> str:
    """Everything the assistant wrote in the last turn before this one (a question,
    a tool call, then a short note: the question is still part of it)."""
    shown = [
        (event.invocation_id, text) for event in events
        if event.invocation_id != invocation_id and event.author != "user" and not event.partial
        and (text := message_text(event.content))
    ]
    if not shown:
        return ""
    last = shown[-1][0]
    return "\n".join(text for turn, text in shown if turn == last)


def last_turn_calls(events: Sequence[Event], invocation_id: str) -> list[str]:
    """Tools the assistant called in the last turn before this one."""
    previous = _previous_turn(events, invocation_id)
    return turn_calls(events, previous) if previous is not None else []


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
    text = _without_courtesies(message.strip().strip("#").strip())
    return bool(_YES.search(text)) and not _HOLD.search(text)


def _has_video(content: types.Content) -> bool:
    return any(
        p.file_data is not None and (p.file_data.mime_type or "").startswith("video/") for p in content.parts or []
    )


def client_words(events: Sequence[Event], invocation_id: str, user_content: types.Content | None) -> str:
    """What the client wrote in this turn. A turn run again without its videos (the
    model refused one) carries only a system note: the client's words are in the
    message of the failed invocation: the last one before it, after the assistant's
    last reply, and with the video. Anything else (the note typed by the client, a
    session rebuilt without the message) has no words: never an older message's yes."""
    if not is_skipped_video_note(user_content):
        return message_text(user_content)
    # A state-only event (the refused video forgotten) has no parts: not a message.
    before = [e for e in events if e.invocation_id != invocation_id and e.content and e.content.parts]
    failed = before[-1] if before else None
    if failed is None or failed.author != "user" or failed.content is None or not _has_video(failed.content):
        return ""
    return message_text(failed.content)
