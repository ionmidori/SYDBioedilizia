"""Phase 140 step 3: the price range of a draft, computed from where its measures came from.

A line's uncertainty is the one of its least reliable measure; manual work widens
only the upper bound; the client is shown the precision, never the amounts.
"""
from decimal import Decimal
from typing import get_args

import pytest
from pydantic import ValidationError
from src.schemas.intervention_spec import StoredMeasureSource
from src.schemas.price_range import PriceEstimate, PriceRangePolicy
from src.services.intervention_expansion import ExpandedLine, LineOrigin
from src.services.price_range import estimate, line_uncertainty, load_price_range_policy


@pytest.fixture
def policy() -> PriceRangePolicy:
    return PriceRangePolicy(
        version="test",
        by_source={
            "confirmed": Decimal("0.05"), "declared": Decimal("0.10"), "photo": Decimal("0.15"),
            "brief": Decimal("0.15"), "estimated": Decimal("0.25"),
        },
        no_measure=Decimal("0.05"),
        model_qty=Decimal("0.25"),
        manual_work_high=Decimal("0.10"),
        manual_work_cap=Decimal("0.50"),
        precision_step=5,
    )


def _line(*measures: str, origin: LineOrigin = "package") -> ExpandedLine:
    return ExpandedLine(sku="BAG-RIV-001", qty=Decimal("10"), reasoning="r", origin=origin, measures=measures)


def _one(line: ExpandedLine, sources: dict[str, StoredMeasureSource], policy: PriceRangePolicy, *,
         manual: int = 0, subtotal: str = "1000", grand_total: str = "1000") -> PriceEstimate | None:
    return estimate(
        [(line, Decimal(subtotal))], sources, manual_count=manual,
        grand_total=Decimal(grand_total), subtotal=Decimal(subtotal), policy=policy,
    )


def test_confirmed_measure_narrows(policy: PriceRangePolicy) -> None:
    result = _one(_line("mq"), {"mq": "confirmed"}, policy)
    assert result is not None
    assert (result.low, result.high, result.precision) == (Decimal("950.00"), Decimal("1050.00"), 95)
    assert result.policy_version == "test"


def test_least_reliable_source_wins(policy: PriceRangePolicy) -> None:
    sources: dict[str, StoredMeasureSource] = {"mq": "confirmed", "mq_pareti": "estimated"}
    assert line_uncertainty(_line("mq", "mq_pareti"), sources, policy) == Decimal("0.25")
    assert line_uncertainty(_line("mq"), sources, policy) == Decimal("0.05")


def test_measure_of_unknown_source_counts_as_estimated(policy: PriceRangePolicy) -> None:
    assert line_uncertainty(_line("mq"), {}, policy) == Decimal("0.25")


def test_extra_line_uses_model_qty(policy: PriceRangePolicy) -> None:
    assert line_uncertainty(_line(origin="extra"), {"mq": "confirmed"}, policy) == Decimal("0.25")


def test_line_without_measures_uses_no_measure(policy: PriceRangePolicy) -> None:
    assert line_uncertainty(_line(), {}, policy) == Decimal("0.05")
    assert line_uncertainty(_line(origin="rule"), {}, policy) == Decimal("0.05")


def test_lines_add_up(policy: PriceRangePolicy) -> None:
    result = estimate(
        [(_line("mq"), Decimal("1000")), (_line(origin="extra"), Decimal("200"))],
        {"mq": "confirmed"}, manual_count=0, grand_total=Decimal("1200"), subtotal=Decimal("1200"), policy=policy,
    )
    assert result is not None
    assert (result.low, result.high) == (Decimal("1100.00"), Decimal("1300.00"))


@pytest.mark.parametrize(("manual", "high"), [
    pytest.param(2, Decimal("1260.00"), id="two-widen-20pc"),
    pytest.param(6, Decimal("1575.00"), id="six-capped-at-50pc"),
])
def test_manual_work_widens_high_capped(policy: PriceRangePolicy, manual: int, high: Decimal) -> None:
    result = _one(_line("mq"), {"mq": "confirmed"}, policy, manual=manual)
    assert result is not None
    assert (result.low, result.high) == (Decimal("950.00"), high)


@pytest.mark.parametrize(("source", "manual", "precision"), [
    # low 750, high 1250 · 1.1 = 1375 → 1 − 625/2125 = 70.6 % → 70 (down).
    pytest.param("estimated", 1, 70, id="down"),
    # low 950, high 1050 · 1.4 = 1470 → 1 − 520/2420 = 78.5 % → 80 (up: not a floor).
    pytest.param("confirmed", 4, 80, id="up"),
])
def test_precision_rounds_to_the_nearest_step(
    policy: PriceRangePolicy, source: StoredMeasureSource, manual: int, precision: int
) -> None:
    result = _one(_line("mq"), {"mq": source}, policy, manual=manual)
    assert result is not None
    assert result.precision == precision


def test_vat_scaling(policy: PriceRangePolicy) -> None:
    result = _one(_line("mq"), {"mq": "confirmed"}, policy, grand_total="1220")
    assert result is not None
    assert (result.low, result.high, result.precision) == (Decimal("1159.00"), Decimal("1281.00"), 95)


@pytest.mark.parametrize("subtotal", ["0", "0.00"])
def test_zero_subtotal_none(policy: PriceRangePolicy, subtotal: str) -> None:
    assert _one(_line("mq"), {"mq": "confirmed"}, policy, subtotal=subtotal, grand_total="0") is None
    assert estimate([], {}, manual_count=3, grand_total=Decimal("0"), subtotal=Decimal("0"), policy=policy) is None


def test_policy_file_valid() -> None:
    policy = load_price_range_policy()
    assert policy.version
    assert set(policy.by_source) == set(get_args(StoredMeasureSource))
    assert policy.by_source["confirmed"] < policy.by_source["estimated"]


def test_policy_needs_every_source_and_fractions(policy: PriceRangePolicy) -> None:
    data = policy.model_dump()
    with pytest.raises(ValidationError):
        PriceRangePolicy.model_validate({**data, "by_source": {"confirmed": "0.05"}})
    with pytest.raises(ValidationError):
        PriceRangePolicy.model_validate({**data, "model_qty": "1.5"})
    with pytest.raises(ValidationError):
        PriceRangePolicy.model_validate({**data, "precision_step": 0})
