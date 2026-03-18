"""
ADK Model Armor Guardrails — before_model and after_model callbacks.

These callbacks integrate Google Cloud Model Armor into the ADK agent pipeline,
providing runtime security at the LLM interaction boundary.

Architecture:
    User Input → before_model_callback → (if safe) → LLM → after_model_callback → User

Callbacks:
    - model_armor_before_model: Input guardrail (OWASP LLM01 — Prompt Injection)
    - model_armor_after_model:  Output guardrail (OWASP LLM02 — Data Leak)

References:
    - https://google.github.io/adk-docs/callbacks/
    - https://docs.cloud.google.com/model-armor/sanitize-prompts-responses
"""
from __future__ import annotations

import logging
from typing import Optional

from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest, LlmResponse
from google.genai import types

from src.services.model_armor.model_armor_client import get_model_armor_service

logger = logging.getLogger(__name__)

# Standard rejection message when input is blocked
_INPUT_BLOCKED_MESSAGE = (
    "Mi dispiace, non posso elaborare questa richiesta. "
    "Il contenuto è stato identificato come potenzialmente non sicuro. "
    "Per favore, riformula la tua domanda."
)

# Standard rejection message when output is blocked
_OUTPUT_BLOCKED_MESSAGE = (
    "Mi dispiace, la risposta generata conteneva informazioni sensibili "
    "ed è stata filtrata per la tua sicurezza. "
    "Per favore, riprova con una domanda diversa."
)


def _extract_last_user_text(llm_request: LlmRequest) -> str:
    """Extract the text of the last user message from an LlmRequest."""
    if not llm_request.contents:
        return ""
    for content in reversed(llm_request.contents):
        if content.role == "user" and content.parts:
            for part in content.parts:
                if hasattr(part, "text") and part.text:
                    return part.text
    return ""


def _extract_response_text(llm_response: LlmResponse) -> str:
    """Extract text from an LlmResponse."""
    if not llm_response.content or not llm_response.content.parts:
        return ""
    texts = []
    for part in llm_response.content.parts:
        if hasattr(part, "text") and part.text:
            texts.append(part.text)
    return " ".join(texts)


def _make_blocked_response(message: str) -> LlmResponse:
    """Create an LlmResponse with a blocked message (skips LLM call)."""
    return LlmResponse(
        content=types.Content(
            role="model",
            parts=[types.Part(text=message)],
        )
    )


def model_armor_before_model(
    callback_context: CallbackContext,
    llm_request: LlmRequest,
) -> Optional[LlmResponse]:
    """Input guardrail: blocks prompt injection and harmful input.

    ADK calls this BEFORE sending the request to the LLM.
    - Return LlmResponse → LLM call is SKIPPED, this response is used instead.
    - Return None → LLM call proceeds normally.

    Args:
        callback_context: ADK callback context with agent info.
        llm_request: The outgoing LLM request to inspect.

    Returns:
        LlmResponse if input is blocked, None to proceed.
    """
    service = get_model_armor_service()
    if service is None:
        # Model Armor disabled or misconfigured — pass through
        return None

    user_text = _extract_last_user_text(llm_request)
    if not user_text:
        # No text to scan (e.g., image-only input)
        return None

    agent_name = callback_context.agent_name
    logger.info(
        "[ModelArmor] Scanning input for agent=%s text_len=%d",
        agent_name,
        len(user_text),
    )

    verdict = service.sanitize_prompt(user_text)

    if verdict.is_blocked:
        logger.warning(
            "[ModelArmor] INPUT BLOCKED for agent=%s filters=%s state=%s",
            agent_name,
            verdict.matched_filters,
            verdict.filter_match_state,
        )
        return _make_blocked_response(_INPUT_BLOCKED_MESSAGE)

    logger.debug(
        "[ModelArmor] Input clean for agent=%s state=%s",
        agent_name,
        verdict.filter_match_state,
    )
    return None


def model_armor_after_model(
    callback_context: CallbackContext,
    llm_response: LlmResponse,
    **kwargs,
) -> Optional[LlmResponse]:
    """Output guardrail: catches PII/sensitive data leaks in model responses.

    ADK calls this AFTER receiving a response from the LLM.
    - Return LlmResponse → original response is REPLACED with this one.
    - Return None → original response passes through unchanged.

    Args:
        callback_context: ADK callback context with agent info.
        llm_response: The raw LLM response to inspect.

    Returns:
        Replacement LlmResponse if output is blocked, None to pass through.
    """
    service = get_model_armor_service()
    if service is None:
        # Model Armor disabled or misconfigured — pass through
        return None

    response_text = _extract_response_text(llm_response)
    if not response_text:
        # No text to scan (e.g., tool call response)
        return None

    agent_name = callback_context.agent_name
    logger.info(
        "[ModelArmor] Scanning output for agent=%s text_len=%d",
        agent_name,
        len(response_text),
    )

    verdict = service.sanitize_response(response_text)

    if verdict.is_blocked:
        logger.warning(
            "[ModelArmor] OUTPUT BLOCKED for agent=%s filters=%s state=%s",
            agent_name,
            verdict.matched_filters,
            verdict.filter_match_state,
        )
        return _make_blocked_response(_OUTPUT_BLOCKED_MESSAGE)

    logger.debug(
        "[ModelArmor] Output clean for agent=%s state=%s",
        agent_name,
        verdict.filter_match_state,
    )
    return None
