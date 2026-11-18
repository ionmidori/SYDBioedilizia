"""
ADK plugin that logs the step of the quote once per turn (strada B, passo 1).

`before_run_callback` runs after the turn's message and session facts are in
the session (the orchestrator passes them as `state_delta`), before any agent:
the step is the one the turn starts at (`src/services/quote_step.py`). Only a
log line, so the step can be checked against real chats before the tools rely
on it (passo 2); it never changes or stops the turn.

A draft needs its card (does it still ask something?): that read goes to the
background, so the model call does not wait for Firestore. The line carries no
id: the formatter adds `session_ref`.
"""
from __future__ import annotations

from dataclasses import replace

from google.adk.agents.invocation_context import InvocationContext
from google.adk.plugins.base_plugin import BasePlugin
from google.api_core.exceptions import GoogleAPIError
from google.auth.exceptions import GoogleAuthError
from google.genai import types

from src.adk.background import run_in_background
from src.adk.quote_facts import quote_facts
from src.adk.session_context import HOUSE_QUOTE_STATE_KEY, SESSION_CONTEXT_STATE_KEY
from src.core.exceptions import AppException
from src.core.logger import get_logger
from src.services.confirmation_service import confirmation_state
from src.services.quote_state import QuoteStatus
from src.services.quote_step import QuoteFacts, quote_step

logger = get_logger(__name__)


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


async def _card_pending(project_id: str) -> bool | None:
    """The card still asks the client something; None when it cannot be read."""
    try:
        state = await confirmation_state(project_id)
    # Firestore down (GoogleAPIError), no credentials (GoogleAuthError), a malformed
    # spec (ValidationError is a ValueError), the store's own errors (AppException).
    except (GoogleAPIError, GoogleAuthError, ValueError, AppException) as e:
        logger.warning(f"[QuoteStep] Could not read the card: {type(e).__name__}")
        return None
    return any(section.pending for section in state.sections)


async def _log_with_card(facts: QuoteFacts, project_id: str) -> None:
    pending = await _card_pending(project_id)
    _log(replace(facts, card_pending=pending), quote_read=True)


class QuoteStepPlugin(BasePlugin):
    def __init__(self) -> None:
        super().__init__(name="syd_quote_step")

    async def before_run_callback(self, *, invocation_context: InvocationContext) -> types.Content | None:
        try:
            session = invocation_context.session
            if not session.state.get(SESSION_CONTEXT_STATE_KEY):
                return None  # not a chat turn of the orchestrator (no session facts)
            facts = quote_facts(
                session.events, invocation_context.invocation_id, invocation_context.user_content,
                session.state, card_pending=None,
            )
            if facts.quote_status == QuoteStatus.DRAFT:
                # The chat session id is the project id.
                run_in_background(_log_with_card(facts, session.id), name="quote_step_log")
            else:
                _log(facts, quote_read=session.state.get(HOUSE_QUOTE_STATE_KEY) is not None)
        except Exception as e:  # noqa: BLE001 - a log line must never stop the turn
            logger.warning(f"[QuoteStep] Step not computed: {type(e).__name__}")
        return None
