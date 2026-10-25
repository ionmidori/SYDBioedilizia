"""One quote for the whole home: the per-room lines merged by data/aggregation_rules.json."""
import json
from decimal import Decimal

import pytest
from src.core.money import line_total
from src.schemas.quote import QuoteItem, QuoteRoom
from src.schemas.room import DEFAULT_ROOM_ID, RoomBrief, RoomSchema
from src.services import price_book
from src.services.room_aggregation import (
    RULES_PATH,
    AggregationRules,
    aggregate_rooms,
    assign_sections,
    load_rules,
    room_sections,
    with_subtotals,
)
from src.utils.datetime_utils import utc_now


def _item(sku: str, qty: float, room_id: str, unit_price: float = 100.0, unit: str = "cad") -> QuoteItem:
    return QuoteItem(
        sku=sku, description=sku, unit=unit, qty=qty, unit_price=unit_price,
        total=line_total(qty, unit_price), ai_reasoning=f"proposta per {room_id}", room_id=room_id,
    )


def _room(room_id: str, label: str, room_type: str = "altro", floor_mq: float | None = None) -> RoomSchema:
    now = utc_now()
    return RoomSchema(
        room_id=room_id, label=label, room_type=room_type, created_at=now, updated_at=now,
        brief=RoomBrief(floor_mq=floor_mq),
    )


RULES = AggregationRules(
    singleton_skus=frozenset({"IMP-EL-002"}),
    keep_separate_skus=frozenset({"BAG-SAN-001"}),
    overhead_skus=frozenset({"SC-002"}),
    container_sku="SMAL-001",
    container_capacity_mc=Decimal(7),
    volume_discounts=AggregationRules.from_dict({
        "volume_discounts": [{"sku_prefix": "PAV-", "tiers": [
            {"min_qty": 50, "discount_pct": 0.05}, {"min_qty": 100, "discount_pct": 0.08},
        ]}],
    }).volume_discounts,
)
LABELS = {"bagno1": "Bagno", "cucina1": "Cucina"}


def _by_sku(items: list[QuoteItem]) -> dict[str, list[QuoteItem]]:
    out: dict[str, list[QuoteItem]] = {}
    for item in items:
        out.setdefault(item.sku, []).append(item)
    return out


# ── The bundled rules ─────────────────────────────────────────────────────────


def test_every_sku_of_the_rules_is_in_the_price_book():
    """A rule on a SKU the price book does not have would silently never apply."""
    rules = load_rules()
    known = {item["sku"] for item in price_book.seed_items()}
    assert rules.named_skus(), "the bundled rules did not load"
    assert sorted(rules.named_skus() - known) == []
    prefixes = [d.sku_prefix for d in rules.volume_discounts]
    assert prefixes and all(any(sku.startswith(p) for sku in known) for p in prefixes)


def test_the_bundled_rules_are_well_formed():
    raw = json.loads(RULES_PATH.read_text(encoding="utf-8"))
    rules = load_rules()
    assert rules.container_sku == raw["smaltimento_rule"]["container_sku"] == "SMAL-001"
    assert rules.container_capacity_mc == Decimal(7)
    # A SKU is either the home's or a room's: never both.
    assert not rules.project_wide_skus & rules.keep_separate_skus
    for discount in rules.volume_discounts:
        assert all(0 < t.discount < 1 for t in discount.tiers)


def test_unreadable_rules_merge_nothing(monkeypatch, tmp_path):
    monkeypatch.setattr("src.services.room_aggregation.RULES_PATH", tmp_path / "missing.json")
    load_rules.cache_clear()
    try:
        rules = load_rules()
        assert rules.named_skus() == {""}
        items = [_item("IMP-EL-002", 1, "bagno1"), _item("IMP-EL-002", 1, "cucina1")]
        assert [i.room_id for i in aggregate_rooms(items, rules=rules)] == ["bagno1", "cucina1"]
    finally:
        load_rules.cache_clear()


# ── Merging ───────────────────────────────────────────────────────────────────


def test_a_singleton_appears_once_in_generale_with_the_largest_quantity():
    items = [_item("IMP-EL-002", 1, "bagno1"), _item("IMP-EL-002", 2, "cucina1")]
    out = aggregate_rooms(items, LABELS, RULES)
    assert len(out) == 1
    assert (out[0].room_id, out[0].qty, out[0].total) == (DEFAULT_ROOM_ID, 2.0, Decimal("200.00"))
    assert "Bagno, Cucina" in (out[0].ai_reasoning or "")


def test_shared_overhead_is_charged_once():
    out = aggregate_rooms([_item("SC-002", 1, "bagno1"), _item("SC-002", 3, "cucina1")], LABELS, RULES)
    assert [(i.room_id, i.qty, i.total) for i in out] == [(DEFAULT_ROOM_ID, 1.0, Decimal("100.00"))]


@pytest.mark.parametrize(
    ("shares", "containers"),
    [((0.4, 0.5), 1), ((0.6, 0.6), 2), ((1, 1), 2), ((0.01,), 1), ((0.1, 0.2, 0.7), 1)],
)
def test_debris_of_every_room_fills_whole_containers(shares, containers):
    items = [_item("SMAL-001", s, f"r{n}", unit_price=380.0) for n, s in enumerate(shares)]
    out = aggregate_rooms(items, rules=RULES)
    assert [(i.room_id, i.qty) for i in out] == [(DEFAULT_ROOM_ID, float(containers))]
    assert out[0].total == line_total(containers, 380.0)


