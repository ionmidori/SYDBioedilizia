"""One quote for the whole home from the per-room analyses (Phase 138).

`suggest_quote_items` analyses every room on its own, so a project-wide line
shows up in several rooms: an electrical panel per room, a debris container
each, site protection twice. The rules in `data/aggregation_rules.json` turn
the room lines into the quote the client gets — the lines are already right,
no "combined savings" are shown:

- `project_singleton_skus`: once per home, the largest quantity among the rooms;
- `shared_overhead_skus`: once per home, quantity 1;
- `smaltimento_rule`: the debris of every room in as many containers
  (`container_sku`, `capacity_mc` m³ each) as the whole home fills;
- `keep_separate_skus`: never merged, each line stays as the room proposed it;
- every other SKU: lines of the same room merged into one (quantities summed);
- `volume_discounts`: a SKU prefix whose quantity over the whole home reaches a
  tier gets that discount on the unit price of each of its lines. A room counts
  its largest line of the prefix, not their sum: screed and tiles under `PAV-`
  are the same floor, not twice its area.

Project-wide lines go to the "Generale" section (`DEFAULT_ROOM_ID`). Quantities
and amounts only through `src/core/money.py`. The rule loading comes from
`batch_aggregation_engine.py`, which is going away with the quote batches.
"""
from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any

from src.core.logger import get_logger
from src.core.money import discounted_unit_price, line_total, sum_amounts, sum_quantities, to_decimal, whole_units
from src.schemas.quote import QuoteItem, QuoteRoom
from src.schemas.room import DEFAULT_ROOM_ID, DEFAULT_ROOM_LABEL, RoomSchema

logger = get_logger(__name__)

RULES_PATH = Path(__file__).parent.parent / "data" / "aggregation_rules.json"


@dataclass(frozen=True)
class VolumeTier:
    min_qty: Decimal
    discount: Decimal


@dataclass(frozen=True)
class VolumeDiscount:
    sku_prefix: str
    # Highest threshold first.
    tiers: tuple[VolumeTier, ...]

    def discount_for(self, qty: Decimal) -> Decimal | None:
        return next((t.discount for t in self.tiers if qty >= t.min_qty), None)


@dataclass(frozen=True)
class AggregationRules:
    singleton_skus: frozenset[str] = frozenset()
    keep_separate_skus: frozenset[str] = frozenset()
    overhead_skus: frozenset[str] = frozenset()
    container_sku: str = "SMAL-001"
    container_capacity_mc: Decimal = Decimal(7)
    volume_discounts: tuple[VolumeDiscount, ...] = ()

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any]) -> AggregationRules:
        smaltimento = raw.get("smaltimento_rule") or {}
        return cls(
            singleton_skus=frozenset((raw.get("project_singleton_skus") or {}).get("skus") or []),
            keep_separate_skus=frozenset((raw.get("keep_separate_skus") or {}).get("skus") or []),
            overhead_skus=frozenset((raw.get("shared_overhead_skus") or {}).get("skus") or []),
            container_sku=smaltimento.get("container_sku", "SMAL-001"),
            container_capacity_mc=to_decimal(smaltimento.get("capacity_mc", 7)),
            volume_discounts=tuple(
                VolumeDiscount(
                    sku_prefix=rule["sku_prefix"],
                    tiers=tuple(sorted(
                        (VolumeTier(to_decimal(t["min_qty"]), to_decimal(t["discount_pct"])) for t in rule["tiers"]),
                        key=lambda t: t.min_qty,
                        reverse=True,
                    )),
                )
                for rule in raw.get("volume_discounts") or []
                if rule.get("sku_prefix") and rule.get("tiers")
            ),
        )

    @property
    def project_wide_skus(self) -> frozenset[str]:
        """Lines that belong to the home, not to a room ("Generale" section)."""
        return self.singleton_skus | self.overhead_skus | {self.container_sku}

    def named_skus(self) -> set[str]:
        """Every exact SKU the rules name (checked against the price book by a test)."""
        return set(self.singleton_skus | self.keep_separate_skus | self.overhead_skus | {self.container_sku})


@lru_cache(maxsize=1)
def load_rules() -> AggregationRules:
    """The bundled rules; without them (unreadable file) nothing is merged."""
    try:
        return AggregationRules.from_dict(json.loads(RULES_PATH.read_text(encoding="utf-8")))
    except (OSError, ValueError, KeyError, TypeError):
        logger.exception("[RoomAggregation] Aggregation rules not readable: rooms are not merged.")
        return AggregationRules(container_sku="")


def _note(item: QuoteItem, text: str) -> str:
    return f"{item.ai_reasoning} — {text}" if item.ai_reasoning else text


def _priced(item: QuoteItem, qty: Decimal, *, room_id: str, unit_price: float | None = None, note: str) -> QuoteItem:
    price = item.unit_price if unit_price is None else unit_price
    return item.model_copy(update={
        "qty": float(qty),
        "unit_price": price,
        "total": line_total(qty, price),
        "room_id": room_id,
        "ai_reasoning": note,
    })


def _rooms_text(lines: Sequence[QuoteItem], labels: Mapping[str, str]) -> str:
    rooms = dict.fromkeys(labels.get(i.room_id or "", i.room_id or DEFAULT_ROOM_LABEL) for i in lines)
    return ", ".join(rooms)


