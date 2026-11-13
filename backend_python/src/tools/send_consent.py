"""
The client's explicit yes before a quote goes to the team.

The prompt says to call submit_quote_request only after an explicit "sì" to the
send question, but a rule in the prompt is not a control: in an eval the agent
sent the quote in the turn the client asked to register it. The tool checks the
conversation itself before sending:
- suggest_quote_items did not run in this turn (the send is always a later turn);
- the last reply the client saw before this turn asked to send;
- the client's message is a plain yes, with no change, doubt or question.

A wrong refusal costs one more question; a wrong send reaches the team.
"""
from __future__ import annotations

import re
from collections.abc import Sequence

from google.adk.events import Event
from google.genai import types
from src.tools.quote_submit_tools import NOT_SENT_PREFIX

_QUOTE_TOOL = "suggest_quote_items"

# The send question: "Invio al nostro team…? Confermi?", "Vuoi che la invii?", "Procedo con l'invio?".
_SEND_WORD = re.compile(r"\binvi", re.IGNORECASE)
_YES = re.compile(
    r"\b(s[iì]|confermo|conferma|invia|inviala|invii|procedi|vai|ok|okay|certo|va bene|d'accordo|perfetto)\b",
    re.IGNORECASE,
)
# A yes with any of these is not a plain yes: a change, a doubt, a "not now".
_HOLD = re.compile(
    r"\?|\b(no|non|ma|però|prima|aspetta|annulla|modific\w*|aggiung\w*|cambi\w*|togli\w*|scheda)\b",
    re.IGNORECASE,
)

_SAME_TURN = (
    f"{NOT_SENT_PREFIX} la richiesta è stata appena registrata in questo turno. "
    "Riepiloga le stanze e chiedi al cliente se vuole inviarla al team (STEP 2), poi aspetta il suo sì."
)
_NO_YES = (
    f"{NOT_SENT_PREFIX} manca il sì esplicito del cliente all'invio. Riepiloga le stanze e chiedi: "
    "\"Invio al nostro team la richiesta di preventivo? Confermi?\", poi aspetta la risposta."
)


def _text(content: types.Content | None) -> str:
    """The visible text of a message: thoughts and tool parts left out."""
    if content is None or not content.parts:
        return ""
    return " ".join(p.text for p in content.parts if p.text and not p.thought).strip()


def _calls(event: Event) -> list[str]:
    return [p.function_call.name or "" for p in (event.content.parts or []) if p.function_call] if event.content else []


def _last_reply(events: Sequence[Event], invocation_id: str) -> str:
    """The last assistant text the client saw before this turn."""
    for event in reversed(events):
        if event.invocation_id == invocation_id or event.author == "user" or event.partial:
            continue
        if text := _text(event.content):
            return text
    return ""


def _asked_to_send(reply: str) -> bool:
    return "?" in reply and bool(_SEND_WORD.search(reply))


def _plain_yes(message: str) -> bool:
    text = message.strip().strip("#").strip()
    return bool(_YES.search(text)) and not _HOLD.search(text)


def consent_refusal(events: Sequence[Event], invocation_id: str, user_content: types.Content | None) -> str | None:
    """None when the client gave an explicit yes to the send question, otherwise
    the "not sent" reply that tells the agent what to do."""
    if any(_QUOTE_TOOL in _calls(e) for e in events if e.invocation_id == invocation_id):
        return _SAME_TURN
    if _asked_to_send(_last_reply(events, invocation_id)) and _plain_yes(_text(user_content)):
        return None
    return _NO_YES
