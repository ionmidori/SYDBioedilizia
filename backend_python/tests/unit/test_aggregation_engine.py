"""
Unit tests for AggregationEngine: cross-room BOQ optimization.

Tests cover:
- Singleton deduplication (e.g., quadro elettrico once per project)
- Room-specific SKU preservation (e.g., sanitari per bagno)
- Quantity merging across rooms
- Volume discount application
- Smaltimento container consolidation
- Shared overhead (protezioni once)
- Single-room passthrough (backward compat)
"""
import pytest
from unittest.mock import patch

from src.schemas.quote import (
    AggregationAdjustment,
    QuoteItem,
    QuoteSchema,
    RoomQuote,
)
from src.services.aggregation_engine import AggregationEngine


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_item(
    sku: str = "PAV-001",
    qty: float = 10.0,
    unit_price: float = 30.0,
    unit: str = "mq",
    description: str = "Test item",
    category: str = "Pavimentazioni",
    room_id: str | None = None,
) -> QuoteItem:
    return QuoteItem(
        sku=sku,
        qty=qty,
        unit_price=unit_price,
        unit=unit,
        description=description,
        total=round(qty * unit_price, 2),
        category=category,
        room_id=room_id,
    )


def _make_room(
    room_id: str = "room-1",
    room_label: str = "Bagno",
    room_type: str = "bagno",
    items: list[QuoteItem] | None = None,
) -> RoomQuote:
    items = items or []
    return RoomQuote(
        room_id=room_id,
        room_label=room_label,
        room_type=room_type,
        items=items,
        room_subtotal=sum(i.total for i in items),
    )


@pytest.fixture
def engine() -> AggregationEngine:
    return AggregationEngine()


# ── Test: Single room passthrough (backward compat) ──────────────────────────

class TestSingleRoom:
    def test_single_room_preserves_items(self, engine: AggregationEngine):
        """Single-room input → rooms=1 in output, items unchanged."""
        items = [
            _make_item(sku="PAV-001", qty=7.0),
            _make_item(sku="BAG-SAN-001", qty=1.0, unit_price=550.0, unit="ps", description="Sanitari"),
        ]
        room = _make_room(items=items)

        result = engine.aggregate("proj-1", "user-1", [room])

        assert len(result.rooms) == 1
        assert len(result.items) == 2
        assert result.financials.subtotal > 0

    def test_empty_rooms_produces_empty_quote(self, engine: AggregationEngine):
        result = engine.aggregate("proj-1", "user-1", [])
        assert len(result.items) == 0
        assert result.financials.subtotal == 0.0


# ── Test: Singleton deduplication ─────────────────────────────────────────────

class TestSingletonDedup:
    def test_quadro_elettrico_once_per_project(self, engine: AggregationEngine):
        """IMP-EL-002 (quadro elettrico) appears in 2 rooms → kept once."""
        room1 = _make_room(
            room_id="r1", room_label="Cucina", room_type="cucina",
            items=[_make_item(sku="IMP-EL-002", qty=1, unit_price=350, unit="cad", description="Quadro elettrico")],
        )
        room2 = _make_room(
            room_id="r2", room_label="Bagno", room_type="bagno",
            items=[_make_item(sku="IMP-EL-002", qty=1, unit_price=350, unit="cad", description="Quadro elettrico")],
        )

        result = engine.aggregate("proj-1", "user-1", [room1, room2])

        quadro_items = [i for i in result.items if i.sku == "IMP-EL-002"]
        assert len(quadro_items) == 1
        assert quadro_items[0].qty == 1

        # Should have a dedup_singleton adjustment
        singleton_adjs = [a for a in result.aggregation_adjustments if a.sku == "IMP-EL-002"]
        assert len(singleton_adjs) == 1
        assert singleton_adjs[0].savings == 350.0


# ── Test: Keep separate (room-specific) ───────────────────────────────────────

