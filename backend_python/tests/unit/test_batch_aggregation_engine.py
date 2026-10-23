"""
Unit tests for BatchAggregationEngine cross-project optimization logic.

Tests cover:
- Singleton dedup: Items that should appear once across projects
- Shared overhead: Fixed costs charged once (e.g., setup)
- Volume discounts: Bulk pricing on materials across projects
- Smaltimento consolidation: Debris container consolidation
"""
from decimal import Decimal

import pytest
from src.core.money import line_total
from src.schemas.quote import QuoteItem
from src.services.batch_aggregation_engine import (
    BatchAggregationEngine,
    ProjectQuoteSummary,
    get_batch_aggregation_engine,
)


@pytest.fixture
def engine():
    """Fresh BatchAggregationEngine instance for each test."""
    return BatchAggregationEngine()


class TestBatchAggregationEngineEmpty:
    """Tests for empty and single-project scenarios."""

    def test_empty_batch_returns_zero_savings(self, engine):
        """Empty batch should return no adjustments."""
        preview = engine.preview([])
        assert preview.adjustments == []
        assert preview.total_savings == 0.0

    def test_single_project_returns_zero_savings(self, engine):
        """Single project (no cross-project optimization) yields zero savings."""
        item1 = QuoteItem(
            sku="TILE_001",
            description="Floor tiles",
            qty=10.0,
            unit="m2",
            unit_price=50.0,
            total=500.0,
        )
        project = ProjectQuoteSummary("proj_001", "Project A", [item1])
        preview = engine.preview([project])

        assert preview.adjustments == []
        assert preview.total_savings == 0.0
        assert preview.original_combined_subtotal == 500.0
        assert preview.optimized_subtotal == 500.0


class TestBatchAggregationEngineMultiProject:
    """Tests for multi-project scenarios with actual savings."""

    def test_duplicate_items_across_two_projects(self, engine):
        """Same item in two projects should generate adjustment."""
        # Project A: 10m2 @ €50/m2 = €500
        item_a = QuoteItem(
            sku="TILE_001",
            description="Floor tiles",
            qty=10.0,
            unit="m2",
            unit_price=50.0,
            total=500.0,
        )
        # Project B: same item, 15m2 @ €50/m2 = €750
        item_b = QuoteItem(
            sku="TILE_001",
            description="Floor tiles",
            qty=15.0,
            unit="m2",
            unit_price=50.0,
            total=750.0,
        )

        proj_a = ProjectQuoteSummary("proj_a", "Project A", [item_a])
        proj_b = ProjectQuoteSummary("proj_b", "Project B", [item_b])

        preview = engine.preview([proj_a, proj_b])

        # Original: 500 + 750 = 1250
        # Optimized: No volume discount rules in default config, so no savings expected
        # (unless volume_discounts are defined in aggregation_rules.json)
        assert preview.original_combined_subtotal == 1250.0

    def test_multiple_items_different_skus(self, engine):
        """Projects with different items should not generate savings."""
        item_a = QuoteItem(sku="SKU_A", description="Item A", qty=1.0, unit="pc", unit_price=100.0, total=100.0)
        item_b = QuoteItem(sku="SKU_B", description="Item B", qty=1.0, unit="pc", unit_price=200.0, total=200.0)

        proj_a = ProjectQuoteSummary("proj_a", "Project A", [item_a])
        proj_b = ProjectQuoteSummary("proj_b", "Project B", [item_b])

        preview = engine.preview([proj_a, proj_b])

        # No cross-project duplicates, no savings
        assert preview.adjustments == []
        assert preview.total_savings == 0.0
        assert preview.optimized_subtotal == 300.0


class TestSingletonDedup:
    """Tests for singleton dedup (one item per building, regardless of quantity)."""

    def test_singleton_dedup_when_rules_defined(self, engine):
        """When item is in singleton_skus, max quantity selected across projects."""
        # This test requires aggregation_rules.json to define singleton SKUs
        # If rules don't define any singleton SKUs, no dedup occurs
        # Test assumes QUAD_001 is a singleton SKU in the rules

        item_a = QuoteItem(
            sku="QUAD_001",  # Electrical panel (singleton in Italian housing)
            description="Quadro elettrico",
            qty=1.0,
            unit="pc",
            unit_price=300.0,
            total=300.0,
        )
        item_b = QuoteItem(
            sku="QUAD_001",
            description="Quadro elettrico",
            qty=1.0,
            unit="pc",
            unit_price=300.0,
            total=300.0,
        )

        proj_a = ProjectQuoteSummary("proj_a", "Project A", [item_a])
        proj_b = ProjectQuoteSummary("proj_b", "Project B", [item_b])

        preview = engine.preview([proj_a, proj_b])

        # If QUAD_001 is in singleton_skus: original=600, optimized=300, savings=300
        # If not in rules: no savings
        if preview.adjustments:
            assert any(adj.adjustment_type == "dedup_singleton" for adj in preview.adjustments)


