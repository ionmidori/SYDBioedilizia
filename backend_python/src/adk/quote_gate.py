"""
The step of the quote as a control for the `quote` agent (strada B, PR 2).

Two hooks on the agent, both computing the step from the ADK session with the
same readers as `QuoteStepPlugin` (`src/adk/quote_facts.py`):
- `quote_agent_instruction`: the session block ends with the step line, so the
  model reads the step instead of working it out from the prompt. It is computed
  on every model call: after a tool the next call reads the step that follows.
- `quote_step_gate` (before_tool_callback): a tool called out of step is not run;
  the agent gets back what to do instead (`step_refusal`). The refused call does
  not count as called (`src/adk/turn_reading.py`), but a refused registration
  opens the login step of a guest (`QuoteFacts.register_refused`).

Both stay out of a turn without the session facts (evals without the
orchestrator), and a fault in reading the step never stops the turn: no line,
no gate.
"""
from __future__ import annotations

from typing import Any

from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools import BaseTool, ToolContext

from src.adk.quote_facts import quote_facts
from src.adk.session_context import SESSION_CONTEXT_STATE_KEY, session_context_instruction
from src.adk.turn_reading import calls_before
from src.core.logger import get_logger
from src.services.quote_state import ai_draft_action
from src.services.quote_step import (
    LOGIN_TOOL,
    REGISTER_TOOL,
    QuoteFacts,
    quote_step,
    step_line,
    step_refusal,
)

logger = get_logger(__name__)

_GATED_TOOLS = frozenset({REGISTER_TOOL, LOGIN_TOOL})
# What a session read wrongly can raise in the readers (a malformed event or state).
_READ_ERRORS = (AttributeError, KeyError, TypeError, ValueError)


def _action(facts: QuoteFacts) -> str | None:
    return ai_draft_action(facts.quote_status, facts.delivery_status)


def quote_agent_instruction(context: ReadonlyContext) -> str:
    """The quote agent's dynamic instruction: the session block with its step line."""
    line: str | None = None
    state = context.state
    if state.get(SESSION_CONTEXT_STATE_KEY):
        try:
            facts = quote_facts(context.session.events, context.invocation_id, context.user_content, state)
            line = step_line(quote_step(facts), _action(facts), quote_sent=facts.quote_sent)
        except _READ_ERRORS as e:
            logger.warning(f"[QuoteGate] Step line not computed: {type(e).__name__}")
    return session_context_instruction(context, step_line=line, playbook_field="prompt_guidance")


async def quote_step_gate(tool: BaseTool, args: dict[str, Any], tool_context: ToolContext) -> dict[str, str] | None:
    """None to run the tool; otherwise the answer the agent gets instead."""
    if tool.name not in _GATED_TOOLS:
        return None
    session = tool_context.session
    if not session.state.get(SESSION_CONTEXT_STATE_KEY):
        return None  # not a chat turn of the orchestrator (no session facts)
    try:
        # Only the calls that already ran: the other calls of the same model response
        # have not run nor been checked (src/adk/turn_reading.py).
        facts = quote_facts(
            session.events, tool_context.invocation_id, tool_context.user_content, session.state, answered_only=True
        )
        step = quote_step(facts)
        before = calls_before(session.events, tool_context.invocation_id, tool_context.function_call_id)
        refusal = step_refusal(
            step, tool.name, registered_this_turn=REGISTER_TOOL in before, is_guest=facts.is_guest
        )
    except _READ_ERRORS as e:
        logger.warning(f"[QuoteGate] Step not computed, tool let through: {type(e).__name__}")
        return None
    if refusal is None:
        return None
    logger.warning(
        "[QuoteGate] Tool refused out of step",
        extra={"event": "quote_step_gate", "quote_step": step.value, "tool": tool.name},
    )
    return {"result": refusal}