def test_room_lines_stay_in_their_room_and_merge_only_within_it():
    items = [
        _item("PIT-001", 20, "bagno1", 12.0, "mq"),
        _item("PIT-001", 5, "bagno1", 12.0, "mq"),
        _item("PIT-001", 30, "cucina1", 12.0, "mq"),
        _item("BAG-SAN-001", 1, "bagno1"),
        _item("BAG-SAN-001", 1, "bagno1"),
    ]
    out = _by_sku(aggregate_rooms(items, LABELS, RULES))
    assert [(i.room_id, i.qty, i.total) for i in out["PIT-001"]] == [
        ("bagno1", 25.0, Decimal("300.00")),
        ("cucina1", 30.0, Decimal("360.00")),
    ]
    # Kept separate: two sets of sanitari in the same bathroom are two lines.
    assert [i.room_id for i in out["BAG-SAN-001"]] == ["bagno1", "bagno1"]


def test_no_line_of_a_room_ends_up_in_another():
    items = [_item("BAG-SAN-001", 1, "bagno1"), _item("CUC-TOP-001", 3, "cucina1"), _item("PIT-001", 10, "cucina1")]
    out = aggregate_rooms(items, LABELS, RULES)
    assert {(i.sku, i.room_id) for i in out} == {
        ("BAG-SAN-001", "bagno1"), ("CUC-TOP-001", "cucina1"), ("PIT-001", "cucina1"),
    }


def test_volume_discount_on_the_home_total_lowers_the_unit_price():
    items = [_item("PAV-001", 30, "bagno1", 35.0, "mq"), _item("PAV-002", 25, "cucina1", 45.0, "mq")]
    out = _by_sku(aggregate_rooms(items, LABELS, RULES))
    # 55 mq in the home: tier 50 → 5%. The line still totals qty × unit_price.
    assert out["PAV-001"][0].unit_price == 33.25
    assert out["PAV-002"][0].unit_price == 42.75
    for line in (out["PAV-001"][0], out["PAV-002"][0]):
        assert line.total == line_total(line.qty, line.unit_price)
        assert "Sconto volume 5%" in (line.ai_reasoning or "")


def test_no_volume_discount_below_the_first_tier():
    items = [_item("PAV-001", 20, "bagno1", 35.0, "mq"), _item("PAV-001", 20, "cucina1", 35.0, "mq")]
    assert {i.unit_price for i in aggregate_rooms(items, LABELS, RULES)} == {35.0}


def test_the_highest_tier_reached_applies():
    items = [_item("PAV-001", 60, "bagno1", 10.0, "mq"), _item("PAV-001", 45, "cucina1", 10.0, "mq")]
    assert {i.unit_price for i in aggregate_rooms(items, LABELS, RULES)} == {9.2}


# ── Sections ──────────────────────────────────────────────────────────────────


def test_sections_follow_the_room_order_with_generale_last_and_exact_subtotals():
    rooms = [_room(DEFAULT_ROOM_ID, "Generale"), _room("bagno1", "Bagno", "bagno", 6.5), _room("cucina1", "Cucina", "cucina")]
    items = aggregate_rooms(
        [_item("BAG-SAN-001", 1, "bagno1", 550.0), _item("PIT-001", 10.5, "cucina1", 12.1, "mq"),
         _item("IMP-EL-002", 1, "cucina1", 350.0)],
        LABELS, RULES,
    )
    sections = room_sections(rooms, items)
    assert [(s.room_id, s.room_label, s.room_type) for s in sections] == [
        ("bagno1", "Bagno", "bagno"), ("cucina1", "Cucina", "cucina"), (DEFAULT_ROOM_ID, "Generale", "altro"),
    ]
    assert sections[0].floor_mq == 6.5
    assert [s.room_subtotal for s in sections] == [Decimal("550.00"), Decimal("127.05"), Decimal("350.00")]


def test_a_room_without_lines_has_no_section():
    sections = room_sections([_room("bagno1", "Bagno"), _room("cucina1", "Cucina")], [_item("X", 1, "bagno1")])
    assert [s.room_id for s in sections] == ["bagno1"]


def test_an_admin_line_without_a_known_room_goes_to_generale():
    sections = [QuoteRoom(room_id="bagno1", room_label="Bagno", room_type="bagno")]
    items = assign_sections([_item("X", 1, "bagno1"), _item("MANUALE-001", 2, "cantina")], sections)
    assert [i.room_id for i in items] == ["bagno1", DEFAULT_ROOM_ID]
    out = with_subtotals(sections, items)
    assert [(s.room_id, s.room_subtotal) for s in out] == [
        ("bagno1", Decimal("100.00")), (DEFAULT_ROOM_ID, Decimal("200.00")),
    ]


def test_an_emptied_section_stays_with_a_zero_subtotal():
    sections = [QuoteRoom(room_id="bagno1", room_label="Bagno", room_type="bagno")]
    assert [(s.room_id, s.room_subtotal) for s in with_subtotals(sections, [])] == [("bagno1", Decimal("0.00"))]


def test_two_jobs_on_the_same_floor_are_one_surface_for_the_discount():
    """Screed and tiles of a 30 mq room are 30 mq of floor, not 60: no 50 mq tier."""
    items = [_item("PAV-004", 30, "bagno1", 20.0, "mq"), _item("PAV-001", 30, "bagno1", 35.0, "mq")]
    assert {i.unit_price for i in aggregate_rooms(items, LABELS, RULES)} == {20.0, 35.0}


def test_the_floors_of_different_rooms_add_up_for_the_discount():
    items = [
        _item("PAV-004", 30, "bagno1", 20.0, "mq"), _item("PAV-001", 30, "bagno1", 35.0, "mq"),
        _item("PAV-001", 25, "cucina1", 35.0, "mq"),
    ]
    # 30 (bathroom) + 25 (kitchen) = 55 mq → 5% on every PAV- line.
    assert sorted(i.unit_price for i in aggregate_rooms(items, LABELS, RULES)) == [19.0, 33.25, 33.25]