class TestKeepSeparate:
    def test_sanitari_kept_per_bathroom(self, engine: AggregationEngine):
        """BAG-SAN-001 from 2 bathrooms → 2 separate line items."""
        room1 = _make_room(
            room_id="r1", room_label="Bagno Padronale", room_type="bagno",
            items=[_make_item(sku="BAG-SAN-001", qty=1, unit_price=550, unit="ps", description="Sanitari")],
        )
        room2 = _make_room(
            room_id="r2", room_label="Bagno Ospiti", room_type="bagno",
            items=[_make_item(sku="BAG-SAN-001", qty=1, unit_price=550, unit="ps", description="Sanitari")],
        )

        result = engine.aggregate("proj-1", "user-1", [room1, room2])

        san_items = [i for i in result.items if i.sku == "BAG-SAN-001"]
        assert len(san_items) == 2
        assert san_items[0].room_id == "r1"
        assert san_items[1].room_id == "r2"


# ── Test: Quantity merging ────────────────────────────────────────────────────

class TestMergeQuantities:
    def test_pavimento_merged_across_rooms(self, engine: AggregationEngine):
        """PAV-001: 7mq (bagno) + 12mq (cucina) → 19mq total."""
        room1 = _make_room(
            room_id="r1", room_label="Bagno", room_type="bagno",
            items=[_make_item(sku="PAV-001", qty=7.0, unit_price=30.0)],
        )
        room2 = _make_room(
            room_id="r2", room_label="Cucina", room_type="cucina",
            items=[_make_item(sku="PAV-001", qty=12.0, unit_price=30.0)],
        )

        result = engine.aggregate("proj-1", "user-1", [room1, room2])

        pav_items = [i for i in result.items if i.sku == "PAV-001"]
        assert len(pav_items) == 1
        assert pav_items[0].qty == 19.0
        assert pav_items[0].total == 570.0  # 19 * 30

    def test_pittura_merged_three_rooms(self, engine: AggregationEngine):
        """PIT-001 from 3 rooms merged into one line."""
        rooms = [
            _make_room(
                room_id=f"r{i}", room_label=f"Room {i}", room_type="camera",
                items=[_make_item(sku="PIT-001", qty=20.0 + i * 5, unit_price=12.0, description="Tinteggiatura")],
            )
            for i in range(3)
        ]

        result = engine.aggregate("proj-1", "user-1", rooms)

        pit_items = [i for i in result.items if i.sku == "PIT-001"]
        assert len(pit_items) == 1
        # 20 + 25 + 30 = 75mq
        assert pit_items[0].qty == 75.0


# ── Test: Volume discounts ────────────────────────────────────────────────────

class TestVolumeDiscounts:
    def test_pav_discount_over_50mq(self, engine: AggregationEngine):
        """PAV-001 total >50mq → 5% discount."""
        rooms = [
            _make_room(
                room_id=f"r{i}", room_label=f"Stanza {i}", room_type="camera",
                items=[_make_item(sku="PAV-001", qty=20.0, unit_price=30.0)],
            )
            for i in range(3)
        ]

        result = engine.aggregate("proj-1", "user-1", rooms)

        pav_items = [i for i in result.items if i.sku == "PAV-001"]
        assert len(pav_items) == 1
        assert pav_items[0].qty == 60.0
        # 5% discount: 30 * 0.95 = 28.50
        assert pav_items[0].unit_price == 28.5
        assert pav_items[0].total == 1710.0  # 60 * 28.50

        # Verify discount adjustment exists
        vol_adjs = [a for a in result.aggregation_adjustments if a.adjustment_type == "volume_discount"]
        assert len(vol_adjs) > 0
        assert vol_adjs[0].savings > 0

    def test_no_discount_under_threshold(self, engine: AggregationEngine):
        """PAV-001 total <50mq → no discount."""
        room = _make_room(
            room_id="r1", items=[_make_item(sku="PAV-001", qty=30.0, unit_price=30.0)],
        )

        result = engine.aggregate("proj-1", "user-1", [room])

        pav_items = [i for i in result.items if i.sku == "PAV-001"]
        assert pav_items[0].unit_price == 30.0  # unchanged


# ── Test: Smaltimento consolidation ───────────────────────────────────────────

class TestSmaltimento:
    def test_debris_consolidated_into_containers(self, engine: AggregationEngine):
        """SMAL-001 from 3 rooms → ceil(total/7) containers."""
        rooms = [
            _make_room(
                room_id=f"r{i}", room_label=f"Room {i}", room_type="bagno",
                items=[_make_item(sku="SMAL-001", qty=3.0, unit_price=380.0, unit="cad", description="Container smaltimento")],
            )
            for i in range(3)
        ]
        # Each room says 3 containers (9 total) — consolidated to ceil(9/7) = 2

        result = engine.aggregate("proj-1", "user-1", rooms)

        smal_items = [i for i in result.items if i.sku == "SMAL-001"]
        assert len(smal_items) == 1
        assert smal_items[0].qty == 2  # ceil(9/7)
        assert smal_items[0].total == 760.0  # 2 * 380


