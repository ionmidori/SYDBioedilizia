"""
BatchAggregationEngine: Cross-project optimization preview for batch quotes.

Unlike AggregationEngine (which mutates items for a single multi-room project),
this engine is ADVISORY ONLY — it computes potential savings across multiple
project quotes without modifying the original data.

The admin sees individual project quotes preserved as-is, plus a savings
report showing what could be optimized if the projects are executed together.

Pattern: Service Layer (pure computation, no side effects).
"""
import json
import logging
import math
from collections import defaultdict
from pathlib import Path
from typing import Any, Optional

from src.schemas.quote import AggregationAdjustment, QuoteItem

logger = logging.getLogger(__name__)

_RULES_PATH = Path(__file__).parent.parent / "data" / "aggregation_rules.json"


class ProjectQuoteSummary:
    """Lightweight view of a project's quote for aggregation analysis."""

    def __init__(self, project_id: str, project_name: str, items: list[QuoteItem]):
        self.project_id = project_id
        self.project_name = project_name
        self.items = items


class BatchAggregationPreview:
    """Read-only preview of cross-project optimizations."""

    def __init__(
        self,
        adjustments: list[AggregationAdjustment],
        total_savings: float,
        original_combined_subtotal: float,
        optimized_subtotal: float,
    ):
        self.adjustments = adjustments
        self.total_savings = total_savings
        self.original_combined_subtotal = original_combined_subtotal
        self.optimized_subtotal = optimized_subtotal


