"""Measures the code derives from a room's dimensions (Phase 140).

Pure and in `Decimal`, never raises: a dimension that is missing or outside
`(0, MAX_DIMENSION_M]` derives nothing, and the question stays open. Walls are
gross: doors and windows are not subtracted (the team gets a check for it).
"""
from decimal import Decimal

from src.core.money import round_half_up

# Ceiling height when the client gave none (the card's `height_m` wins over it).
DEFAULT_HEIGHT_M = Decimal("2.70")
MAX_DIMENSION_M = Decimal("100")
MAX_HEIGHT_M = Decimal("20")
_PLACES = 2


def _valid_dimension(value: Decimal | None) -> bool:
    return value is not None and Decimal(0) < value <= MAX_DIMENSION_M


def height_assumed(height_m: Decimal | None) -> bool:
    """True when `derive_measures` uses the default height instead of a given one."""
    return height_m is None or not (Decimal(0) < height_m <= MAX_HEIGHT_M)


def derive_measures(
    length_m: Decimal | None, width_m: Decimal | None, height_m: Decimal | None
) -> dict[str, Decimal]:
    """`mq`, `ml_perimetro` and `mq_pareti` of a rectangular room, or {} without both dimensions."""
    if length_m is None or width_m is None or not _valid_dimension(length_m) or not _valid_dimension(width_m):
        return {}
    height = DEFAULT_HEIGHT_M if height_m is None or height_assumed(height_m) else height_m
    perimeter = (length_m + width_m) * 2
    return {
        "mq": round_half_up(length_m * width_m, _PLACES),
        "ml_perimetro": round_half_up(perimeter, _PLACES),
        "mq_pareti": round_half_up(perimeter * height, _PLACES),
    }
