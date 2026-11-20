"""Measures the code derives from a room's dimensions (Phase 140): floor, perimeter, gross walls."""
from decimal import Decimal

import pytest
from src.services.room_geometry import DEFAULT_HEIGHT_M, derive_measures, height_assumed


def test_four_by_five_gives_floor_perimeter_and_walls_at_the_default_height() -> None:
    assert derive_measures(Decimal("4"), Decimal("5"), None) == {
        "mq": Decimal("20"), "ml_perimetro": Decimal("18"), "mq_pareti": Decimal("48.60"),
    }


def test_the_height_of_the_room_wins_over_the_default() -> None:
    measures = derive_measures(Decimal("4"), Decimal("5"), Decimal("3"))
    assert measures["mq_pareti"] == Decimal("54")


def test_default_height_is_two_seventy() -> None:
    assert DEFAULT_HEIGHT_M == Decimal("2.70")


@pytest.mark.parametrize(("length", "width"), [
    (None, Decimal("5")), (Decimal("4"), None), (None, None),
    (Decimal("0"), Decimal("5")), (Decimal("-4"), Decimal("5")), (Decimal("4"), Decimal("200")),
    (Decimal("100.01"), Decimal("5")),
])
def test_missing_or_invalid_dimensions_derive_nothing(length: Decimal | None, width: Decimal | None) -> None:
    assert derive_measures(length, width, None) == {}


@pytest.mark.parametrize("height", [Decimal("0"), Decimal("-2"), Decimal("21")])
def test_an_invalid_height_falls_back_to_the_default(height: Decimal) -> None:
    assert derive_measures(Decimal("4"), Decimal("5"), height)["mq_pareti"] == Decimal("48.60")


def test_the_limit_of_one_hundred_metres_is_valid() -> None:
    assert derive_measures(Decimal("100"), Decimal("1"), None)["mq"] == Decimal("100")


def test_height_assumed_when_none_or_invalid() -> None:
    assert height_assumed(None) is True
    assert height_assumed(Decimal("0")) is True
    assert height_assumed(Decimal("2.5")) is False
