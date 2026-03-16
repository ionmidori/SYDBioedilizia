"""
RoomAnalysisService: Per-room analysis orchestration for multi-room quotes.

Orchestrates the full pipeline for a single room: measurement vision,
structural delta, InsightEngine analysis, SKU validation, and pricing.

Pattern: Service Layer (no HTTP logic, pure domain behavior).
"""
import asyncio
import logging
import uuid
from typing import Any, Dict, List, Optional

from src.schemas.quote import QuoteItem, RoomQuote, RoomType
from src.services.aggregation_engine import AggregationEngine, get_aggregation_engine
from src.services.insight_engine import InsightEngineError, get_insight_engine
from src.services.pricing_service import PricingService
from src.tools._quote_helpers import (
    build_chat_summary,
    extract_media_urls,
    extract_vision_context,
    validate_qty_bounds,
    validate_sku_suggestions,
)
from src.tools.quote_tools import _run_measurement_vision, _run_render_structural_vision
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

# Max concurrent Gemini calls for multi-room analysis (rate limit protection)
_MAX_CONCURRENT_ROOMS = 3


class RoomAnalysisService:
    """
    Orchestrates per-room analysis and multi-room aggregation.

    Single-room pipeline:
    1. Run RoomMeasurementAgent on the room's photo(s)
    2. Run structural vision (render vs. original comparison)
    3. Run InsightEngine with room-scoped context
    4. Validate SKUs + quantity bounds
    5. Price via PricingService
    6. Return RoomQuote

    Multi-room pipeline:
    1. Analyze each room concurrently (bounded by semaphore)
    2. Pass all RoomQuotes to AggregationEngine
    3. Return unified QuoteSchema
    """

    async def analyze_room(
        self,
        project_id: str,
        user_id: str,
        room_id: str,
        room_label: str,
        room_type: str,  # Accepts any str; validated by RoomQuote Literal at build time
        media_urls: List[str],
        chat_history: List[Dict[str, Any]],
    ) -> RoomQuote:
        """
        Full analysis pipeline for one room.

        Args:
            project_id: Project identifier.
            user_id: Authenticated user UID.
            room_id: Stable UUID for this room.
            room_label: Human-readable name (e.g., "Bagno Principale").
            room_type: Type classification (bagno, cucina, etc.).
            media_urls: Firebase Storage URLs for this room's photos.
            chat_history: Chat messages relevant to this room.

        Returns:
            RoomQuote with items, measurements, and completeness score.
        """
        logger.info(
            "[RoomAnalysis] Starting analysis.",
            extra={"project_id": project_id, "room_id": room_id, "room_label": room_label},
        )

        # 1. Agentic Vision: room measurements from photo
        measurement_context = await _run_measurement_vision(media_urls)
        if measurement_context:
            logger.info("[RoomAnalysis] Room measurements injected.", extra={"room_id": room_id})

        # 2. Structural delta from render vs original
        structural_delta = await _run_render_structural_vision(media_urls, chat_history)
        if structural_delta:
            logger.info("[RoomAnalysis] Structural delta injected.", extra={"room_id": room_id})

        # 3. Qualitative vision context from chat history
        vision_context = extract_vision_context(chat_history)

        # 4. Build enriched summary with room header
        chat_summary = build_chat_summary(chat_history)
        enriched_summary = (
            f"\n\n## Analisi Stanza: {room_label} ({room_type})\n"
            + structural_delta
            + measurement_context
            + vision_context
            + "\n\n## Conversazione Progetto\n"
            + chat_summary
        )

        # 5. Run InsightEngine
        engine = get_insight_engine()
        summary_message = [{"role": "user", "content": enriched_summary}]
        try:
            analysis = await engine.analyze_project_for_quote(summary_message, media_urls)
        except InsightEngineError as exc:
            logger.error(
                "[RoomAnalysis] InsightEngine failed.",
                extra={"room_id": room_id, "error": str(exc)},
            )
            return RoomQuote(
                room_id=room_id,
                room_label=room_label,
                room_type=room_type,  # type: ignore[arg-type]
                completeness_score=0.0,
                missing_info=["Analisi automatica non riuscita. Riprovare."],
                media_urls=media_urls,
            )

        # 6. Validate SKUs
        unknown_skus = validate_sku_suggestions(analysis.suggestions)
        valid_suggestions = [s for s in analysis.suggestions if s.sku not in unknown_skus]

        # 7. Validate quantity bounds
        valid_suggestions, qty_warnings = validate_qty_bounds(valid_suggestions)
        if qty_warnings:
            logger.warning(
                "[RoomAnalysis] Filtered suggestions with out-of-bounds qty.",
                extra={"room_id": room_id, "filtered_count": len(qty_warnings)},
            )

        # 8. Price items
        sku_list = [
            {
                "sku": s.sku,
                "qty": s.qty,
                "ai_reasoning": s.ai_reasoning,
                "phase": getattr(s, "phase", "Lavori"),
            }
            for s in valid_suggestions
        ]

        if sku_list:
            quote = PricingService.create_quote_from_skus(project_id, user_id, sku_list)
            items = quote.items
            room_subtotal = quote.financials.subtotal
        else:
            items = []
            room_subtotal = 0.0

        # Tag each item with room_id
        tagged_items = [item.model_copy(update={"room_id": room_id}) for item in items]

        # Extract floor/walls measurements from the measurement context
        floor_mq = None
        walls_mq = None
        if measurement_context:
            for line in measurement_context.split("\n"):
                if "Pavimento" in line and "mq" in line:
                    try:
                        floor_mq = float(line.split(":")[-1].strip().split()[0])
                    except (ValueError, IndexError):
                        pass
                if "Pareti totali" in line and "mq" in line:
                    try:
                        walls_mq = float(line.split(":")[-1].strip().split()[0])
                    except (ValueError, IndexError):
                        pass

        room_quote = RoomQuote(
            room_id=room_id,
            room_label=room_label,
            room_type=room_type,  # type: ignore[arg-type]
            floor_mq=floor_mq,
            walls_mq=walls_mq,
            items=tagged_items,
            room_subtotal=room_subtotal,
            completeness_score=analysis.completeness_score,
            missing_info=analysis.missing_info,
            analyzed_at=utc_now(),
            media_urls=media_urls,
        )

        logger.info(
            "[RoomAnalysis] Room analysis complete.",
            extra={
                "room_id": room_id,
                "items": len(tagged_items),
                "subtotal": room_subtotal,
                "completeness": analysis.completeness_score,
            },
        )

        return room_quote

    async def analyze_multi_room(
        self,
        project_id: str,
        user_id: str,
        rooms: List[Dict[str, Any]],
        chat_history: List[Dict[str, Any]],
    ) -> List[RoomQuote]:
        """
        Analyze multiple rooms concurrently with bounded concurrency.

        Args:
            project_id: Project identifier.
            user_id: Authenticated user UID.
            rooms: List of room specs: [{"room_id", "room_label", "room_type", "media_urls"}].
            chat_history: Full chat history (room-specific filtering happens inside).

        Returns:
            List of RoomQuote results.
        """
        sem = asyncio.Semaphore(_MAX_CONCURRENT_ROOMS)

        async def _analyze_with_sem(room_spec: Dict[str, Any]) -> RoomQuote:
            async with sem:
                return await self.analyze_room(
                    project_id=project_id,
                    user_id=user_id,
                    room_id=room_spec.get("room_id", str(uuid.uuid4())),
                    room_label=room_spec.get("room_label", "Stanza"),
                    room_type=room_spec.get("room_type", "altro"),
                    media_urls=room_spec.get("media_urls", []),
                    chat_history=chat_history,
                )

        results = await asyncio.gather(
            *[_analyze_with_sem(room) for room in rooms],
            return_exceptions=True,
        )

        # Filter out exceptions, log failures
        room_quotes: List[RoomQuote] = []
        for i, result in enumerate(results):
            if isinstance(result, BaseException):
                logger.error(
                    "[RoomAnalysis] Room analysis failed.",
                    extra={"room_index": i, "error": str(result)},
                )
            else:
                room_quotes.append(result)

        return room_quotes

    async def analyze_and_aggregate(
        self,
        project_id: str,
        user_id: str,
        rooms: List[Dict[str, Any]],
        chat_history: List[Dict[str, Any]],
    ):
        """
        Full multi-room pipeline: analyze each room, then aggregate.

        Returns:
            QuoteSchema with rooms, items (merged), aggregation_adjustments, and financials.
        """
        room_quotes = await self.analyze_multi_room(
            project_id=project_id,
            user_id=user_id,
            rooms=rooms,
            chat_history=chat_history,
        )

        if not room_quotes:
            logger.warning("[RoomAnalysis] No rooms successfully analyzed.")
            return None

        aggregation_engine = get_aggregation_engine()
        return aggregation_engine.aggregate(
            project_id=project_id,
            user_id=user_id,
            room_quotes=room_quotes,
        )


# ── Singleton Factory ─────────────────────────────────────────────────────────

_room_analysis_service: Optional[RoomAnalysisService] = None


def get_room_analysis_service() -> RoomAnalysisService:
    """Returns the singleton RoomAnalysisService instance."""
    global _room_analysis_service
    if _room_analysis_service is None:
        _room_analysis_service = RoomAnalysisService()
    return _room_analysis_service