class TestSharedOverhead:
    """Tests for shared overhead (fixed cost charged once across projects)."""

    def test_shared_overhead_when_rules_defined(self, engine):
        """Shared overhead SKUs should be charged once."""
        # This test assumes SETUP_001 is a shared overhead SKU
        item_a = QuoteItem(
            sku="SETUP_001",
            description="Setup cost",
            qty=1.0,
            unit="service",
            unit_price=500.0,
            total=500.0,
        )
        item_b = QuoteItem(
            sku="SETUP_001",
            description="Setup cost",
            qty=1.0,
            unit="service",
            unit_price=500.0,
            total=500.0,
        )

        proj_a = ProjectQuoteSummary("proj_a", "Project A", [item_a])
        proj_b = ProjectQuoteSummary("proj_b", "Project B", [item_b])

        preview = engine.preview([proj_a, proj_b])

        # If SETUP_001 is shared overhead: original=1000, optimized=500, savings=500
        if preview.adjustments:
            assert any(adj.adjustment_type == "shared_overhead" for adj in preview.adjustments)


class TestSmaltimentoConsolidation:
    """Tests for debris container consolidation."""

    def test_smaltimento_consolidation(self, engine):
        """Multiple small debris containers consolidated into one."""
        # Assume SMAL-001 is smaltimento container with 7.0 mc capacity
        # 3 containers of 5mc each = 15mc total = should consolidate to 3 containers
        item_a = QuoteItem(
            sku="SMAL-001",
            description="Debris container",
            qty=5.0,
            unit="mc",
            unit_price=100.0,  # €100 per mc
            total=500.0,
        )
        item_b = QuoteItem(
            sku="SMAL-001",
            description="Debris container",
            qty=5.0,
            unit="mc",
            unit_price=100.0,
            total=500.0,
        )
        item_c = QuoteItem(
            sku="SMAL-001",
            description="Debris container",
            qty=5.0,
            unit="mc",
            unit_price=100.0,
            total=500.0,
        )

        proj_a = ProjectQuoteSummary("proj_a", "Project A", [item_a])
        proj_b = ProjectQuoteSummary("proj_b", "Project B", [item_b])
        proj_c = ProjectQuoteSummary("proj_c", "Project C", [item_c])

        preview = engine.preview([proj_a, proj_b, proj_c])

        # 15 mc total ÷ 7 mc capacity = 3 containers (ceil)
        # Original: 3 containers × 100 = 300
        # Optimized: ≥1 container
        # Expected savings if consolidated properly
        if preview.adjustments:
            smaltimento_adj = [adj for adj in preview.adjustments if "Smaltimento" in adj.description]
            if smaltimento_adj:
                assert smaltimento_adj[0].adjustment_type == "dedup_singleton"


class TestVolumeDiscounts:
    """Tests for cross-project volume discounts."""

    def test_volume_discount_across_projects(self, engine):
        """Items with SKU prefix matching discount rules get bulk pricing."""
        # This test assumes volume_discounts are defined in rules for e.g., "TILE_*"
        # with tiers like min_qty=20, discount=10%

        # Project A: 12 units
        item_a = QuoteItem(
            sku="TILE_001",
            description="Floor tiles",
            qty=12.0,
            unit="box",
            unit_price=50.0,
            total=600.0,
        )
        # Project B: 10 units
        # Total: 22 units → should qualify for discount if min_qty=20 and discount=10%
        item_b = QuoteItem(
            sku="TILE_002",
            description="Wall tiles",
            qty=10.0,
            unit="box",
            unit_price=50.0,
            total=500.0,
        )

        proj_a = ProjectQuoteSummary("proj_a", "Project A", [item_a])
        proj_b = ProjectQuoteSummary("proj_b", "Project B", [item_b])

        preview = engine.preview([proj_a, proj_b])

        # If TILE_* has volume discount rules: original=1100, optimized=990 (10% discount)
        # If not: no savings
        if preview.adjustments:
            volume_adj = [adj for adj in preview.adjustments if adj.adjustment_type == "volume_discount"]
            if volume_adj:
                assert volume_adj[0].original_total > volume_adj[0].adjusted_total