def _project_line(sku: str, lines: list[QuoteItem], rules: AggregationRules, labels: Mapping[str, str]) -> QuoteItem:
    rooms = _rooms_text(lines, labels)
    if sku == rules.container_sku:
        # A room's quantity is the share of a container its debris fills (0.4 = 40%).
        filled = sum_quantities(i.qty for i in lines)
        containers = max(1, whole_units(filled))
        note = (
            f"Macerie di tutta la casa ({rooms}): circa {filled * rules.container_capacity_mc:.1f} m³, "
            f"{containers} container da {rules.container_capacity_mc:f} m³"
        )
        return _priced(lines[0], Decimal(containers), room_id=DEFAULT_ROOM_ID, note=note)
    if sku in rules.overhead_skus:
        return _priced(lines[0], Decimal(1), room_id=DEFAULT_ROOM_ID, note=_note(lines[0], f"Costo unico per tutta la casa ({rooms})"))
    largest = max(lines, key=lambda i: to_decimal(i.qty))
    return _priced(
        largest, to_decimal(largest.qty), room_id=DEFAULT_ROOM_ID,
        note=_note(largest, f"Uno solo per tutta la casa ({rooms})"),
    )


def _merge_room_lines(items: Sequence[QuoteItem], rules: AggregationRules) -> list[QuoteItem]:
    """Same SKU twice in a room → one line, unless the SKU is kept separate."""
    out: list[QuoteItem] = []
    merged: dict[tuple[str | None, str], int] = {}
    for item in items:
        key = (item.room_id, item.sku)
        if item.sku in rules.keep_separate_skus or key not in merged:
            merged.setdefault(key, len(out))
            out.append(item)
            continue
        index = merged[key]
        first = out[index]
        qty = sum_quantities((first.qty, item.qty))
        reasons = " · ".join(r for r in (first.ai_reasoning, item.ai_reasoning) if r)
        out[index] = _priced(first, qty, room_id=first.room_id or DEFAULT_ROOM_ID, note=reasons)
    return out


def _apply_volume_discounts(items: list[QuoteItem], rules: AggregationRules) -> list[QuoteItem]:
    discounted: set[int] = set()
    for rule in rules.volume_discounts:
        matching = [n for n, i in enumerate(items) if i.sku.startswith(rule.sku_prefix) and n not in discounted]
        if not matching:
            continue
        # Per room the largest line (one surface), then the rooms added up.
        surface: dict[str | None, Decimal] = {}
        for n in matching:
            qty = to_decimal(items[n].qty)
            surface[items[n].room_id] = max(qty, surface.get(items[n].room_id, qty))
        home_qty = sum_quantities(surface.values())
        discount = rule.discount_for(home_qty)
        if discount is None:
            continue
        for n in matching:
            item = items[n]
            note = _note(item, f"Sconto volume {discount * 100:.0f}% ({home_qty.normalize():f} {item.unit} in tutta la casa)")
            price = float(discounted_unit_price(item.unit_price, discount))
            items[n] = _priced(item, to_decimal(item.qty), room_id=item.room_id or DEFAULT_ROOM_ID, unit_price=price, note=note)
            discounted.add(n)
    return items


def aggregate_rooms(
    items: Sequence[QuoteItem],
    room_labels: Mapping[str, str] | None = None,
    rules: AggregationRules | None = None,
) -> list[QuoteItem]:
    """The home's quote lines from the lines of every room (each with its `room_id`)."""
    rules = rules or load_rules()
    labels = room_labels or {}
    project: dict[str, list[QuoteItem]] = {}
    room_lines: list[QuoteItem] = []
    for item in items:
        if item.sku in rules.project_wide_skus:
            project.setdefault(item.sku, []).append(item)
        else:
            room_lines.append(item)
    out = _merge_room_lines(room_lines, rules)
    out += [_project_line(sku, lines, rules, labels) for sku, lines in project.items()]
    out = _apply_volume_discounts(out, rules)
    logger.info("[RoomAggregation] Rooms merged.", extra={"lines_in": len(items), "lines_out": len(out)})
    return out


# ── Sections ──────────────────────────────────────────────────────────────────


def general_section() -> QuoteRoom:
    return QuoteRoom(room_id=DEFAULT_ROOM_ID, room_label=DEFAULT_ROOM_LABEL, room_type="altro")


def room_sections(rooms: Sequence[RoomSchema], items: Sequence[QuoteItem]) -> list[QuoteRoom]:
    """A section per room with lines, in the project's room order, "Generale" last."""
    used = {i.room_id or DEFAULT_ROOM_ID for i in items}
    sections = [
        QuoteRoom(
            room_id=r.room_id,
            room_label=r.label,
            room_type=r.room_type,
            floor_mq=r.brief.floor_mq,
            walls_mq=r.brief.walls_mq,
        )
        for r in rooms
        if r.room_id in used and r.room_id != DEFAULT_ROOM_ID
    ]
    if DEFAULT_ROOM_ID in used:
        sections.append(general_section())
    return with_subtotals(sections, items)


def assign_sections(items: Sequence[QuoteItem], sections: Sequence[QuoteRoom]) -> list[QuoteItem]:
    """Lines without a known section go to "Generale" (a line the admin added)."""
    known = {s.room_id for s in sections}
    return [i if i.room_id in known else i.model_copy(update={"room_id": DEFAULT_ROOM_ID}) for i in items]


def with_subtotals(sections: Sequence[QuoteRoom], items: Sequence[QuoteItem]) -> list[QuoteRoom]:
    """The sections with their subtotals (sections stay even when emptied, so the
    admin can move lines back); "Generale" is added when a line needs it."""
    out = list(sections)
    if not any(s.room_id == DEFAULT_ROOM_ID for s in out) and any(
        (i.room_id or DEFAULT_ROOM_ID) not in {s.room_id for s in out} for i in items
    ):
        out.append(general_section())
    known = {s.room_id for s in out}
    return [
        s.model_copy(update={"room_subtotal": sum_amounts(
            i.total for i in items if (i.room_id if i.room_id in known else DEFAULT_ROOM_ID) == s.room_id
        )})
        for s in out
    ]
