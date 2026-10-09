"""
Gemini model registry: one model per ROLE, resolved from settings.

Nothing outside `src/core/config.py` names a Gemini model. Code asks for a
role instead:

    from src.core.models import ModelRole, get_model_id, get_genai_client

    response = await get_genai_client().aio.models.generate_content(
        model=get_model_id(ModelRole.VISION), ...
    )

ADK agents get a ready-made model object and generation config from
`src/adk/model_factory.py` (kept there so importing this module does not load ADK).

Switching a model, its thinking level, timeout or retries is an env change on
Cloud Run (`MODEL_<ROLE>`, `THINKING_LEVEL_<ROLE>`, `LLM_*`), with immediate
rollback, and `validate_configured_models()` checks at startup that every
configured ID is still served (a retired model fails at deploy, not in chat).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import StrEnum
from functools import lru_cache

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from src.core.config import settings

logger = logging.getLogger(__name__)


class ModelRole(StrEnum):
    ROUTER = "router"
    TRIAGE = "triage"
    DESIGN = "design"
    QUOTE = "quote"
    VISION = "vision"
    INSIGHT = "insight"
    IMAGE = "image"


# Roles served by ADK chat agents: they get the per-call limits (timeout, retry,
# max output tokens). Helpers keep their own call-site configuration.
_CHAT_ROLES = frozenset({ModelRole.ROUTER, ModelRole.TRIAGE, ModelRole.DESIGN, ModelRole.QUOTE})

_THINKING_LEVELS = {
    "minimal": types.ThinkingLevel.MINIMAL,
    "low": types.ThinkingLevel.LOW,
    "medium": types.ThinkingLevel.MEDIUM,
    "high": types.ThinkingLevel.HIGH,
}


@dataclass(frozen=True)
class ModelProfile:
    role: ModelRole
    model: str
    thinking_level: str | None = None
    timeout_seconds: float | None = None
    retry_attempts: int | None = None
    max_output_tokens: int | None = None


def get_model_profile(role: ModelRole) -> ModelProfile:
    """Resolve the configured profile for `role` (read at call time, env-driven)."""
    if role is ModelRole.IMAGE:
        return ModelProfile(role=role, model=settings.MODEL_IMAGE)
    key = role.value.upper()
    model = getattr(settings, f"MODEL_{key}") or settings.CHAT_MODEL_VERSION
    thinking = getattr(settings, f"THINKING_LEVEL_{key}")
    is_chat = role in _CHAT_ROLES
    return ModelProfile(
        role=role,
        model=model,
        thinking_level=thinking.lower() if thinking else None,
        timeout_seconds=settings.LLM_TIMEOUT_SECONDS if is_chat else None,
        retry_attempts=settings.LLM_RETRY_ATTEMPTS if is_chat else None,
        max_output_tokens=settings.LLM_MAX_OUTPUT_TOKENS if is_chat else None,
    )


def get_model_id(role: ModelRole) -> str:
    return get_model_profile(role).model


def build_thinking_config(role: ModelRole) -> types.ThinkingConfig | None:
    level = get_model_profile(role).thinking_level
    if level is None:
        return None
    if level not in _THINKING_LEVELS:
        raise ValueError(
            f"THINKING_LEVEL_{role.value.upper()}={level!r}: expected one of {sorted(_THINKING_LEVELS)}"
        )
    return types.ThinkingConfig(thinking_level=_THINKING_LEVELS[level])


def build_generate_content_config(role: ModelRole) -> types.GenerateContentConfig | None:
    """Generation config for an ADK agent; None when nothing is configured
    (the request then goes out exactly as without a config)."""
    profile = get_model_profile(role)
    thinking = build_thinking_config(role)
    http_options = None
    if profile.timeout_seconds is not None:
        # HttpOptions.timeout is in milliseconds.
        http_options = types.HttpOptions(timeout=int(profile.timeout_seconds * 1000))
    if thinking is None and http_options is None and profile.max_output_tokens is None:
        return None
    return types.GenerateContentConfig(
        thinking_config=thinking,
        max_output_tokens=profile.max_output_tokens,
        http_options=http_options,
    )


def build_retry_options(role: ModelRole) -> types.HttpRetryOptions | None:
    """Retry policy for transient errors only (rate limit, server side)."""
    attempts = get_model_profile(role).retry_attempts
    if attempts is None or attempts <= 1:
        return None
    return types.HttpRetryOptions(
        attempts=attempts,
        initial_delay=0.5,
        max_delay=4.0,
        http_status_codes=[408, 429, 500, 502, 503, 504],
    )


@lru_cache(maxsize=1)
def get_genai_client() -> genai.Client:
    """Shared google-genai client for helpers (vision, insight, renders).

    Same backend selection as ADK: Vertex AI when GOOGLE_GENAI_USE_VERTEXAI is
    true (ADC credentials, GOOGLE_CLOUD_LOCATION), AI Studio API key otherwise.
    One client per process reuses its HTTP connection pool across calls.
    """
    if settings.GOOGLE_GENAI_USE_VERTEXAI:
        return genai.Client(
            vertexai=True,
            project=settings.GOOGLE_CLOUD_PROJECT,
            location=settings.GOOGLE_CLOUD_LOCATION,
        )
    return genai.Client(api_key=settings.api_key)


def configured_models() -> dict[ModelRole, str]:
    return {role: get_model_id(role) for role in ModelRole}


async def validate_configured_models() -> list[str]:
    """Check that every configured model ID is served by the active backend.

    Returns the problems found (empty list = all good); logs each at ERROR.
    With MODEL_VALIDATION_STRICT=true the caller should refuse to start.
    """
    problems: list[str] = []
    client = get_genai_client()
    for model in sorted(set(configured_models().values())):
        try:
            await client.aio.models.get(model=model)
        except genai_errors.APIError as exc:
            problem = f"model {model!r} is not available: {exc.code} {exc.message}"
            problems.append(problem)
            logger.error("[Models] %s", problem, extra={"event": "model_unavailable", "model": model})
    if not problems:
        logger.info("[Models] All configured models are available", extra={"models": configured_models()})
    return problems
