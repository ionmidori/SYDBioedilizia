"""
ADK plugin that times every model call of a chat turn.

Registered once on the `App`, so it covers the router and every sub-agent
without touching their callbacks. Plugin callbacks run before the agent's own
callbacks: the measured `duration_ms` therefore includes the Model Armor input
scan, which the guardrail reports separately (`guardrail_in_ms`) so the pure
model time can be derived (`model_ms`).
"""
from __future__ import annotations

from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.plugins.base_plugin import BasePlugin

from src.core.chat_timing import current_turn


def llm_call_key(callback_context: CallbackContext) -> str:
    """Key shared by the plugin and the guardrails for one in-flight model call."""
    return f"{callback_context.invocation_id}:{callback_context.agent_name}"


class LatencyPlugin(BasePlugin):
    def __init__(self) -> None:
        super().__init__(name="syd_latency")

    async def before_model_callback(
        self, *, callback_context: CallbackContext, llm_request: LlmRequest
    ) -> LlmResponse | None:
        turn = current_turn()
        if turn is not None:
            turn.llm_started(
                llm_call_key(callback_context),
                agent=callback_context.agent_name,
                model=llm_request.model or "unknown",
            )
        return None

    async def after_model_callback(
        self, *, callback_context: CallbackContext, llm_response: LlmResponse
    ) -> LlmResponse | None:
        turn = current_turn()
        if turn is None:
            return None
        key = llm_call_key(callback_context)
        if llm_response.partial:
            turn.llm_chunk(key)
            return None
        usage = llm_response.usage_metadata
        turn.llm_finished(
            key,
            prompt_tokens=usage.prompt_token_count if usage else None,
            cached_tokens=usage.cached_content_token_count if usage else None,
            thoughts_tokens=usage.thoughts_token_count if usage else None,
            output_tokens=usage.candidates_token_count if usage else None,
        )
        return None
