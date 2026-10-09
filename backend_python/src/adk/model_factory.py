"""ADK model objects built from the Gemini model registry (src/core/models.py)."""
from __future__ import annotations

from google.adk.models.google_llm import Gemini

from src.core.models import ModelRole, build_retry_options, get_model_id


def build_adk_model(role: ModelRole) -> Gemini:
    """Model ID + retry policy for an ADK agent, resolved from settings."""
    return Gemini(model=get_model_id(role), retry_options=build_retry_options(role))