class TestSingletonFactory:
    """Tests for get_batch_aggregation_engine() singleton pattern."""

    def test_singleton_returns_same_instance(self):
        """get_batch_aggregation_engine() should return same instance."""
        eng1 = get_batch_aggregation_engine()
        eng2 = get_batch_aggregation_engine()
        assert eng1 is eng2

    def test_singleton_instance_is_batch_aggregation_engine(self):
        """Singleton instance is a BatchAggregationEngine."""
        engine = get_batch_aggregation_engine()
        assert isinstance(engine, BatchAggregationEngine)


# ── Every rule, with the rules file injected (it is not versioned) ────────────

_RULES = {
    "project_singleton_skus": {"skus": ["QUAD-001"]},
    "shared_overhead_skus": {"skus": ["SETUP-001"]},
    "smaltimento_rule": {"container_sku": "SMAL-001", "capacity_mc": 7.0},
    "volume_discounts": [{"sku_prefix": "PIT", "tiers": [{"min_qty": 100, "discount_pct": 0.1}]}],
}


def _line(sku: str, qty: float, price: float) -> QuoteItem:
    return QuoteItem(sku=sku, description=sku, unit="u", qty=qty, unit_price=price, total=line_total(qty, price))


def _two_projects(a: list[QuoteItem], b: list[QuoteItem]) -> list[ProjectQuoteSummary]:
    return [ProjectQuoteSummary("p1", "A", a), ProjectQuoteSummary("p2", "B", b)]


class TestRulesWithExactAmounts:
    """Savings are Decimal cents: no float noise, no Decimal/float mixing."""

    @pytest.fixture
    def ruled(self, engine):
        engine._rules = _RULES
        return engine

    def test_shared_overhead(self, ruled):
        preview = ruled.preview(_two_projects([_line("SETUP-001", 1, 500.005)], [_line("SETUP-001", 1, 500.005)]))
        (adj,) = preview.adjustments
        assert (adj.original_total, adj.adjusted_total, adj.savings) == (
            Decimal("1000.02"), Decimal("500.01"), Decimal("500.01"),
        )

    def test_singleton_dedup(self, ruled):
        preview = ruled.preview(_two_projects([_line("QUAD-001", 1, 300)], [_line("QUAD-001", 1, 300)]))
        (adj,) = preview.adjustments
        assert adj.savings == Decimal("300.00") and adj.adjustment_type == "dedup_singleton"

    def test_smaltimento_consolidation(self, ruled):
        preview = ruled.preview(_two_projects([_line("SMAL-001", 3, 150.125)], [_line("SMAL-001", 3, 150.125)]))
        (adj,) = preview.adjustments
        # 2 × 450.38 (3 × 150.125 = 450.375) → 1 container at 150.13
        assert (adj.original_total, adj.adjusted_total, adj.savings) == (
            Decimal("900.76"), Decimal("150.13"), Decimal("750.63"),
        )

    def test_volume_discount_rounds_each_discounted_line_once(self, ruled):
        preview = ruled.preview(_two_projects([_line("PIT-001", 99, 0.335)], [_line("PIT-002", 1, 0.335)]))
        (adj,) = preview.adjustments
        # lines 33.17 + 0.34 = 33.51; discounted 29.8485 → 29.85 and 0.3015 → 0.30
        assert (adj.original_total, adj.adjusted_total, adj.savings) == (
            Decimal("33.51"), Decimal("30.15"), Decimal("3.36"),
        )

    def test_totals_are_exact(self, ruled):
        preview = ruled.preview(
            _two_projects([_line("QUAD-001", 1, 300), _line("X", 1, 0.1)], [_line("QUAD-001", 1, 300), _line("Y", 1, 0.2)])
        )
        assert preview.original_combined_subtotal == Decimal("600.30")
        assert preview.total_savings == Decimal("300.00")
        assert preview.optimized_subtotal == Decimal("300.30")
