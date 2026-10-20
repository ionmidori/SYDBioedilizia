"""Legal hold of quotes that reached the client.

Decision of the owner (16 Oct 2026, to be validated with counsel): a quote that
was actually delivered to the client is commercial correspondence and is kept
INTACT for 10 years from the last send — not anonymised, which would strip it
of any evidential value — while every other datum of the user is erased. Held
data is reachable only by the backend/admin (no Firestore rule exposes
`private_data` to clients).

Every hold is also recorded in `legal_holds/{pid}:{quote_id}` (written in the
same batch as the marker on the quote): the index of what is kept and until
when. Once `retain_until` has passed, the retention job (src/services/retention)
lists the expired records and releases them — quote, history, PDFs, record.
A registry instead of a collection-group query on `private_data`: such a query
needs an index exemption deployed by hand, and the record survives the
`projects/{pid}` parent, which is gone by then.

"Sent" means the email provider accepted it, not that it was queued:
`status == "sent"` is set when the email is queued and is reset when a sent
quote is revised, so the deliveries are the authoritative record.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter

from src.db.purge import delete_document_tree, delete_storage_paths

SENT_QUOTE_RETENTION = timedelta(days=3653)  # 10 years
LEGAL_HOLD_REASON = "preventivo_inviato"
HOLDS_COLLECTION = "legal_holds"

# delivery_status values meaning the provider accepted the email.
_PROVIDER_ACCEPTED = frozenset({"sent", "delivered", "bounced", "complained"})


@dataclass(frozen=True)
class HeldQuote:
    doc_id: str                    # projects/{pid}/private_data/{doc_id}
    retain_until: datetime
    blob_paths: frozenset[str]     # PDFs actually sent (kept in Storage too)
    held_since: datetime | None = None  # start of an existing hold, kept when marking again


@dataclass(frozen=True)
class HoldRecord:
    """An entry of the `legal_holds` registry."""

    project_id: str
    quote_id: str
    retain_until: datetime
    blob_paths: tuple[str, ...]


def _hold_id(project_id: str, quote_id: str) -> str:
    # ":" never occurs in either id (storage_paths.is_safe_id), so ids cannot collide.
    return f"{project_id}:{quote_id}"


def _send_times(quote: dict[str, Any], deliveries: Iterable[dict[str, Any]]) -> list[datetime]:
    candidates = [quote.get("sent_at"), quote.get("delivered_at"), *(d.get("sent_at") for d in deliveries)]
    return [t for t in candidates if isinstance(t, datetime)]


def is_sent(quote: dict[str, Any], deliveries: Iterable[dict[str, Any]]) -> bool:
    """Whether the quote ever left the email provider towards the client."""
    deliveries = list(deliveries)
    return bool(_send_times(quote, deliveries)) or quote.get("delivery_status") in _PROVIDER_ACCEPTED


async def find_held_quotes(db: Any, project_id: str, *, now: datetime) -> list[HeldQuote]:
    """The quote documents of a project that must survive an erasure."""
    held: list[HeldQuote] = []
    private = db.collection("projects").document(project_id).collection("private_data")
    async for snap in private.stream():
        quote = snap.to_dict() or {}
        deliveries = [d.to_dict() or {} async for d in snap.reference.collection("deliveries").stream()]
        if not is_sent(quote, deliveries):
            continue
        times = _send_times(quote, deliveries)
        blobs = {p for p in (quote.get("pdf_blob_path"), *(d.get("pdf_blob_path") for d in deliveries)) if p}
        existing = quote.get("legal_hold")
        held.append(HeldQuote(
            doc_id=snap.id,
            retain_until=(max(times) if times else now) + SENT_QUOTE_RETENTION,
            blob_paths=frozenset(blobs),
            held_since=existing.get("since") if isinstance(existing, dict) else None,
        ))
    return held


async def mark_legal_hold(db: Any, project_id: str, held: HeldQuote, *, now: datetime) -> None:
    """Mark the quote as held and register the hold, in one batch. Idempotent:
    marking again keeps the original start."""
    since = held.held_since or now
    marker = {"reason": LEGAL_HOLD_REASON, "since": since, "retain_until": held.retain_until}
    quote_ref = db.collection("projects").document(project_id).collection("private_data").document(held.doc_id)
    batch = db.batch()
    batch.update(quote_ref, {"legal_hold": marker})
    batch.set(db.collection(HOLDS_COLLECTION).document(_hold_id(project_id, held.doc_id)), {
        "project_id": project_id,
        "quote_id": held.doc_id,
        **marker,
        "blob_paths": sorted(held.blob_paths),
    })
    await batch.commit()


async def held_project_ids(db: Any) -> set[str]:
    """Projects that still have a quote under legal hold."""
    query = db.collection(HOLDS_COLLECTION).select(["project_id"])
    ids: set[str] = set()
    async for snap in query.stream():
        project_id = (snap.to_dict() or {}).get("project_id")
        if isinstance(project_id, str):
            ids.add(project_id)
    return ids


async def expired_holds(db: Any, *, now: datetime, limit: int) -> list[HoldRecord]:
    """Registered holds whose retention has ended, oldest first."""
    query = (
        db.collection(HOLDS_COLLECTION)
        .where(filter=FieldFilter("retain_until", "<=", now))
        .order_by("retain_until")
        .limit(limit)
    )
    records: list[HoldRecord] = []
    async for snap in query.stream():
        data = snap.to_dict() or {}
        records.append(HoldRecord(
            project_id=data["project_id"],
            quote_id=data["quote_id"],
            retain_until=data["retain_until"],
            blob_paths=tuple(data.get("blob_paths") or ()),
        ))
    return records


async def release_hold(db: Any, bucket: Any, hold: HoldRecord) -> int:
    """Erase a quote whose hold has ended: PDFs, the quote with its revisions
    and deliveries, and — last, so an interrupted release is found again —
    the registry record. Idempotent. Returns the documents deleted."""
    await delete_storage_paths(bucket, hold.blob_paths)
    quote_ref = db.collection("projects").document(hold.project_id).collection("private_data").document(hold.quote_id)
    deleted = await delete_document_tree(db, quote_ref)
    await db.collection(HOLDS_COLLECTION).document(_hold_id(hold.project_id, hold.quote_id)).delete()
    return deleted
