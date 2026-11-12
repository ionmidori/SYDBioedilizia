"""Price range of a draft (Phase 140, step 3), from where each line's quantity came from.

Pure and in `Decimal`. A line is as uncertain as its least reliable measure; an
extra line, whose quantity the model wrote, as `model_qty`. Each work quoted by
hand widens only the upper bound. The range is scaled to VAT included, and the
precision (0-100) is what the client is shown instead of the amounts.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import ROUND_HALF_UP, Context, Decimal
from functools import cache
from pathlib import Path

from src.core.money import round_half_up, sum_amounts, to_cents
from src.schemas.intervention_spec import StoredMeasureSource
from src.schemas.price_range import PriceEstimate, PriceRangePolicy
from src.services.intervention_expansion import ExpandedLine

POLICY_PATH = Path(__file__).resolve().parent.parent / "data" / "price_range_policy.json"

# A measure whose source is not known is as uncertain as an estimate.
_UNKNOWN_SOURCE: StoredMeasureSource = "estimated"
# Ratios (VAT scaling, precision) before the one rounding step.
_RATIO = Context(prec=28, rounding=ROUND_HALF_UP)
_ONE = Decimal(1)
_HUNDRED = Decimal(100)


@cache
def load_price_range_policy() -> PriceRangePolicy:
    """The validated policy, read once. It ships with the code (a test pins it), so
    a missing or invalid file is a deploy error, not a runtime case."""
    return PriceRangePolicy.model_validate_json(POLICY_PATH.read_text(encoding="utf-8"))


def line_uncertainty(
    line: ExpandedLine, sources: Mapping[str, StoredMeasureSource], policy: PriceRangePolicy
) -> Decimal:
    """The share a line's amount may be off by."""
    if line.origin == "extra":
        return policy.model_qty
    if not line.measures:
        return policy.no_measure
    return max(policy.by_source[sources.get(name, _UNKNOWN_SOURCE)] for name in line.measures)


def _precision(low: Decimal, high: Decimal, step: int) -> int:
    width = _RATIO.divide(high - low, high + low)
    percent = (_ONE - width) * _HUNDRED
    return int(round_half_up(_RATIO.divide(percent, Decimal(step)), 0)) * step


def estimate(
    priced: Sequence[tuple[ExpandedLine, Decimal]],
    sources: Mapping[str, StoredMeasureSource],
    *,
    manual_count: int,
    grand_total: Decimal,
    subtotal: Decimal,
    policy: PriceRangePolicy,
) -> PriceEstimate | None:
    """The range of the draft whose lines are `priced` (each with its net amount).

    None when there is nothing to range: no line, or a zero subtotal."""
    if not priced or subtotal <= 0:
        return None
    shares = [(amount, line_uncertainty(line, sources, policy)) for line, amount in priced]
    low = sum_amounts(amount * (_ONE - share) for amount, share in shares)
    high = sum_amounts(amount * (_ONE + share) for amount, share in shares)
    high *= _ONE + min(manual_count * policy.manual_work_high, policy.manual_work_cap)
    vat = _RATIO.divide(grand_total, subtotal)
    low, high = to_cents(low * vat), to_cents(high * vat)
    if low + high <= 0:
        return None
    return PriceEstimate(
        low=low, high=high, precision=_precision(low, high, policy.precision_step), policy_version=policy.version
    )
