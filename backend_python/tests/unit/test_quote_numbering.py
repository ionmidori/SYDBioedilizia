"""Human-readable quote numbers PRV-YYYY-NNNN (Phase 128)."""
from datetime import UTC, datetime, timedelta, timezone

import pytest
from src.services.quote_numbering import (
    QuoteNumber,
    allocate_quote_number,
    counter_doc_id,
    format_quote_number,
    parse_quote_number,
    quote_year,
)
from tests.unit.firestore_fakes import FakeDb, FakeTransaction


def test_format_is_fixed_width_and_sortable():
    assert format_quote_number(2026, 42) == "PRV-2026-0042"
    assert format_quote_number(2026, 1) == "PRV-2026-0001"
    assert format_quote_number(2026, 12345) == "PRV-2026-12345"  # grows, never truncates
    assert sorted(format_quote_number(2026, n) for n in (10, 9, 100)) == [
        "PRV-2026-0009",
        "PRV-2026-0010",
        "PRV-2026-0100",
    ]


def test_sequence_starts_at_one():
    with pytest.raises(ValueError):
        format_quote_number(2026, 0)


@pytest.mark.parametrize(
    "value,expected",
    [
        ("PRV-2026-0042", QuoteNumber(2026, 42)),
        (" prv-2026-0042 ", QuoteNumber(2026, 42)),
        ("PRV-2027-12345", QuoteNumber(2027, 12345)),
        ("PRV-2026-42", None),
        ("PRV-26-0042", None),
        ("XYZ-2026-0042", None),
        ("PRV-2026-0042-ROSSI", None),
    ],
)
def test_parse(value, expected):
    assert parse_quote_number(value) == expected


def test_roundtrip():
    assert parse_quote_number(QuoteNumber(2026, 7).formatted) == QuoteNumber(2026, 7)


@pytest.mark.parametrize(
    "utc_instant,year",
    [
        (datetime(2026, 12, 31, 22, 59, tzinfo=UTC), 2026),  # 23:59 in Rome
        (datetime(2026, 12, 31, 23, 0, tzinfo=UTC), 2027),  # 00:00 in Rome
        (datetime(2027, 1, 1, 0, 30, tzinfo=UTC), 2027),
        (datetime(2026, 7, 1, 12, 0, tzinfo=UTC), 2026),
        # Same instant expressed in another offset → same year.
        (datetime(2027, 1, 1, 1, 0, tzinfo=timezone(timedelta(hours=2))), 2027),
    ],
)
def test_year_follows_the_italian_calendar(utc_instant, year):
    assert quote_year(utc_instant) == year


def test_naive_datetime_is_refused():
    with pytest.raises(ValueError):
        quote_year(datetime(2026, 1, 1))  # noqa: DTZ001 — deliberately naive


async def test_allocation_starts_at_one_and_increments():
    db = FakeDb()
    now = datetime(2026, 3, 1, tzinfo=UTC)
    first = await allocate_quote_number(FakeTransaction(db), db, now)
    second = await allocate_quote_number(FakeTransaction(db), db, now)
    assert (first.formatted, second.formatted) == ("PRV-2026-0001", "PRV-2026-0002")
    assert db.get_data("counters", counter_doc_id(2026))["next"] == 3


async def test_counter_restarts_every_year():
    db = FakeDb()
    db.put("counters", "quote_2026", {"next": 57})
    last_2026 = await allocate_quote_number(FakeTransaction(db), db, datetime(2026, 12, 31, 12, tzinfo=UTC))
    first_2027 = await allocate_quote_number(FakeTransaction(db), db, datetime(2027, 1, 2, tzinfo=UTC))
    assert last_2026.formatted == "PRV-2026-0057"
    assert first_2027.formatted == "PRV-2027-0001"


async def test_allocation_reads_through_the_transaction():
    db = FakeDb()
    tx = FakeTransaction(db)
    await allocate_quote_number(tx, db, datetime(2026, 5, 5, tzinfo=UTC))
    assert tx.reads == [("counters", "quote_2026")]
    assert [w[0] for w in tx.writes] == ["set"]
