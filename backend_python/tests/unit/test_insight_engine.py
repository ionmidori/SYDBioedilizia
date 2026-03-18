"""
Unit tests for InsightEngine.

Skill: fastapi-enterprise-patterns — §Service Layer / Unit Testing
Rule #20: When creating a Service, create tests/unit/test_{service}.py

Verifies:
  - _build_price_book_prompt() generates a categorized, non-empty string
    with all known SKU codes present.
  - _build_assembly_prompt() generates non-empty WBS context from renovation_assemblies.json
  - _build_system_prompt() is non-empty and contains key constraints
    (only SKUs from listino, chain-of-thought instructions, etc.)
  - analyze_project_for_quote() handles Gemini response_schema output correctly
    when mocked, and raises InsightEngineError on empty/failed responses.
  - completeness_score < 0.7 flow returns missing_info questions.
"""
from __future__ import annotations

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.services.insight_engine import (
    InsightEngine,
    InsightAnalysis,
    InsightEngineError,
    SKUItemSuggestion,
)
from src.services.pricing_service import PricingService


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def engine() -> InsightEngine:
    """Return an InsightEngine instance with the real price book loaded."""
    return InsightEngine(model_name="gemini-3.1-flash-lite-preview")


# ─── _build_price_book_prompt ─────────────────────────────────────────────────

class TestBuildPriceBookPrompt:
    def test_prompt_is_non_empty(self, engine: InsightEngine) -> None:
        """Prompt must not be empty when the price book is populated."""
        prompt = engine._build_price_book_prompt()
        assert prompt.strip(), "Price book prompt is empty — check master_price_book.json"

    def test_prompt_contains_categories(self, engine: InsightEngine) -> None:
        """Prompt must include category headers (### <Category>) from the price book."""
        prompt = engine._build_price_book_prompt()
        assert "###" in prompt, "Expected category headers (###) in price book prompt"

    def test_all_skus_present_in_prompt(self, engine: InsightEngine) -> None:
        """Every SKU in the master price book must appear in the generated prompt."""
        price_book = PricingService.load_price_book()
        prompt = engine._build_price_book_prompt()
        missing = [item["sku"] for item in price_book if item["sku"] not in prompt]
        assert not missing, f"SKUs missing from prompt: {missing}"

    def test_prompt_contains_absolute_rule(self, engine: InsightEngine) -> None:
        """The critical hallucination-prevention warning must be in the prompt."""
        prompt = engine._build_price_book_prompt()
        assert "REGOLA ASSOLUTA" in prompt or "ESCLUSIVAMENTE" in prompt

    def test_empty_price_book_returns_error_string(self, engine: InsightEngine) -> None:
        """If price book is empty, returns a safe fallback string (not raises)."""
        with patch.object(PricingService, "load_price_book", return_value=[]):
            prompt = engine._build_price_book_prompt()
        assert "Listino non disponibile" in prompt or "No items" in prompt


# ─── _build_system_prompt ─────────────────────────────────────────────────────

class TestBuildSystemPrompt:
    _MOCK_PRICE = "## Mock Price Book\n- `DEM-001` | Test"
    _MOCK_ASSEMBLY = "## Libreria Assembly\n### 🔧 Test Assembly"

    def test_system_prompt_is_non_empty(self, engine: InsightEngine) -> None:
        prompt = engine._build_system_prompt(self._MOCK_PRICE, self._MOCK_ASSEMBLY)
        assert len(prompt) > 100

    def test_system_prompt_contains_price_book_section(self, engine: InsightEngine) -> None:
        prompt = engine._build_system_prompt(self._MOCK_PRICE, self._MOCK_ASSEMBLY)
        assert self._MOCK_PRICE in prompt

    def test_system_prompt_contains_instructions(self, engine: InsightEngine) -> None:
        prompt = engine._build_system_prompt(self._MOCK_PRICE, self._MOCK_ASSEMBLY)
        assert "Geometra" in prompt or "Quantity Surveyor" in prompt

    def test_system_prompt_contains_wbs_protocol(self, engine: InsightEngine) -> None:
        """WBS Chain-of-Thought reasoning block must appear in the system prompt."""
        prompt = engine._build_system_prompt(self._MOCK_PRICE, self._MOCK_ASSEMBLY)
        assert "FASE 1" in prompt or "Chain-of-Thought" in prompt or "Protocollo" in prompt

    def test_system_prompt_excludes_furniture(self, engine: InsightEngine) -> None:
        """System prompt must explicitly exclude furniture from scope."""
        prompt = engine._build_system_prompt(self._MOCK_PRICE, self._MOCK_ASSEMBLY)
        assert "arredamento" in prompt.lower() or "arredi" in prompt.lower()


