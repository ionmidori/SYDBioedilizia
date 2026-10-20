"""Legal hold of quotes that reached the client.

Decision of the owner (16 Oct 2026, to be validated with counsel): a quote that
was actually delivered to the client is commercial correspondence and is kept
INTACT for 10 years from the last send — not anonymised, which would strip it
of any evidential value — while every other datum of the user is erased. Held
data is reachable only by the backend/admin (no Firestore rule exposes
`private_data` to clients).

`legal_hold.retain_until` is the end of the retention: the purge that deletes
held quotes once it has passed is NOT part of this module — it belongs to the
retention job (follow-up work), which finds them with a collection-group query
on `legal_hold.retain_until` (their `projects/{pid}` parent is already gone).

"Sent" means the email provider accepted it, not that it was queued:
`status == "sent"` is set when the email is queued and is reset when a sent
quote is revised, so the deliveries are the authoritative record.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

SENT_QUOTE_RETENTION = timedelta(days=3653)  # 10 years
LEGAL_HOLD_REASON = "preventivo_inviato"

# delivery_status values meaning the provider accepted the email.
_PROVIDER_ACCEPTED = frozenset({"sent", "delivered", "bounced", "complained"})


@dataclass(frozen=True)
class HeldQuote:
    doc_id: str                    # projects/{pid}/private_data/{doc_id}
    retain_until: datetime
    blob_paths: frozenset[str]     # PDFs actually sent (kept in Storage too)


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
        held.append(HeldQuote(
            doc_id=snap.id,
            retain_until=(max(times) if times else now) + SENT_QUOTE_RETENTION,
            blob_paths=frozenset(blobs),
        ))
    return held


async def mark_legal_hold(db: Any, project_id: str, held: HeldQuote, *, now: datetime) -> None:
    """Record why and until when the quote is kept (read by the retention job)."""
    ref = db.collection("projects").document(project_id).collection("private_data").document(held.doc_id)
    await ref.update({
        "legal_hold": {"reason": LEGAL_HOLD_REASON, "since": now, "retain_until": held.retain_until}
    })
