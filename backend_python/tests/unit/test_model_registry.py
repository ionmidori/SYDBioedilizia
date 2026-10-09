"""
Gemini model registry (src/core/models.py, src/adk/model_factory.py).

Model IDs live only in settings; code resolves them by role. These tests pin
the resolution rules and guard against hardcoded IDs creeping back in.
"""
import re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.genai import errors as genai_errors
from google.genai import types
from src.adk.model_factory import build_adk_model
from src.core import models
from src.core.config import settings
from src.core.models import (
    ModelRole,
    build_generate_content_config,
    build_retry_options,
    build_thinking_config,
    get_model_id,
    get_model_profile,
)

BACKEND_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def clean_registry(monkeypatch):
    """Registry settings reset to 'nothing configured' except the fallback."""
    monkeypatch.setattr(settings, "CHAT_MODEL_VERSION", "fallback-model")
    for role in ("ROUTER", "TRIAGE", "DESIGN", "QUOTE", "VISION", "INSIGHT"):
        monkeypatch.setattr(settings, f"MODEL_{role}", None)
        monkeypatch.setattr(settings, f"THINKING_LEVEL_{role}", None)
    monkeypatch.setattr(settings, "MODEL_IMAGE", "image-model")
    monkeypatch.setattr(settings, "LLM_TIMEOUT_SECONDS", None)
    monkeypatch.setattr(settings, "LLM_RETRY_ATTEMPTS", None)
    monkeypatch.setattr(settings, "LLM_MAX_OUTPUT_TOKENS", None)
    return monkeypatch


def test_text_roles_fall_back_to_chat_model(clean_registry):
    for role in ModelRole:
        expected = "image-model" if role is ModelRole.IMAGE else "fallback-model"
        assert get_model_id(role) == expected


def test_role_override_wins(clean_registry):
    clean_registry.setattr(settings, "MODEL_QUOTE", "quote-model")
    assert get_model_id(ModelRole.QUOTE) == "quote-model"
    assert get_model_id(ModelRole.ROUTER) == "fallback-model"


def test_nothing_configured_means_no_generation_config(clean_registry):
    # The request must go out exactly as without a config (no behavior change).
    assert build_generate_content_config(ModelRole.ROUTER) is None
    assert build_retry_options(ModelRole.ROUTER) is None


def test_thinking_level_is_mapped_case_insensitively(clean_registry):
    clean_registry.setattr(settings, "THINKING_LEVEL_ROUTER", "Minimal")
    assert build_thinking_config(ModelRole.ROUTER) == types.ThinkingConfig(
        thinking_level=types.ThinkingLevel.MINIMAL
    )


def test_invalid_thinking_level_is_rejected(clean_registry):
    clean_registry.setattr(settings, "THINKING_LEVEL_QUOTE", "turbo")
    with pytest.raises(ValueError, match="THINKING_LEVEL_QUOTE"):
        build_thinking_config(ModelRole.QUOTE)


def test_chat_limits_apply_to_chat_roles_only(clean_registry):
    clean_registry.setattr(settings, "LLM_TIMEOUT_SECONDS", 12.5)
    clean_registry.setattr(settings, "LLM_MAX_OUTPUT_TOKENS", 1024)
    config = build_generate_content_config(ModelRole.TRIAGE)
    assert config is not None
    assert config.http_options is not None
    assert config.http_options.timeout == 12500  # milliseconds
    assert config.max_output_tokens == 1024
    assert get_model_profile(ModelRole.VISION).timeout_seconds is None


def test_retry_only_for_transient_errors(clean_registry):
    clean_registry.setattr(settings, "LLM_RETRY_ATTEMPTS", 2)
    retry = build_retry_options(ModelRole.ROUTER)
    assert retry is not None
    assert retry.attempts == 2
    assert set(retry.http_status_codes or []) == {408, 429, 500, 502, 503, 504}
    clean_registry.setattr(settings, "LLM_RETRY_ATTEMPTS", 1)
    assert build_retry_options(ModelRole.ROUTER) is None


def test_adk_model_carries_id_and_retry(clean_registry):
    clean_registry.setattr(settings, "MODEL_ROUTER", "router-model")
    clean_registry.setattr(settings, "LLM_RETRY_ATTEMPTS", 3)
    model = build_adk_model(ModelRole.ROUTER)
    assert model.model == "router-model"
    assert model.retry_options is not None and model.retry_options.attempts == 3


def test_genai_client_uses_api_key_by_default(clean_registry):
    clean_registry.setattr(settings, "GOOGLE_GENAI_USE_VERTEXAI", False)
    with patch("src.core.models.genai.Client") as client_cls:
        models.get_genai_client()
    client_cls.assert_called_once_with(api_key=settings.api_key)


def test_genai_client_uses_vertex_when_enabled(clean_registry):
    clean_registry.setattr(settings, "GOOGLE_GENAI_USE_VERTEXAI", True)
    clean_registry.setattr(settings, "GOOGLE_CLOUD_PROJECT", "proj")
    clean_registry.setattr(settings, "GOOGLE_CLOUD_LOCATION", "europe-west1")
    with patch("src.core.models.genai.Client") as client_cls:
        models.get_genai_client()
    client_cls.assert_called_once_with(vertexai=True, project="proj", location="europe-west1")


def test_genai_client_is_a_singleton(clean_registry):
    with patch("src.core.models.genai.Client") as client_cls:
        first = models.get_genai_client()
        second = models.get_genai_client()
    assert first is second
    client_cls.assert_called_once()


async def test_validate_reports_unavailable_models(clean_registry):
    clean_registry.setattr(settings, "MODEL_QUOTE", "retired-model")

    async def fake_get(model: str):
        if model == "retired-model":
            raise genai_errors.ClientError(404, {"error": {"code": 404, "message": "not found"}})
        return SimpleNamespace(name=model)

    client = MagicMock()
    client.aio.models.get = AsyncMock(side_effect=fake_get)
    with patch("src.core.models.get_genai_client", return_value=client):
        problems = await models.validate_configured_models()

    assert len(problems) == 1
    assert "retired-model" in problems[0]


def test_agents_resolve_models_from_the_registry():
    from src.adk import agents

    assert agents.syd_orchestrator.model.model == get_model_id(ModelRole.ROUTER)
    assert agents.quote_agent.model.model == get_model_id(ModelRole.QUOTE)


# ── Guard: no hardcoded Gemini model IDs outside the registry ────────────────

_MODEL_LITERAL = re.compile(r"""["'/]gemini-[0-9a-z]""")
# config.py is the registry itself; scripts/debug holds one-off scripts that
# are not held to project standards (see scripts/debug/README.md).
_ALLOWED = {BACKEND_ROOT / "src" / "core" / "config.py"}
_ALLOWED_DIRS = {BACKEND_ROOT / "scripts" / "debug"}


def test_no_hardcoded_gemini_model_ids():
    offenders = []
    for root in (BACKEND_ROOT / "src", BACKEND_ROOT / "scripts", BACKEND_ROOT / "main.py"):
        files = [root] if root.is_file() else root.rglob("*.py")
        for path in files:
            if path in _ALLOWED or any(d in path.parents for d in _ALLOWED_DIRS):
                continue
            for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if _MODEL_LITERAL.search(line):
                    offenders.append(f"{path.relative_to(BACKEND_ROOT)}:{lineno}: {line.strip()}")
    assert not offenders, (
        "Gemini model IDs must come from settings via src/core/models.py "
        "(ModelRole / get_model_id), not literals:\n" + "\n".join(offenders)
    )