class BatchAggregationEngine:
    """
    Computes cross-project optimization preview for batch submissions.

    Advisory only — returns a preview of potential savings without
    modifying any project's quote data. The rules are identical to
    AggregationEngine (same aggregation_rules.json), but applied
    across projects instead of rooms.

    Optimization categories:
    1. Singleton dedup: SKUs like quadro elettrico (1 per dwelling)
    2. Volume discounts: Combined material quantities across projects
    3. Shared overhead: Fixed costs charged once (protezioni cantiere)
    4. Smaltimento consolidation: Debris containers from all projects
    """

    def __init__(self) -> None:
        self._rules: Optional[dict[str, Any]] = None

    def _load_rules(self) -> dict[str, Any]:
        if self._rules is None:
            try:
                with open(_RULES_PATH, encoding="utf-8") as f:
                    self._rules = json.load(f)
            except Exception as exc:
                logger.error("[BatchAggregation] Failed to load rules.", extra={"error": str(exc)})
                self._rules = {
                    "project_singleton_skus": {"skus": []},
                    "shared_overhead_skus": {"skus": []},
                    "smaltimento_rule": {"container_sku": "SMAL-001", "capacity_mc": 7.0},
                    "volume_discounts": [],
                }
        return self._rules  # type: ignore[return-value]

    def preview(self, project_quotes: list[ProjectQuoteSummary]) -> BatchAggregationPreview:
        """
        Compute advisory savings preview across all projects in the batch.

        Does NOT modify any items — returns a read-only preview.
        """
        if len(project_quotes) < 2:
            combined = sum(item.total for pq in project_quotes for item in pq.items)
            return BatchAggregationPreview(
                adjustments=[],
                total_savings=0.0,
                original_combined_subtotal=combined,
                optimized_subtotal=combined,
            )

        rules = self._load_rules()
        singleton_skus = set(rules.get("project_singleton_skus", {}).get("skus", []))
        overhead_skus = set(rules.get("shared_overhead_skus", {}).get("skus", []))
        smal_rule = rules.get("smaltimento_rule", {})
        container_sku = smal_rule.get("container_sku", "SMAL-001")
        container_capacity = smal_rule.get("capacity_mc", 7.0)

        adjustments: list[AggregationAdjustment] = []

        # Collect all items indexed by project
        by_sku: dict[str, list[tuple[str, QuoteItem]]] = defaultdict(list)
        for pq in project_quotes:
            for item in pq.items:
                by_sku[item.sku].append((pq.project_id, item))

        original_combined = sum(item.total for pq in project_quotes for item in pq.items)

        for sku, project_items in by_sku.items():
            # Only cross-project items (appears in 2+ projects)
            unique_projects = {pid for pid, _ in project_items}
            if len(unique_projects) < 2:
                continue

            affected = list(unique_projects)

            # ── Smaltimento consolidation ──────────────────────────────
            if sku == container_sku:
                total_qty = sum(item.qty for _, item in project_items)
                containers_needed = max(1, math.ceil(total_qty / container_capacity))
                unit_price = project_items[0][1].unit_price
                original_total = sum(item.total for _, item in project_items)
                optimized_total = round(containers_needed * unit_price, 2)
                savings = round(original_total - optimized_total, 2)

                if savings > 0:
                    adjustments.append(AggregationAdjustment(
                        adjustment_type="dedup_singleton",
                        description=(
                            f"Smaltimento unificato: {total_qty:.1f}mc da "
                            f"{len(unique_projects)} progetti → {containers_needed} container"
                        ),
                        sku=sku,
                        original_total=original_total,
                        adjusted_total=optimized_total,
                        savings=savings,
                        affected_rooms=affected,
                    ))
                continue

            # ── Shared overhead: once across all projects ──────────────
            if sku in overhead_skus:
                original_total = sum(item.total for _, item in project_items)
                unit_price = project_items[0][1].unit_price
                savings = round(original_total - unit_price, 2)

                if savings > 0:
                    adjustments.append(AggregationAdjustment(
                        adjustment_type="shared_overhead",
                        description=(
                            f"{project_items[0][1].description}: costo unico per "
                            f"{len(unique_projects)} progetti combinati"
                        ),
                        sku=sku,
                        original_total=original_total,
                        adjusted_total=unit_price,
                        savings=savings,
                        affected_rooms=affected,
                    ))
                continue

            # ── Singleton dedup: 1 per dwelling ────────────────────────
            if sku in singleton_skus:
                original_total = sum(item.total for _, item in project_items)
                max_item = max(project_items, key=lambda pi: pi[1].qty)
                optimized_total = max_item[1].total
                savings = round(original_total - optimized_total, 2)

                if savings > 0:
                    adjustments.append(AggregationAdjustment(
                        adjustment_type="dedup_singleton",
                        description=(
                            f"{max_item[1].description}: uno solo per "
                            f"{len(unique_projects)} progetti nello stesso edificio"
                        ),
                        sku=sku,
                        original_total=original_total,
                        adjusted_total=optimized_total,
                        savings=savings,
                        affected_rooms=affected,
                    ))
                continue

        # ── Volume discounts (cross-project totals) ────────────────────
        discount_rules = rules.get("volume_discounts", [])
        for rule in discount_rules:
            prefix = rule.get("sku_prefix", "")
            tiers = rule.get("tiers", [])
            if not prefix or not tiers:
                continue

            # Collect all items with this prefix across ALL projects
            matching: list[tuple[str, QuoteItem]] = []
            for pq in project_quotes:
                for item in pq.items:
                    if item.sku.startswith(prefix):
                        matching.append((pq.project_id, item))

            if not matching:
                continue

            unique_projects = {pid for pid, _ in matching}
            if len(unique_projects) < 2:
                continue

            total_qty = sum(item.qty for _, item in matching)

            # Find highest applicable tier
            applicable_discount = 0.0
            for tier in sorted(tiers, key=lambda t: t["min_qty"], reverse=True):
                if total_qty >= tier["min_qty"]:
                    applicable_discount = tier["discount_pct"]
                    break

            if applicable_discount <= 0:
                continue

            original_total = sum(item.total for _, item in matching)
            optimized_total = round(sum(
                round(item.qty * item.unit_price * (1 - applicable_discount), 2)
                for _, item in matching
            ), 2)
            savings = round(original_total - optimized_total, 2)

            if savings > 0:
                adjustments.append(AggregationAdjustment(
                    adjustment_type="volume_discount",
                    description=(
                        f"Sconto volume {applicable_discount * 100:.0f}% su {prefix}* — "
                        f"{total_qty:.0f} {matching[0][1].unit} totali da {len(unique_projects)} progetti"
                    ),
                    sku=prefix + "*",
                    original_total=original_total,
                    adjusted_total=optimized_total,
                    savings=savings,
                    affected_rooms=list(unique_projects),
                ))

        total_savings = sum(adj.savings for adj in adjustments)
        optimized_subtotal = round(original_combined - total_savings, 2)

        logger.info(
            "[BatchAggregation] Preview complete.",
            extra={
                "projects": len(project_quotes),
                "adjustments": len(adjustments),
                "total_savings": total_savings,
            },
        )

        return BatchAggregationPreview(
            adjustments=adjustments,
            total_savings=total_savings,
            original_combined_subtotal=original_combined,
            optimized_subtotal=optimized_subtotal,
        )


# ── Singleton Factory ─────────────────────────────────────────────────────────

_batch_aggregation_engine: Optional[BatchAggregationEngine] = None


def get_batch_aggregation_engine() -> BatchAggregationEngine:
    """Returns the singleton BatchAggregationEngine instance."""
    global _batch_aggregation_engine
    if _batch_aggregation_engine is None:
        _batch_aggregation_engine = BatchAggregationEngine()
    return _batch_aggregation_engine
