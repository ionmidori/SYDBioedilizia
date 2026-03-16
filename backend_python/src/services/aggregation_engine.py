"""
AggregationEngine: Cross-room BOQ optimization for multi-room renovation quotes.

Merges per-room analyses into a unified project quote applying construction
industry patterns: SKU deduplication, volume discounts, shared overhead,
and smart smaltimento (debris) consolidation.

Pattern: Service Layer (no HTTP logic, pure domain behavior).
"""
import json
import logging
import math
from collections import defaultdict
from pathlib import Path
from typing import Any, Optional

from src.schemas.quote import (
    AggregationAdjustment,
    QuoteFinancials,
    QuoteItem,
    QuoteSchema,
    RoomQuote,
)
from src.services.pricing_service import PricingService
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

_RULES_PATH = Path(__file__).parent.parent / "data" / "aggregation_rules.json"


class AggregationEngine:
    """
    Merges per-room RoomQuote analyses into a unified QuoteSchema.

    Applies construction industry BOQ optimization patterns:
    1. Project singletons: SKUs that appear once per dwelling (e.g., quadro elettrico)
    2. Room-specific: SKUs that must NOT merge (e.g., sanitari per bagno)
    3. Quantity merge: Same SKU across rooms combined into single line item
    4. Volume discounts: Material discounts when total qty exceeds thresholds
    5. Smaltimento consolidation: Debris containers calculated from total mc
    6. Shared overhead: Fixed costs charged once (e.g., protezioni cantiere)
    """

    def __init__(self) -> None:
        self._rules: Optional[dict[str, Any]] = None

    def _load_rules(self) -> dict[str, Any]:
        if self._rules is None:
            try:
                with open(_RULES_PATH, encoding="utf-8") as f:
                    self._rules = json.load(f)
            except Exception as exc:
                logger.error("[AggregationEngine] Failed to load rules.", extra={"error": str(exc)})
                self._rules = {
                    "project_singleton_skus": {"skus": []},
                    "keep_separate_skus": {"skus": []},
                    "shared_overhead_skus": {"skus": []},
                    "smaltimento_rule": {"container_sku": "SMAL-001", "capacity_mc": 7.0},
                    "volume_discounts": [],
                }
        return self._rules  # type: ignore[return-value]

    def aggregate(
        self,
        project_id: str,
        user_id: str,
        room_quotes: list[RoomQuote],
    ) -> QuoteSchema:
        """
        Main entry point. Merges per-room BOQs into a unified QuoteSchema.

        Returns a QuoteSchema with:
        - rooms: the input room_quotes (preserved for drill-down)
        - items: the merged, deduplicated flat list
        - aggregation_adjustments: all optimizations applied
        - financials: recalculated totals post-optimization
        - aggregated_subtotal: post-optimization subtotal
        """
        rules = self._load_rules()
        singleton_skus = set(rules.get("project_singleton_skus", {}).get("skus", []))
        separate_skus = set(rules.get("keep_separate_skus", {}).get("skus", []))
        overhead_skus = set(rules.get("shared_overhead_skus", {}).get("skus", []))
        smal_rule = rules.get("smaltimento_rule", {})
        container_sku = smal_rule.get("container_sku", "SMAL-001")
        container_capacity = smal_rule.get("capacity_mc", 7.0)

        adjustments: list[AggregationAdjustment] = []

        # ── Step 1: Collect all items from all rooms ──────────────────────
        all_items: list[tuple[str, QuoteItem]] = []  # (room_id, item)
        for room in room_quotes:
            for item in room.items:
                all_items.append((room.room_id, item))

        # ── Step 2: Classify and process items ────────────────────────────
        merged_items: list[QuoteItem] = []

        # Group items by SKU for merge analysis
        by_sku: dict[str, list[tuple[str, QuoteItem]]] = defaultdict(list)
        for room_id, item in all_items:
            by_sku[item.sku].append((room_id, item))

        processed_skus: set[str] = set()

        for sku, room_items in by_sku.items():
            if sku in processed_skus:
                continue
            processed_skus.add(sku)

            # ── Smaltimento: special container consolidation ──────────
            if sku == container_sku:
                smal_items, adj = self._consolidate_smaltimento(
                    room_items, container_sku, container_capacity,
                )
                merged_items.extend(smal_items)
                if adj:
                    adjustments.append(adj)
                continue

            # ── Shared overhead: charge once, qty=1 ──────────────────
            if sku in overhead_skus:
                items, adj = self._apply_shared_overhead(room_items)
                merged_items.extend(items)
                if adj:
                    adjustments.append(adj)
                continue

            # ── Project singletons: keep MAX qty ─────────────────────
            if sku in singleton_skus:
                items, adj = self._apply_singleton(room_items)
                merged_items.extend(items)
                if adj:
                    adjustments.append(adj)
                continue

            # ── Keep separate: preserve per-room ─────────────────────
            if sku in separate_skus:
                for room_id, item in room_items:
                    copy = item.model_copy(update={"room_id": room_id})
                    merged_items.append(copy)
                continue

            # ── Default: merge quantities ────────────────────────────
            if len(room_items) > 1:
                items, adj = self._merge_quantities(room_items)
                merged_items.extend(items)
                if adj:
                    adjustments.append(adj)
            else:
                room_id, item = room_items[0]
                merged_items.append(item.model_copy(update={"room_id": room_id}))

        # ── Step 3: Apply volume discounts ────────────────────────────────
        volume_adjs = self._apply_volume_discounts(merged_items, rules.get("volume_discounts", []))
        adjustments.extend(volume_adjs)

        # ── Step 4: Calculate financials ──────────────────────────────────
        financials = PricingService.calculate_financials(merged_items)

        total_savings = sum(adj.savings for adj in adjustments)
        logger.info(
            "[AggregationEngine] Aggregation complete.",
            extra={
                "project_id": project_id,
                "rooms": len(room_quotes),
                "items_before": sum(len(r.items) for r in room_quotes),
                "items_after": len(merged_items),
                "adjustments": len(adjustments),
                "total_savings": total_savings,
            },
        )

        return QuoteSchema(
            project_id=project_id,
            user_id=user_id,
            status="draft",
            items=merged_items,
            rooms=room_quotes,
            financials=financials,
            aggregation_adjustments=adjustments,
            aggregated_subtotal=financials.subtotal,
            created_at=utc_now(),
            updated_at=utc_now(),
        )

    # ── Internal: Smaltimento consolidation ───────────────────────────────

    def _consolidate_smaltimento(
        self,
        room_items: list[tuple[str, QuoteItem]],
        container_sku: str,
        capacity_mc: float,
    ) -> tuple[list[QuoteItem], Optional[AggregationAdjustment]]:
        """Consolidate debris across rooms into minimum containers."""
        total_qty = sum(item.qty for _, item in room_items)
        containers_needed = max(1, math.ceil(total_qty / capacity_mc))
        affected_rooms = list({rid for rid, _ in room_items})

        # Use the first item as template for pricing
        template = room_items[0][1]
        consolidated = template.model_copy(update={
            "qty": containers_needed,
            "total": round(containers_needed * template.unit_price, 2),
            "ai_reasoning": f"Consolidato da {len(room_items)} stanze: {total_qty:.1f}mc totali → {containers_needed} container",
            "room_id": None,
        })

        original_total = sum(item.total for _, item in room_items)
        adjustment = None
        if consolidated.total < original_total:
            adjustment = AggregationAdjustment(
                adjustment_type="dedup_singleton",
                description=f"Smaltimento consolidato: {total_qty:.1f}mc → {containers_needed} container (capacità {capacity_mc}mc/cad)",
                sku=container_sku,
                original_total=original_total,
                adjusted_total=consolidated.total,
                savings=round(original_total - consolidated.total, 2),
                affected_rooms=affected_rooms,
            )

        return [consolidated], adjustment

    # ── Internal: Shared overhead ─────────────────────────────────────────

    def _apply_shared_overhead(
        self,
        room_items: list[tuple[str, QuoteItem]],
    ) -> tuple[list[QuoteItem], Optional[AggregationAdjustment]]:
        """Charge fixed overhead once per project."""
        if len(room_items) <= 1:
            return [room_items[0][1].model_copy()], None

        template = room_items[0][1]
        single = template.model_copy(update={
            "qty": 1,
            "total": template.unit_price,
            "ai_reasoning": f"Costo fisso cantiere: una volta per progetto (non per stanza)",
            "room_id": None,
        })

        original_total = sum(item.total for _, item in room_items)
        affected_rooms = list({rid for rid, _ in room_items})

        adjustment = AggregationAdjustment(
            adjustment_type="shared_overhead",
            description=f"{template.description}: costo unico per progetto",
            sku=template.sku,
            original_total=original_total,
            adjusted_total=single.total,
            savings=round(original_total - single.total, 2),
            affected_rooms=affected_rooms,
        )

        return [single], adjustment

    # ── Internal: Singleton ───────────────────────────────────────────────

    def _apply_singleton(
        self,
        room_items: list[tuple[str, QuoteItem]],
    ) -> tuple[list[QuoteItem], Optional[AggregationAdjustment]]:
        """Keep max qty across rooms for project-singleton SKUs."""
        if len(room_items) <= 1:
            return [room_items[0][1].model_copy()], None

        max_item = max(room_items, key=lambda ri: ri[1].qty)
        single = max_item[1].model_copy(update={
            "ai_reasoning": f"Singleton progetto: uno per appartamento",
            "room_id": None,
        })

        original_total = sum(item.total for _, item in room_items)
        affected_rooms = list({rid for rid, _ in room_items})

        adjustment = None
        if single.total < original_total:
            adjustment = AggregationAdjustment(
                adjustment_type="dedup_singleton",
                description=f"{single.description}: uno per appartamento",
                sku=single.sku,
                original_total=original_total,
                adjusted_total=single.total,
                savings=round(original_total - single.total, 2),
                affected_rooms=affected_rooms,
            )

        return [single], adjustment

    # ── Internal: Merge quantities ────────────────────────────────────────

    def _merge_quantities(
        self,
        room_items: list[tuple[str, QuoteItem]],
    ) -> tuple[list[QuoteItem], Optional[AggregationAdjustment]]:
        """Combine quantities of the same SKU across rooms."""
        total_qty = sum(item.qty for _, item in room_items)
        template = room_items[0][1]

        merged = template.model_copy(update={
            "qty": round(total_qty, 2),
            "total": round(total_qty * template.unit_price, 2),
            "ai_reasoning": f"Aggregato da {len(room_items)} stanze (totale {total_qty:.1f} {template.unit})",
            "room_id": None,
        })

        original_total = sum(item.total for _, item in room_items)

        adjustment = AggregationAdjustment(
            adjustment_type="merge_quantities",
            description=f"{template.sku}: {len(room_items)} stanze unite → {total_qty:.1f} {template.unit}",
            sku=template.sku,
            original_total=original_total,
            adjusted_total=merged.total,
            savings=round(original_total - merged.total, 2),
            affected_rooms=list({rid for rid, _ in room_items}),
        )

        return [merged], adjustment

    # ── Internal: Volume discounts ────────────────────────────────────────

    def _apply_volume_discounts(
        self,
        items: list[QuoteItem],
        discount_rules: list[dict],
    ) -> list[AggregationAdjustment]:
        """Apply volume-based discounts to merged items."""
        adjustments: list[AggregationAdjustment] = []

        for rule in discount_rules:
            prefix = rule.get("sku_prefix", "")
            tiers = rule.get("tiers", [])
            if not prefix or not tiers:
                continue

            matching = [item for item in items if item.sku.startswith(prefix)]
            if not matching:
                continue

            total_qty = sum(item.qty for item in matching)

            # Find highest applicable tier (sorted descending by min_qty)
            applicable_discount = 0.0
            for tier in sorted(tiers, key=lambda t: t["min_qty"], reverse=True):
                if total_qty >= tier["min_qty"]:
                    applicable_discount = tier["discount_pct"]
                    break

            if applicable_discount <= 0:
                continue

            for item in matching:
                original_total = item.total
                item.unit_price = round(item.unit_price * (1 - applicable_discount), 2)
                item.total = round(item.qty * item.unit_price, 2)
                savings = round(original_total - item.total, 2)

                if savings > 0:
                    adjustments.append(AggregationAdjustment(
                        adjustment_type="volume_discount",
                        description=(
                            f"Sconto volume {applicable_discount * 100:.0f}% su {item.sku} "
                            f"({total_qty:.0f} {item.unit} totali)"
                        ),
                        sku=item.sku,
                        original_total=original_total,
                        adjusted_total=item.total,
                        savings=savings,
                    ))

        return adjustments


# ── Singleton Factory ─────────────────────────────────────────────────────────

_aggregation_engine: Optional[AggregationEngine] = None


def get_aggregation_engine() -> AggregationEngine:
    """Returns the singleton AggregationEngine instance."""
    global _aggregation_engine
    if _aggregation_engine is None:
        _aggregation_engine = AggregationEngine()
    return _aggregation_engine
