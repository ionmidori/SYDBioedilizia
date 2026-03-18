"""
RED → GREEN Tests: Model Armor OUTPUT Guardrail (after_model_callback).

TDD Step: These tests are written FIRST (Red phase), then the guardrails
implementation makes them pass (Green phase).

Tests:
    1. PII leak is BLOCKED → callback returns replacement LlmResponse
    2. Clean response PASSES → callback returns None
    3. API failure → fail-open (callback returns None)
    4. Feature flag disabled → bypass (callback returns None)
    5. Empty response → passes through without API call
"""
import sys
import pytest
from dataclasses import dataclass
from unittest.mock import MagicMock, patch


# ── Stub classes for google.adk.models ───────────────────────────────────────

@dataclass
class _StubLlmResponse:
    """Minimal stub for google.adk.models.LlmResponse."""
    content: object = None


@dataclass
class _StubLlmRequest:
    """Minimal stub for google.adk.models.LlmRequest."""
    contents: list = None
    config: object = None


# ── Mock google.adk modules before importing guardrails ──────────────────────
if "google.adk" not in sys.modules:
    models_mock = MagicMock()
    models_mock.LlmResponse = _StubLlmResponse
    models_mock.LlmRequest = _StubLlmRequest

    adk_mock = MagicMock()
    sys.modules["google.adk"] = adk_mock
    sys.modules["google.adk.agents"] = adk_mock.agents
    sys.modules["google.adk.agents.callback_context"] = MagicMock()
    sys.modules["google.adk.models"] = models_mock
    sys.modules["google.adk.runners"] = MagicMock()
    sys.modules["google.adk.sessions"] = MagicMock()

from src.adk.guardrails import (
    model_armor_after_model,
    _OUTPUT_BLOCKED_MESSAGE,
)
from src.services.model_armor.model_armor_client import SanitizationVerdict


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def mock_callback_context():
    """Create a minimal CallbackContext mock."""
    ctx = MagicMock()
    ctx.agent_name = "syd_orchestrator"
    return ctx


@pytest.fixture
def mock_llm_request():
    """Create a minimal LlmRequest mock (for context in after_model)."""
    request = MagicMock()
    request.contents = []
    return request


@pytest.fixture
def make_llm_response():
    """Factory fixture — returns a function to create an LlmResponse with given text."""
    def _make(text: str):
        from google.genai import types
        from src.adk.guardrails import _make_blocked_response
        # Build a real-ish LlmResponse structure
        response = MagicMock()
        content = types.Content(
            role="model",
            parts=[types.Part(text=text)],
        )
        response.content = content
        return response
    return _make


@pytest.fixture
def blocked_output_verdict():
    """Simulate MATCH_FOUND on output (SDP detected PII leak)."""
    return SanitizationVerdict(
        is_blocked=True,
        filter_match_state="FilterMatchState.MATCH_FOUND",
        matched_filters={"sdp": "MatchState.MATCH_FOUND"},
        raw_response=None,
    )


@pytest.fixture
def clean_output_verdict():
    """Simulate NO_MATCH_FOUND on output (clean response)."""
    return SanitizationVerdict(
        is_blocked=False,
        filter_match_state="FilterMatchState.NO_MATCH_FOUND",
        matched_filters={
            "sdp": "MatchState.NO_MATCH_FOUND",
            "rai": "MatchState.NO_MATCH_FOUND",
        },
        raw_response=None,
    )


# ── Tests ────────────────────────────────────────────────────────────────────


class TestModelArmorOutputGuardrail:
    """Tests for model_armor_after_model callback."""

    @patch("src.adk.guardrails.get_model_armor_service")
    def test_pii_leak_blocked(
        self, mock_get_service, mock_callback_context,
        make_llm_response, blocked_output_verdict,
    ):
        """RED: If Model Armor detects PII in the response, callback returns
        a replacement LlmResponse → original output is REPLACED."""
        mock_service = MagicMock()
        mock_service.sanitize_response.return_value = blocked_output_verdict
        mock_get_service.return_value = mock_service

        llm_response = make_llm_response(
            "Il codice fiscale del cliente è RSSMRA85T10A562S e il suo "
            "numero di carta è 4111-1111-1111-1111."
        )

        result = model_armor_after_model(
            mock_callback_context, llm_response,
        )

        # Assert: returns a DIFFERENT LlmResponse → original replaced
        assert result is not None
        assert result.content.role == "model"
        assert "informazioni sensibili" in result.content.parts[0].text
        mock_service.sanitize_response.assert_called_once()

    @patch("src.adk.guardrails.get_model_armor_service")
    def test_clean_response_passes(
        self, mock_get_service, mock_callback_context,
        make_llm_response, clean_output_verdict,
    ):
        """GREEN: If Model Armor finds no issues, callback returns None
        → original response passes through unchanged."""
        mock_service = MagicMock()
        mock_service.sanitize_response.return_value = clean_output_verdict
        mock_get_service.return_value = mock_service

        llm_response = make_llm_response(
            "Il costo stimato per la ristrutturazione del bagno è tra 8.000€ e 12.000€."
        )

        result = model_armor_after_model(
            mock_callback_context, llm_response,
        )

        assert result is None  # original passes through
        mock_service.sanitize_response.assert_called_once()

    @patch("src.adk.guardrails.get_model_armor_service")
    def test_api_failure_degrades_gracefully(
        self, mock_get_service, mock_callback_context,
        make_llm_response,
    ):
        """EDGE: If Model Armor API fails, callback returns None (fail-open)."""
        error_result = SanitizationVerdict(
            is_blocked=False,
            filter_match_state="API_ERROR",
            matched_filters={},
            raw_response=None,
        )
        mock_service = MagicMock()
        mock_service.sanitize_response.return_value = error_result
        mock_get_service.return_value = mock_service

        llm_response = make_llm_response("Test output")

        result = model_armor_after_model(
            mock_callback_context, llm_response,
        )

        assert result is None  # fail-open

    @patch("src.adk.guardrails.get_model_armor_service")
    def test_disabled_flag_bypasses(
        self, mock_get_service, mock_callback_context,
        make_llm_response,
    ):
        """CONFIG: When service is None (disabled), callback returns None immediately."""
        mock_get_service.return_value = None

        llm_response = make_llm_response("Some response with PII")

        result = model_armor_after_model(
            mock_callback_context, llm_response,
        )

        assert result is None  # bypass

    @patch("src.adk.guardrails.get_model_armor_service")
    def test_empty_response_passes_through(
        self, mock_get_service, mock_callback_context,
    ):
        """EDGE: If response has no text parts (e.g., tool call),
        callback returns None without calling Model Armor."""
        from google.genai import types

        mock_service = MagicMock()
        mock_get_service.return_value = mock_service

        # Response with no text parts
        llm_response = MagicMock()
        llm_response.content = types.Content(role="model", parts=[])

        result = model_armor_after_model(
            mock_callback_context, llm_response,
        )

        assert result is None
        mock_service.sanitize_response.assert_not_called()
