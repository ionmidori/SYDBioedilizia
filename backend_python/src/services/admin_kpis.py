"""
Dashboard numbers for the admin console (Phase 128, Fase 6.1b).

Queries reuse the shapes the inbox already needs, so they are served by the
existing collection-group indexes (doc_type, status, updated_at):

* counts per status — `count()` aggregations (no documents are read);
* open quotes — read once for the pending value (the quotes still to work on);
* approvals of the last 8 weeks — Monday-anchored buckets and the latest six.

Volumes are small (a handful of quotes a week); every list is capped and the
cap is reported (`pending_truncated`) rather than silently hidden.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from google.cloud.firestore_v1 import Query
from google.cloud.firestore_v1.base_query import FieldFilter

from src.schemas.admin_content import AdminKpis, RecentApproval, TestimonialStats, WeeklyApprovals

STATUSES = ("draft", "pending_review", "in_review", "approved", "sent", "rejected")
OPEN_STATUSES = ["pending_review", "in_review"]
DECIDED_STATUSES = ["approved", "sent"]
WEEKS = 8
OPEN_CAP = 500
APPROVALS_CAP = 500
RECENT = 6


def _quotes(db: Any) -> Any:
    return db.collection_group("private_data").where(filter=FieldFilter("doc_type", "==", "quote"))


async def _count_status(db: Any, status: str) -> int:
    # order_by keeps the query on the (doc_type, status, updated_at) index.
    query = (
        _quotes(db)
        .where(filter=FieldFilter("status", "==", status))
        .order_by("updated_at", direction=Query.DESCENDING)
    )
    result = await query.count(alias="n").get()
    return int(result[0][0].value)


async def testimonial_stats(db: Any) -> TestimonialStats:
    async def count(status: str) -> int:
        result = await db.collection("testimonials").where(filter=FieldFilter("status", "==", status)).count(
            alias="n"
        ).get()
        return int(result[0][0].value)

    pending, approved, rejected = await asyncio.gather(count("pending"), count("approved"), count("rejected"))
    return TestimonialStats(pending=pending, approved=approved, rejected=rejected)


def _aware(value: Any) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _last_sunday(year: int, month: int) -> date:
    last = date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)
    return last - timedelta(days=(last.weekday() + 1) % 7)


def rome_offset(moment: datetime) -> timedelta:
    """UTC offset of Italy at `moment`: CEST (+2h) from the last Sunday of March
    01:00 UTC to the last Sunday of October 01:00 UTC, else CET (+1h).
    (No tz database needed: it is not installed on every platform we run on.)"""
    utc = moment.astimezone(UTC)
    start = datetime.combine(_last_sunday(utc.year, 3), time(1), tzinfo=UTC)
    end = datetime.combine(_last_sunday(utc.year, 10), time(1), tzinfo=UTC)
    return timedelta(hours=2) if start <= utc < end else timedelta(hours=1)


def week_start(moment: datetime) -> date:
    """Monday (Italian calendar) of the week containing `moment`: the admins think
    in local time, so an approval on Monday 00:30 Rome time belongs to the new
    week even though it is still Sunday in UTC."""
    local = (moment.astimezone(UTC) + rome_offset(moment)).date()
    return local - timedelta(days=local.weekday())


def week_start_instant(day: date) -> datetime:
    """The instant (UTC) at which the Italian week starting on `day` begins."""
    midnight_utc = datetime.combine(day, time.min, tzinfo=UTC)
    return midnight_utc - rome_offset(midnight_utc + timedelta(hours=12))


def approval_time(quote: dict[str, Any]) -> datetime | None:
    """When the quote was approved (falls back to its last update)."""
    return _aware((quote.get("review") or {}).get("approved_at")) or _aware(quote.get("updated_at"))


def weekly_buckets(approvals: list[datetime], now: datetime) -> list[WeeklyApprovals]:
    current = week_start(now)
    starts = [current - timedelta(weeks=w) for w in range(WEEKS - 1, -1, -1)]
    counts = dict.fromkeys(starts, 0)
    for moment in approvals:
        start = week_start(moment)
        if start in counts:
            counts[start] += 1
    return [WeeklyApprovals(week_start=s.isoformat(), approvals=n) for s, n in counts.items()]


async def compute_kpis(db: Any, now: datetime) -> AdminKpis:
    cutoff = week_start_instant(week_start(now) - timedelta(weeks=WEEKS - 1))
    open_query = (
        _quotes(db)
        .where(filter=FieldFilter("status", "in", OPEN_STATUSES))
        .order_by("updated_at", direction=Query.DESCENDING)
        .limit(OPEN_CAP + 1)
    )
    decided_query = (
        _quotes(db)
        .where(filter=FieldFilter("status", "in", DECIDED_STATUSES))
        .where(filter=FieldFilter("updated_at", ">=", cutoff))
        .order_by("updated_at", direction=Query.DESCENDING)
        .limit(APPROVALS_CAP)
    )

    async def read(query: Any) -> list[Any]:
        return [doc async for doc in query.stream()]

    counts, open_docs, decided_docs, testimonials = await asyncio.gather(
        asyncio.gather(*(_count_status(db, s) for s in STATUSES)),
        read(open_query),
        read(decided_query),
        testimonial_stats(db),
    )

    truncated = len(open_docs) > OPEN_CAP
    pending_value = sum(
        float(((doc.to_dict() or {}).get("financials") or {}).get("grand_total", 0.0)) for doc in open_docs[:OPEN_CAP]
    )

    decided = [(doc, doc.to_dict() or {}) for doc in decided_docs]
    times = [t for _, quote in decided if (t := approval_time(quote)) is not None]
    latest = sorted(
        ((approval_time(quote), doc, quote) for doc, quote in decided),
        key=lambda row: row[0] or datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )[:RECENT]
    recent = [
        RecentApproval(
            project_id=doc.reference.parent.parent.id,
            quote_number=quote.get("quote_number"),
            client_display_name=(quote.get("client_snapshot") or {}).get("display_name"),
            grand_total=float((quote.get("financials") or {}).get("grand_total", 0.0)),
            approved_at=when,
        )
        for when, doc, quote in latest
    ]

    return AdminKpis(
        by_status=dict(zip(STATUSES, counts, strict=True)),
        pending_value=round(pending_value, 2),
        pending_truncated=truncated,
        weekly_approvals=weekly_buckets(times, now),
        recent_approvals=recent,
        testimonials=testimonials,
        generated_at=now,
    )
