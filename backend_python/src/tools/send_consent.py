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
The readers of the conversation live in `src/adk/turn_reading.py`, shared with
the step of the quote (`src/services/quote_step.py`).
"""
from __future__ import annotations

from collections.abc import Sequence

from google.adk.events import Event
from google.genai import types
from src.adk.turn_reading import asked_to_send, client_words, last_reply, plain_yes, turn_calls
from src.tools.quote_submit_tools import NOT_SENT_PREFIX

_QUOTE_TOOL = "suggest_quote_items"

_SAME_TURN = (
    f"{NOT_SENT_PREFIX} la richiesta è stata appena registrata in questo turno. "
    "Riepiloga le stanze e chiedi al cliente se vuole inviarla al team (STEP 2), poi aspetta il suo sì."
)
_NO_YES = (
    f"{NOT_SENT_PREFIX} manca il sì esplicito del cliente all'invio. Riepiloga le stanze e chiedi: "
    "\"Invio al nostro team la richiesta di preventivo? Confermi?\", poi aspetta un sì semplice."
)


def consent_refusal(events: Sequence[Event], invocation_id: str, user_content: types.Content | None) -> str | None:
    """None when the client gave an explicit yes to the send question, otherwise
    the "not sent" reply that tells the agent what to do."""
    if _QUOTE_TOOL in turn_calls(events, invocation_id):
        return _SAME_TURN
    if asked_to_send(last_reply(events, invocation_id)) and plain_yes(
        client_words(events, invocation_id, user_content)
    ):
        return None
    return _NO_YES
