"""
Unit tests for RoomAnalysisService: per-room analysis orchestration.

Tests cover:
- Single room analysis pipeline (mocked InsightEngine + vision)
- Multi-room concurrent analysis with semaphore
- analyze_and_aggregate end-to-end (mocked dependencies)
- Error handling: InsightEngine failure → graceful RoomQuote fallback
- Empty/invalid media URLs handled gracefully
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.schemas.quote import QuoteItem, RoomQuote, QuoteSchema
from src.services.room_analysis_service import RoomAnalysisService, _MAX_CONCURRENT_ROOMS


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_suggestion(sku: str = "PAV-001", qty: float = 10.0, ai_reasoning: str = "test"):
    """Create a mock InsightEngine suggestion."""
    mock = MagicMock()
    mock.sku = sku
    mock.qty = qty
    mock.ai_reasoning = ai_reasoning
    mock.phase = "Lavori"
    return mock


def _make_analysis(suggestions=None, completeness=0.85, missing=None, summary="Test"):
    """Create a mock InsightAnalysis result."""
    mock = MagicMock()
    mock.suggestions = suggestions or [_make_suggestion()]
    mock.completeness_score = completeness
    mock.missing_info = missing or []
    mock.summary = summary
    return mock


def _make_quote_item(sku="PAV-001", qty=10.0, unit_price=30.0):
    return QuoteItem(
        sku=sku,
        qty=qty,
        unit_price=unit_price,
        unit="mq",
        description="Test item",
        total=round(qty * unit_price, 2),
        category="Pavimentazioni",
    )


def _mock_quote_from_skus(project_id, user_id, sku_list):
    """Create a mock PricingService.create_quote_from_skus result."""
    items = []
    for s in sku_list:
        items.append(_make_quote_item(sku=s["sku"], qty=s["qty"]))
    mock = MagicMock()
    mock.items = items
    mock.financials = MagicMock()
    mock.financials.subtotal = sum(i.total for i in items)
    return mock


@pytest.fixture
def service() -> RoomAnalysisService:
    return RoomAnalysisService()


# ── Test: Single room analysis ───────────────────────────────────────────────

class TestAnalyzeRoom:
    @pytest.mark.asyncio
    @patch("src.services.room_analysis_service._run_render_structural_vision", new_callable=AsyncMock, return_value="")
    @patch("src.services.room_analysis_service._run_measurement_vision", new_callable=AsyncMock, return_value="")
    @patch("src.services.room_analysis_service.get_insight_engine")
    @patch("src.services.room_analysis_service.PricingService")
    async def test_single_room_returns_room_quote(
        self, mock_pricing, mock_engine_factory, mock_measure, mock_structural, service
    ):
        """Happy path: single room analysis produces a valid RoomQuote."""
        # Mock InsightEngine
        mock_engine = AsyncMock()
        mock_engine.analyze_project_for_quote = AsyncMock(return_value=_make_analysis())
        mock_engine_factory.return_value = mock_engine

        # Mock PricingService
        mock_pricing.create_quote_from_skus.side_effect = _mock_quote_from_skus

        # Mock SKU validation (all SKUs valid)
        with patch("src.services.room_analysis_service.validate_sku_suggestions", return_value=[]):
            result = await service.analyze_room(
                project_id="proj-1",
                user_id="user-1",
                room_id="room-1",
                room_label="Bagno",
                room_type="bagno",
                media_urls=[],
                chat_history=[],
            )

        assert isinstance(result, RoomQuote)
        assert result.room_id == "room-1"
        assert result.room_label == "Bagno"
        assert result.room_type == "bagno"
        assert len(result.items) > 0
        assert result.room_subtotal > 0

    @pytest.mark.asyncio
    @patch("src.services.room_analysis_service._run_render_structural_vision", new_callable=AsyncMock, return_value="")
    @patch("src.services.room_analysis_service._run_measurement_vision", new_callable=AsyncMock, return_value="")
    @patch("src.services.room_analysis_service.get_insight_engine")
    async def test_insight_engine_failure_returns_empty_room_quote(
        self, mock_engine_factory, mock_measure, mock_structural, service
    ):
        """InsightEngine failure → graceful fallback with completeness_score=0."""
        from src.services.insight_engine import InsightEngineError

        mock_engine = AsyncMock()
        mock_engine.analyze_project_for_quote = AsyncMock(
            side_effect=InsightEngineError("Gemini API error")
        )
        mock_engine_factory.return_value = mock_engine

        result = await service.analyze_room(
            project_id="proj-1",
            user_id="user-1",
            room_id="room-fail",
            room_label="Cucina",
            room_type="cucina",
            media_urls=[],
            chat_history=[],
        )

        assert isinstance(result, RoomQuote)
        assert result.room_id == "room-fail"
        assert result.completeness_score == 0.0
        assert len(result.items) == 0
        assert len(result.missing_info) > 0

    @pytest.mark.asyncio
    @patch("src.services.room_analysis_service._run_render_structural_vision", new_callable=AsyncMock, return_value="")
    @patch("src.services.room_analysis_service._run_measurement_vision", new_callable=AsyncMock)
    @patch("src.services.room_analysis_service.get_insight_engine")
    @patch("src.services.room_analysis_service.PricingService")
    async def test_measurement_context_extracted(
        self, mock_pricing, mock_engine_factory, mock_measure, mock_structural, service
    ):
        """Measurement vision output is injected into InsightEngine context."""
        mock_measure.return_value = "\n- Pavimento: 7.5 mq\n- Pareti totali: 22.0 mq\n"

        mock_engine = AsyncMock()
        mock_engine.analyze_project_for_quote = AsyncMock(return_value=_make_analysis())
        mock_engine_factory.return_value = mock_engine

        mock_pricing.create_quote_from_skus.side_effect = _mock_quote_from_skus

        with patch("src.services.room_analysis_service.validate_sku_suggestions", return_value=[]):
            result = await service.analyze_room(
                project_id="proj-1",
                user_id="user-1",
                room_id="room-meas",
                room_label="Bagno",
                room_type="bagno",
                media_urls=["https://storage.example.com/photo.jpg"],
                chat_history=[],
            )

        assert result.floor_mq == 7.5
        assert result.walls_mq == 22.0


# ── Test: Multi-room concurrent analysis ─────────────────────────────────────

class TestAnalyzeMultiRoom:
    @pytest.mark.asyncio
    async def test_concurrent_rooms_all_succeed(self, service):
        """Multiple rooms analyzed concurrently — all succeed."""
        mock_room_quote = RoomQuote(
            room_id="r1",
            room_label="Bagno",
            room_type="bagno",
            items=[],
            room_subtotal=0.0,
        )

        with patch.object(
            service, "analyze_room", new_callable=AsyncMock, return_value=mock_room_quote
        ):
            rooms = [
                {"room_id": "r1", "room_label": "Bagno", "room_type": "bagno", "media_urls": []},
                {"room_id": "r2", "room_label": "Cucina", "room_type": "cucina", "media_urls": []},
            ]

            results = await service.analyze_multi_room(
                project_id="proj-1",
                user_id="user-1",
                rooms=rooms,
                chat_history=[],
            )

        assert len(results) == 2
        assert all(isinstance(r, RoomQuote) for r in results)

    @pytest.mark.asyncio
    async def test_partial_failure_returns_successful_rooms(self, service):
        """One room fails, others succeed — only successful rooms returned."""
        mock_good = RoomQuote(
            room_id="r1",
            room_label="Bagno",
            room_type="bagno",
            items=[],
            room_subtotal=0.0,
        )

        call_count = 0

        async def _alternating_analyze(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise RuntimeError("Simulated Gemini failure")
            return mock_good

        with patch.object(service, "analyze_room", side_effect=_alternating_analyze):
            rooms = [
                {"room_id": "r1", "room_label": "Bagno", "room_type": "bagno", "media_urls": []},
                {"room_id": "r2", "room_label": "Cucina", "room_type": "cucina", "media_urls": []},
                {"room_id": "r3", "room_label": "Camera", "room_type": "camera", "media_urls": []},
            ]

            results = await service.analyze_multi_room(
                project_id="proj-1",
                user_id="user-1",
                rooms=rooms,
                chat_history=[],
            )

        # 2 of 3 succeed
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_semaphore_bounds_concurrency(self):
        """Verify that _MAX_CONCURRENT_ROOMS is set to a reasonable value."""
        assert _MAX_CONCURRENT_ROOMS == 3


# ── Test: Full pipeline (analyze_and_aggregate) ──────────────────────────────

class TestAnalyzeAndAggregate:
    @pytest.mark.asyncio
    async def test_end_to_end_produces_quote_schema(self, service):
        """analyze_and_aggregate → QuoteSchema with rooms and financials."""
        mock_room = RoomQuote(
            room_id="r1",
            room_label="Bagno",
            room_type="bagno",
            items=[_make_quote_item()],
            room_subtotal=300.0,
        )

        mock_quote = MagicMock(spec=QuoteSchema)
        mock_quote.rooms = [mock_room]
        mock_quote.items = [_make_quote_item()]
        mock_quote.financials = MagicMock()
        mock_quote.financials.subtotal = 300.0
        mock_quote.aggregation_adjustments = []

        with patch.object(
            service, "analyze_multi_room", new_callable=AsyncMock, return_value=[mock_room]
        ), patch(
            "src.services.room_analysis_service.get_aggregation_engine"
        ) as mock_agg_factory:
            mock_agg = MagicMock()
            mock_agg.aggregate.return_value = mock_quote
            mock_agg_factory.return_value = mock_agg

            result = await service.analyze_and_aggregate(
                project_id="proj-1",
                user_id="user-1",
                rooms=[{"room_id": "r1", "room_label": "Bagno", "room_type": "bagno", "media_urls": []}],
                chat_history=[],
            )

        assert result is not None
        mock_agg.aggregate.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_successful_rooms_returns_none(self, service):
        """All rooms fail → analyze_and_aggregate returns None."""
        with patch.object(
            service, "analyze_multi_room", new_callable=AsyncMock, return_value=[]
        ):
            result = await service.analyze_and_aggregate(
                project_id="proj-1",
                user_id="user-1",
                rooms=[{"room_id": "r1"}],
                chat_history=[],
            )

        assert result is None
