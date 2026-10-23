"""Money: every amount in euro is a `Decimal` rounded to the cent, half away from zero.

One rule for the whole quote, shared with the frontend (`web_client/lib/money.ts`) and
pinned by `contracts/money/golden_vectors.json`:

    line     = round(qty x unit_price)
    subtotal = sum of the lines
    VAT      = round(subtotal x vat_rate)
    total    = subtotal + VAT

- A float input means the decimal it prints as (`repr`): 1.005 is 1.005, not the binary
  value just below it. NaN, infinities and bools are rejected.
- Arithmetic runs in this module's own contexts, never the thread's: multiplications
  and sums are exact (an input too precise for that is an error, not a silent
  rounding), and the only rounding is the final one to the cent.
- `Money` is the Pydantic field type: a `Decimal` inside the model, a JSON number in
  `model_dump()` / JSON / Firestore (Firestore rejects `Decimal` values), so stored
  data and the TypeScript types do not change.

Never round an amount with `round()` (half-even on the binary value: 0.5 x 22.25 gives
11.12) — a guard test fails on `round(…, 2)` outside this module.
"""
from __future__ import annotations

import math
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from decimal import (
    ROUND_HALF_UP,
    Context,
    Decimal,
    DivisionByZero,
    Inexact,
    InvalidOperation,
    Overflow,
)
from typing import Annotated

from pydantic import BeforeValidator, PlainSerializer, WithJsonSchema

# Exact arithmetic: Inexact is trapped, so a result that does not fit is an error.
_EXACT = Context(prec=60, rounding=ROUND_HALF_UP, traps=[InvalidOperation, DivisionByZero, Overflow, Inexact])
# The one rounding step (quantize), half away from zero.
_ROUND = Context(prec=60, rounding=ROUND_HALF_UP, traps=[InvalidOperation, DivisionByZero, Overflow])
_CENT_PLACES = 2

type Amount = Decimal | float | int | str


def to_decimal(value: object) -> Decimal:
    """The exact decimal a number stands for. Raises ValueError for anything that is
    not a finite number (bools included: `True` is not 1 euro)."""
    if isinstance(value, bool):
        raise ValueError("a bool is not an amount")
    if isinstance(value, Decimal):
        result = value
    elif isinstance(value, int):
        result = Decimal(value)
    elif isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError(f"not a finite number: {value!r}")
        result = Decimal(repr(value))
    elif isinstance(value, str):
        try:
            result = Decimal(value.strip())
        except InvalidOperation:
            raise ValueError(f"not a number: {value!r}") from None
    else:
        raise ValueError(f"not a number: {type(value).__name__}")
    if not result.is_finite():
        raise ValueError(f"not a finite number: {value!r}")
    return result


def _exact(operation: Callable[[Decimal, Decimal], Decimal], a: Decimal, b: Decimal) -> Decimal:
    try:
        return operation(a, b)
    except ArithmeticError as exc:  # Inexact / Overflow: the inputs carry too many digits
        raise ValueError(f"amount out of range for exact arithmetic ({type(exc).__name__})") from None


def round_half_up(value: Amount, places: int) -> Decimal:
    """`value` rounded to `places` decimals, half away from zero (never "-0.00")."""
    try:
        result = to_decimal(value).quantize(Decimal(1).scaleb(-places, _ROUND), context=_ROUND)
    except InvalidOperation:
        raise ValueError(f"amount out of range: {value!r}") from None
    return result.copy_abs() if result.is_zero() else result


def to_cents(value: Amount) -> Decimal:
    """An amount rounded to the cent."""
    return round_half_up(value, _CENT_PLACES)


def line_total(qty: Amount, unit_price: Amount) -> Decimal:
    return to_cents(_exact(_EXACT.multiply, to_decimal(qty), to_decimal(unit_price)))


def discounted_line_total(qty: Amount, unit_price: Amount, discount: Amount) -> Decimal:
    """qty x unit_price x (1 - discount), rounded once at the end."""
    gross = _exact(_EXACT.multiply, to_decimal(qty), to_decimal(unit_price))
    return to_cents(_exact(_EXACT.multiply, gross, _exact(_EXACT.subtract, Decimal(1), to_decimal(discount))))


def sum_amounts(amounts: Iterable[Amount]) -> Decimal:
    """Each term to the cent, then an exact sum (so the result is in cents too)."""
    total = Decimal("0.00")
    for amount in amounts:
        total = _exact(_EXACT.add, total, to_cents(amount))
    return total


def vat_amount(subtotal: Amount, vat_rate: Amount) -> Decimal:
    return to_cents(_exact(_EXACT.multiply, to_cents(subtotal), to_decimal(vat_rate)))


@dataclass(frozen=True)
class Totals:
    subtotal: Decimal
    vat_amount: Decimal
    grand_total: Decimal


def compute_totals(line_totals: Iterable[Amount], vat_rate: Amount) -> Totals:
    """The canonical quote totals from its line totals."""
    subtotal = sum_amounts(line_totals)
    vat = vat_amount(subtotal, vat_rate)
    return Totals(subtotal=subtotal, vat_amount=vat, grand_total=_exact(_EXACT.add, subtotal, vat))


def to_json_number(value: Decimal) -> float:
    """The JSON / Firestore form of an amount (the closest float to the cents value)."""
    return float(value)


Money = Annotated[
    Decimal,
    BeforeValidator(to_cents),
    PlainSerializer(to_json_number, return_type=float),
    WithJsonSchema({"type": "number"}),
]
"""Pydantic field type for an amount in euro (see the module docstring)."""
