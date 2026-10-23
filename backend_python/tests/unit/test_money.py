"""src/core/money.py: input validation, the Pydantic `Money` type and independence from the
thread's Decimal context. The rounding cases themselves are in test_money_golden.py."""
import decimal
import json
import math
from decimal import Decimal

import pytest
from pydantic import BaseModel, Field, ValidationError
from src.core.money import (
    Money,
    discounted_line_total,
    line_total,
    round_half_up,
    sum_amounts,
    to_cents,
    to_decimal,
    to_json_number,
)


class _Priced(BaseModel):
    total: Money = Field(..., ge=0)
    optional: Money | None = None


@pytest.mark.parametrize("bad", [math.nan, math.inf, -math.inf, True, False, "abc", None, [1]])
def test_to_decimal_rejects_what_is_not_a_finite_number(bad):
    with pytest.raises(ValueError):
        to_decimal(bad)


def test_to_decimal_reads_a_float_as_the_decimal_it_prints_as():
    assert to_decimal(1.005) == Decimal("1.005")
    assert to_decimal(0.1 + 0.2) == Decimal("0.30000000000000004")
    assert to_decimal(7) == Decimal(7)
    assert to_decimal("12.50") == Decimal("12.50")
    assert to_decimal(Decimal("3.14159")) == Decimal("3.14159")


def test_negative_zero_is_normalised():
    assert str(to_cents(-0.004)) == "0.00"
    assert str(to_cents(Decimal("-0"))) == "0.00"


def test_round_half_up_to_other_places():
    assert str(round_half_up(0.25, 1)) == "0.3"
    assert str(round_half_up(2.5, 0)) == "3"
    assert str(round_half_up(-2.5, 0)) == "-3"


def test_results_ignore_the_thread_decimal_context():
    with decimal.localcontext() as ctx:
        ctx.prec = 3
        ctx.rounding = decimal.ROUND_DOWN
        assert str(line_total(10000, 999999.99)) == "9999999900.00"
        assert str(to_cents(0.125)) == "0.13"


def test_an_input_too_precise_to_multiply_exactly_is_an_error_not_a_silent_rounding():
    with pytest.raises(ValueError):
        line_total("1." + "1" * 60, 1)


def test_discounted_line_total_rounds_once():
    # 3 x 0.335 x 0.9 = 0.9045 -> 0.90 (rounding the line first would give 1.01 x 0.9 = 0.909 -> 0.91)
    assert str(discounted_line_total(3, 0.335, 0.1)) == "0.90"


def test_sum_amounts_rounds_each_term_and_adds_exactly():
    assert sum_amounts([0.1, 0.2, 0.30000000000000004]) == Decimal("0.60")
    assert sum_amounts([]) == Decimal("0.00")


def test_to_json_number():
    assert to_json_number(Decimal("11.13")) == 11.13
    assert isinstance(to_json_number(Decimal("0.00")), float)


def test_money_field_is_decimal_inside_and_a_number_outside():
    priced = _Priced(total=11.125)
    assert priced.total == Decimal("11.13")
    dumped = priced.model_dump()
    assert dumped == {"total": 11.13, "optional": None}
    assert type(dumped["total"]) is float  # Firestore rejects Decimal values
    assert json.loads(priced.model_dump_json()) == {"total": 11.13, "optional": None}
    assert _Priced.model_validate_json('{"total": 0.5}').total == Decimal("0.50")


def test_money_field_keeps_its_constraints_and_rejects_bad_numbers():
    with pytest.raises(ValidationError):
        _Priced(total=-1)
    for bad in (math.nan, math.inf, True):
        with pytest.raises(ValidationError):
            _Priced(total=bad)


def test_money_field_json_schema_is_a_number():
    schema = _Priced.model_json_schema()
    assert schema["properties"]["total"]["type"] == "number"
