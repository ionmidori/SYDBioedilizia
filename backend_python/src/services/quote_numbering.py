"""
Human-readable quote numbers: `PRV-2026-0042` (Phase 128).

The Firestore document IDs stay opaque UUIDs (keys, URLs, Storage paths); the
quote number is the reference people read on the phone and see in emails and
PDFs. It never contains personal data — the client name is shown next to it.

Counter: one document per year, `counters/quote_{YYYY}` = `{next: int}`, read
and incremented inside the same Firestore transaction that creates the quote,
so concurrent creations get distinct numbers. One sustained write per second
per document is far above the quote volume. Numbers can have gaps (a created
quote later deleted keeps its number): a preventivo is not a fiscal document,
so a gap-free sequence is not required. If quotes ever become fiscal
documents, invoices need their own gap-free series assigned at issue time.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

QUOTE_NUMBER_PREFIX = "PRV"
COUNTERS_COLLECTION = "counters"
_SEQ_WIDTH = 4
_QUOTE_NUMBER_RE = re.compile(rf"^{QUOTE_NUMBER_PREFIX}-(\d{{4}})-(\d{{{_SEQ_WIDTH},}})$")

# Europe/Rome is UTC+1 (CET) around every New Year — daylight saving time is
# never in effect in late December / early January — so the Italian calendar
# year is exactly the year of UTC+1. This avoids depending on a tz database
# (absent on Windows without the `tzdata` package).
_ROME_WINTER_OFFSET = timedelta(hours=1)


@dataclass(frozen=True)
class QuoteNumber:
    year: int
    seq: int

    @property
    def formatted(self) -> str:
        return format_quote_number(self.year, self.seq)


def quote_year(now: datetime) -> int:
    """Italian calendar year of an aware UTC instant."""
    if now.tzinfo is None:
        raise ValueError("quote_year requires a timezone-aware datetime")
    return (now.astimezone(UTC) + _ROME_WINTER_OFFSET).year


def format_quote_number(year: int, seq: int) -> str:
    if seq < 1:
        raise ValueError("quote sequence starts at 1")
    return f"{QUOTE_NUMBER_PREFIX}-{year:04d}-{seq:0{_SEQ_WIDTH}d}"


def parse_quote_number(value: str) -> QuoteNumber | None:
    match = _QUOTE_NUMBER_RE.match(value.strip().upper())
    if match is None:
        return None
    return QuoteNumber(year=int(match.group(1)), seq=int(match.group(2)))


def counter_doc_id(year: int) -> str:
    return f"quote_{year:04d}"


async def allocate_quote_number(transaction: Any, db: Any, now: datetime) -> QuoteNumber:
    """Reserve the next number for `now`'s year inside `transaction`.

    Must be called after every other read of the transaction (Firestore
    requires all reads before the first write) and only when the caller is
    about to create the quote in the same transaction.
    """
    year = quote_year(now)
    ref = db.collection(COUNTERS_COLLECTION).document(counter_doc_id(year))
    snap = await ref.get(transaction=transaction)
    data: dict[str, Any] = (snap.to_dict() or {}) if snap.exists else {}
    seq = int(data.get("next", 1))
    if seq < 1:
        seq = 1
    transaction.set(ref, {"next": seq + 1, "year": year, "updated_at": now})
    return QuoteNumber(year=year, seq=seq)