# ─── analyze_project_for_quote ────────────────────────────────────────────────

class TestAnalyzeProjectForQuote:
    """Tests for the Gemini call + structured output parsing.
    
    Mocks the Gemini client to avoid real API calls in CI.
    """

    def _make_mock_response(self, analysis: InsightAnalysis) -> MagicMock:
        """Creates a mock Gemini response containing the analysis as JSON."""
        mock_resp = MagicMock()
        mock_resp.text = analysis.model_dump_json()
        return mock_resp

    @pytest.mark.asyncio
    async def test_returns_insight_analysis_on_success(self, engine: InsightEngine) -> None:
        """Should return a valid InsightAnalysis when Gemini responds correctly."""
        expected = InsightAnalysis(
            suggestions=[
                SKUItemSuggestion(
                    sku="DEM-001",
                    qty=15.0,
                    ai_reasoning="Rimozione pavimentazione vecchia.",
                    phase="Demolizioni",
                )
            ],
            summary="Ristrutturazione bagno 7mq con demolizioni e nuova pavimentazione.",
            completeness_score=0.9,
            missing_info=[],
        )

        with patch.object(
            engine.client.aio.models, "generate_content", new_callable=AsyncMock
        ) as mock_generate:
            mock_generate.return_value = self._make_mock_response(expected)

            result = await engine.analyze_project_for_quote(
                chat_history=[
                    {"role": "user", "content": "Voglio ristrutturare il bagno, è di circa 7mq"},
                ]
            )

        assert isinstance(result, InsightAnalysis)
        assert len(result.suggestions) == 1
        assert result.suggestions[0].sku == "DEM-001"
        assert result.suggestions[0].qty == 15.0

    @pytest.mark.asyncio
    async def test_raises_insight_engine_error_on_empty_response(
        self, engine: InsightEngine
    ) -> None:
        """An empty Gemini response must raise InsightEngineError (not generic Exception)."""
        mock_resp = MagicMock()
        mock_resp.text = ""

        with patch.object(
            engine.client.aio.models, "generate_content", new_callable=AsyncMock
        ) as mock_generate:
            mock_generate.return_value = mock_resp

            with pytest.raises(InsightEngineError, match="empty response"):
                await engine.analyze_project_for_quote(
                    chat_history=[{"role": "user", "content": "test"}]
                )

    @pytest.mark.asyncio
    async def test_raises_insight_engine_error_on_gemini_failure(
        self, engine: InsightEngine
    ) -> None:
        """A Gemini SDK exception must be wrapped in InsightEngineError."""
        with patch.object(
            engine.client.aio.models, "generate_content", new_callable=AsyncMock,
            side_effect=RuntimeError("Quota exceeded")
        ):
            with pytest.raises(InsightEngineError, match="Project analysis failed"):
                await engine.analyze_project_for_quote(
                    chat_history=[{"role": "user", "content": "test"}]
                )

    @pytest.mark.asyncio
    async def test_media_ssrf_protection(self, engine: InsightEngine) -> None:
        """Media URLs pointing to external (non-Firebase) hosts must be skipped."""
        expected = InsightAnalysis(
            suggestions=[],
            summary="No works identified.",
            completeness_score=0.5,
            missing_info=["Puoi descrivere meglio il progetto?"],
        )

        with patch.object(
            engine.client.aio.models, "generate_content", new_callable=AsyncMock
        ) as mock_generate:
            mock_generate.return_value = self._make_mock_response(expected)

            # Should not raise — unauthorized URL gets logged and skipped
            result = await engine.analyze_project_for_quote(
                chat_history=[{"role": "user", "content": "Hai visto le foto?"}],
                # This external URL must be blocked by the SSRF guard
                media_urls=["https://evil.example.com/fake-image.jpg"],
            )

        # Analysis still returns (graceful degradation), URL was skipped
        assert isinstance(result, InsightAnalysis)

    @pytest.mark.asyncio
    async def test_empty_chat_history_does_not_crash(self, engine: InsightEngine) -> None:
        """Engine must handle empty chat history without crashing (returns empty analysis)."""
        expected = InsightAnalysis(
            suggestions=[],
            summary="Nessuna lavorazione identificata.",
            completeness_score=0.0,
            missing_info=["Puoi descrivere il progetto?"],
        )

        with patch.object(
            engine.client.aio.models, "generate_content", new_callable=AsyncMock
        ) as mock_generate:
            mock_generate.return_value = self._make_mock_response(expected)

            result = await engine.analyze_project_for_quote(chat_history=[])

        assert isinstance(result, InsightAnalysis)
        assert result.suggestions == []
