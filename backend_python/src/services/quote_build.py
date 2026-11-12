"""The draft of a quote from the expanded lines of its units (Phase 140, step 3).

One pipeline for both writers of the AI draft: the quote tool, after the
model's analysis, and the confirmation card, which recalculates without the
model. It prices the lines, merges the rooms into sections ("Generale" holds
the project-wide lines), computes the totals and the price range, and names the
room of each manual work and warning for the team. No I/O but the cached price
book; never logs the project id (for guests it is an access token).
"""
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal

from src.core.money import line_total, sum_amounts
from src.schemas.intervention_spec import RoomInterventionSpec, StoredMeasureSource
from src.schemas.price_range import PriceEstimate
from src.schemas.quote import ManualWorkItem, QuoteAiWarning, QuoteFinancials, QuoteSchema, RevisionRoomSpec
from src.schemas.room import RoomSchema
from src.services.intervention_expansion import Expansion
from src.services.price_range import PricedLine, estimate, load_price_range_policy
from src.services.pricing_service import PricingService
from src.services.room_aggregation import aggregate_rooms, room_sections

logger = logging.getLogger(__name__)

# Below this grand total a draft of several lines usually means malformed AI output.
_SUSPICIOUS_GRAND_TOTAL = Decimal(100)


@dataclass(frozen=True)
class UnitBuild:
    """One quoted unit: a room, "Generale", or the whole chat of a project without rooms."""
    section_id: str | None  # quote section of its lines; None: a quote without sections
    label: str | None  # room name the team reads next to its manual work; None: no sections
    expansion: Expansion
    spec: RoomInterventionSpec | None  # what the lines were expanded from (None: no library)


@dataclass(frozen=True)
class BuiltDraft:
    quote: QuoteSchema
    manual_work: list[ManualWorkItem]
    ai_warnings: list[QuoteAiWarning]
    specs: list[RevisionRoomSpec]  # for the AI revision (learning ledger)


def price_book_units() -> dict[str, str]:
    """SKU → unit of the live price book, what `expand` checks the library lines against."""
    return {str(item["sku"]): str(item["unit"]) for item in PricingService.load_price_book()}


def _sources(spec: RoomInterventionSpec | None) -> dict[str, StoredMeasureSource]:
    return {m.name: m.source for m in spec.measures} if spec is not None else {}


def _manual_work(units: Sequence[UnitBuild]) -> list[ManualWorkItem]:
    return [
        ManualWorkItem(work=work.work, room_id=u.section_id, room_label=u.label, origin=work.origin)
        for u in units
        for work in u.expansion.manual_work
    ]


def _ai_warnings(units: Sequence[UnitBuild]) -> list[QuoteAiWarning]:
    return [
        QuoteAiWarning(
            kind=warning.kind, message=warning.message, room_id=u.section_id, room_label=u.label,
            skus=list(warning.skus),
        )
        for u in units
        for warning in u.expansion.warnings
    ]


def _estimate(units: Sequence[UnitBuild], financials: QuoteFinancials, manual_count: int) -> PriceEstimate | None:
    """The range of the draft, from each line's own price before the rooms are merged.

    Scaled by the final grand total over the sum of those prices, so the range is
    centred on the total the team reviews (merging and volume discounts included)."""
    book = {str(item["sku"]): item for item in PricingService.load_price_book()}
    priced = [
        PricedLine(line, line_total(line.qty, book[line.sku]["unit_price"]), _sources(u.spec))
        for u in units
        for line in u.expansion.lines
        if line.sku in book
    ]
    return estimate(
        priced,
        manual_count=manual_count,
        grand_total=financials.grand_total,
        subtotal=sum_amounts(p.amount for p in priced),
        policy=load_price_range_policy(),
    )


def build_draft(
    project_id: str, user_id: str, units: Sequence[UnitBuild], rooms: Sequence[RoomSchema], *, to_quote: bool
) -> BuiltDraft:
    """The AI draft of `units`: one section per room when `to_quote` (the project
    has rooms to quote), `rooms` naming them; a quote without sections otherwise."""
    sku_list = [
        {"sku": line.sku, "qty": float(line.qty), "ai_reasoning": line.reasoning, "room_id": u.section_id}
        for u in units
        for line in u.expansion.lines
    ]
    quote = PricingService.create_quote_from_skus(project_id, user_id, sku_list)
    if to_quote:
        items = aggregate_rooms(quote.items, {r.room_id: r.label for r in rooms})
        quote = quote.model_copy(update={
            "items": items,
            "rooms": room_sections(rooms, items),
            "financials": PricingService.calculate_financials(items),
        })
    manual_work = _manual_work(units)
    quote = quote.model_copy(update={"estimate": _estimate(units, quote.financials, len(manual_work))})
    if quote.financials.grand_total < _SUSPICIOUS_GRAND_TOTAL and len(quote.items) > 1:
        logger.warning(
            "[QuoteBuild] Suspicious grand total: verify the price book and the AI output.",
            extra={"grand_total": float(quote.financials.grand_total), "items": len(quote.items)},
        )
    return BuiltDraft(
        quote=quote,
        manual_work=manual_work,
        ai_warnings=_ai_warnings(units),
        specs=[RevisionRoomSpec(room_id=u.section_id, spec=u.spec) for u in units if u.spec is not None],
    )
