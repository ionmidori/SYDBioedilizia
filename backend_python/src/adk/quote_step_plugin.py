"""
ADK plugin that logs the step of the quote once per turn (strada B, passo 1).

`before_run_callback` runs after the turn's message and session facts are in
the session (the orchestrator passes them as `state_delta`), before any agent:
the step is the one the turn starts at (`src/services/quote_step.py`). Only a
log line, so the step can be checked against real chats before the tools rely
on it (passo 2); it never changes or stops the turn.

Everything comes from the session: the card of a draft too, read by the
orchestrator before the turn (`CARD_PENDING_STATE_KEY`), so no tool of this
turn has written it yet and the plugin does no I/O. A turn run again in the
same request (the retry without refused videos, or after a lost session) is
logged once. The line carries no id: the formatter adds `session_ref`.
"""
from __future__ import annotations

from collections import deque

from google.adk.agents.invocation_context import InvocationContext
from google.adk.plugins.base_plugin import BasePlugin
from google.genai import types

from src.adk.quote_facts import quote_facts
from src.adk.session_context import HOUSE_QUOTE_STATE_KEY, SESSION_CONTEXT_STATE_KEY
from src.core.context import get_request_id
from src.core.logger import get_logger
from src.services.quote_step import QuoteFacts, quote_step

logger = get_logger(__name__)

# The request id outside a request (evals, tests): nothing to tell runs apart by.
_NO_REQUEST = "system"
# Requests whose step is already logged: a retry of the turn runs the plugin again. Module
# level, not a ContextVar: a run in a copied context would not see the mark of the first.
_LOGGED_KEPT = 256
_logged_requests: deque[str] = deque(maxlen=_LOGGED_KEPT)


def _log(facts: QuoteFacts, *, quote_read: bool) -> None:
    """`quote_read` False: the house quote could not be read (or a guest), so the
    step was computed as if there were none."""
    logger.info(
        "[QuoteStep] Step of the turn",
        extra={
            "event": "quote_step",
            "quote_step": quote_step(facts).value,
            "quote_status": facts.quote_status,
            "card_pending": facts.card_pending,
            "quote_read": quote_read,
            "is_guest": facts.is_guest,
        },
    )


def _already_logged() -> bool:
    """True when this request's step is already logged; marks it otherwise."""
    request = get_request_id()
    if request == _NO_REQUEST:
        return False
    if request in _logged_requests:
        return True
    _logged_requests.append(request)
    return False


class QuoteStepPlugin(BasePlugin):
    def __init__(self) -> None:
        super().__init__(name="syd_quote_step")

    async def before_run_callback(self, *, invocation_context: InvocationContext) -> types.Content | None:
        try:
            session = invocation_context.session
            if not session.state.get(SESSION_CONTEXT_STATE_KEY):
                return None  # not a chat turn of the orchestrator (no session facts)
            if _already_logged():
                return None
            facts = quote_facts(
                session.events, invocation_context.invocation_id, invocation_context.user_content, session.state
            )
            _log(facts, quote_read=session.state.get(HOUSE_QUOTE_STATE_KEY) is not None)
        except Exception as e:  # noqa: BLE001 - a log line must never stop the turn
            logger.warning(f"[QuoteStep] Step not computed: {type(e).__name__}")
        return None