# ── Test: Shared overhead ─────────────────────────────────────────────────────

class TestSharedOverhead:
    def test_protezioni_charged_once(self, engine: AggregationEngine):
        """SC-002 (protezioni cantiere) from multiple rooms → charged once."""
        rooms = [
            _make_room(
                room_id=f"r{i}", room_label=f"Room {i}", room_type="camera",
                items=[_make_item(sku="SC-002", qty=1, unit_price=120.0, unit="ps", description="Protezioni cantiere")],
            )
            for i in range(3)
        ]

        result = engine.aggregate("proj-1", "user-1", rooms)

        sc_items = [i for i in result.items if i.sku == "SC-002"]
        assert len(sc_items) == 1
        assert sc_items[0].qty == 1
        assert sc_items[0].total == 120.0

        overhead_adjs = [a for a in result.aggregation_adjustments if a.adjustment_type == "shared_overhead"]
        assert len(overhead_adjs) == 1
        assert overhead_adjs[0].savings == 240.0  # 360 - 120


# ── Test: Mixed multi-room scenario ──────────────────────────────────────────

class TestFullScenario:
    def test_bathroom_and_kitchen_aggregation(self, engine: AggregationEngine):
        """Realistic: bagno + cucina → singleton dedup + merge + keep separate."""
        bagno = _make_room(
            room_id="bagno-1", room_label="Bagno Principale", room_type="bagno",
            items=[
                _make_item(sku="DEM-003", qty=13.0, unit_price=22.0, description="Rimozione piastrelle"),
                _make_item(sku="PAV-001", qty=7.0, unit_price=30.0, description="Gres pavimento"),
                _make_item(sku="BAG-SAN-001", qty=1.0, unit_price=550.0, unit="ps", description="Sanitari"),
                _make_item(sku="SC-002", qty=1.0, unit_price=120.0, unit="ps", description="Protezioni"),
            ],
        )
        cucina = _make_room(
            room_id="cucina-1", room_label="Cucina", room_type="cucina",
            items=[
                _make_item(sku="DEM-003", qty=5.0, unit_price=22.0, description="Rimozione piastrelle"),
                _make_item(sku="PAV-001", qty=12.0, unit_price=30.0, description="Gres pavimento"),
                _make_item(sku="IMP-EL-002", qty=1.0, unit_price=350.0, unit="cad", description="Quadro elettrico"),
                _make_item(sku="SC-002", qty=1.0, unit_price=120.0, unit="ps", description="Protezioni"),
            ],
        )

        result = engine.aggregate("proj-1", "user-1", [bagno, cucina])

        # DEM-003: merged (13 + 5 = 18mq)
        dem_items = [i for i in result.items if i.sku == "DEM-003"]
        assert len(dem_items) == 1
        assert dem_items[0].qty == 18.0

        # PAV-001: merged (7 + 12 = 19mq)
        pav_items = [i for i in result.items if i.sku == "PAV-001"]
        assert len(pav_items) == 1
        assert pav_items[0].qty == 19.0

        # BAG-SAN-001: kept separate (only 1 room has it)
        san_items = [i for i in result.items if i.sku == "BAG-SAN-001"]
        assert len(san_items) == 1

        # IMP-EL-002: singleton (only 1 room, kept as-is)
        el_items = [i for i in result.items if i.sku == "IMP-EL-002"]
        assert len(el_items) == 1

        # SC-002: shared overhead (charged once)
        sc_items = [i for i in result.items if i.sku == "SC-002"]
        assert len(sc_items) == 1
        assert sc_items[0].qty == 1

        # Financials should be calculated
        assert result.financials.subtotal > 0
        assert result.financials.grand_total > result.financials.subtotal

        # Should have adjustments
        assert len(result.aggregation_adjustments) > 0
        total_savings = sum(a.savings for a in result.aggregation_adjustments)
        assert total_savings >= 120.0  # At minimum, SC-002 overhead savings
