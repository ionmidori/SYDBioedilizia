"""
Transactional email outbox (Phase 128 — Fase 4).

Why: the old pipeline fired emails with `asyncio.create_task` after the HTTP
response. On Cloud Run the CPU can be throttled once the response is sent, so
an email could silently never leave, and nothing recorded whether it did.

How:
1. ENQUEUE — the intent to send is written in the SAME Firestore transaction
   as the business change (quote → `sent`, delivery record, outbox entry).
   If the transaction commits, the email will be sent; if not, nothing is.
2. DISPATCH — whoever runs it (the request right after the commit, or the
   sweeper) first takes a short LEASE on the outbox entry in a transaction,
   so two workers never send the same entry at the same time.
3. RETRY — transient failures go back to `pending` with exponential backoff;
   after EMAIL_MAX_ATTEMPTS (or a permanent provider error) the entry is
   dead-lettered and the delivery/quote show `failed` to the admin.
4. SCHEDULE — no recurring job: Cloud Tasks runs a dispatch only when there is
   something to send — one delayed safety check right after enqueue, one task
   at each retry time (`scheduling.py`). /internal/email/sweep remains for a
   manual recovery of anything left `pending`.
5. EVENTS — provider webhooks (Brevo) update the delivery: delivered,
   bounced, complained…, found through `email_messages/{hash(message id)}`.

Delivery is at-least-once: a crash after the provider accepted the email but
before the success commit can cause one duplicate on retry. Idempotency keys
prevent duplicates caused by the admin double-clicking "Invia".

Logs carry delivery ids and quote numbers only — never recipients or bodies.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from firebase_admin import storage
from google.cloud.firestore_v1 import FieldFilter, async_transactional

from src.core.config import settings
from src.core.exceptions import AppException, QuoteNotFoundError
from src.core.money import to_cents
from src.services.email.scheduling import schedule_dispatch
from src.services.email.types import (
    Attachment,
    DeliveryEvent,
    EmailProvider,
    OutboundEmail,
    ProviderError,
)
from src.services.email_templates import attachment_filename, client_quote_email
from src.services.pdf_service import resolve_validity
from src.services.quote_drafts import quote_doc_ref
from src.services.quote_state import QuoteEvent, QuoteStatus, transition
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

OUTBOX = "email_outbox"
MESSAGES = "email_messages"
DELIVERIES = "deliveries"
LEASE = timedelta(minutes=3)
# Safety task after enqueue: once the lease of an interrupted inline dispatch has expired.
SAFETY_DELAY = LEASE + timedelta(minutes=1)
_BACKOFF_BASE = timedelta(minutes=1)
_BACKOFF_MAX = timedelta(minutes=60)
UNSUBSCRIBE_MAILBOX = "privacy@sydbioedilizia.com"

# Delivery status precedence: a later event can only move the status forward
# (a "delivered" arriving after a "bounced" must not hide the bounce).
_RANK = {"queued": 0, "sent": 1, "delivered": 2, "bounced": 3, "complained": 3, "failed": 3}
_EVENT_TO_STATUS = {"delivered": "delivered", "bounced": "bounced", "complained": "complained", "failed": "failed"}


class PdfNotReadyError(AppException):
    status_code = 409
    error_code = "PDF_NOT_READY"

    def __init__(self) -> None:
        super().__init__(message="The PDF of the approved version is not ready. Regenerate it, then send.")


def delivery_id_for(project_id: str, idempotency_key: str) -> str:
    """Deterministic id: the same Idempotency-Key never creates a second send."""
    return hashlib.sha256(f"{project_id}:{idempotency_key}".encode()).hexdigest()[:24]


def message_index_id(provider: str, message_id: str) -> str:
    return hashlib.sha256(f"{provider}:{message_id.strip()}".encode()).hexdigest()[:40]


def delivery_ref(db: Any, project_id: str, delivery_id: str) -> Any:
    return quote_doc_ref(db, project_id).collection(DELIVERIES).document(delivery_id)


def backoff(attempts: int) -> timedelta:
    """1, 2, 4, 8… minutes, capped at an hour."""
    delay = _BACKOFF_BASE * (2 ** max(attempts - 1, 0))
    return min(delay, _BACKOFF_MAX)


async def _transact(db: Any, body: Any) -> Any:
    """Run `body(transaction)` in a Firestore transaction (retried on contention).
    Single seam for the in-memory fakes used by the unit tests."""

    @async_transactional
    async def _txn(transaction: Any) -> Any:
        return await body(transaction)

    return await _txn(db.transaction())


# ── Enqueue: quote delivery ───────────────────────────────────────────────────


@dataclass(frozen=True)
class EnqueueResult:
    delivery_id: str
    status: str
    quote_number: str | None
    duplicate: bool


async def enqueue_quote_delivery_tx(
    transaction: Any,
    db: Any,
    project_id: str,
    *,
    to: str,
    cc: list[str],
    subject: str | None,
    message: str | None,
    actor: str,
    idempotency_key: str,
    now: datetime,
) -> EnqueueResult:
    """approved → sent (or sent → sent for a resend) + delivery + outbox, atomically."""
    delivery_id = delivery_id_for(project_id, idempotency_key)
    q_ref = quote_doc_ref(db, project_id)
    d_ref = delivery_ref(db, project_id, delivery_id)
    snap = await q_ref.get(transaction=transaction)
    existing = await d_ref.get(transaction=transaction)
    quote = (snap.to_dict() or {}) if snap.exists else {}
    if not snap.exists or quote.get("status") == QuoteStatus.DELETED:
        raise QuoteNotFoundError(project_id)
    if existing.exists:  # same Idempotency-Key: answer with the first send
        return EnqueueResult(delivery_id, str(quote.get("status")), quote.get("quote_number"), duplicate=True)

    status = str(quote.get("status") or "")
    event = QuoteEvent.RESEND if status == QuoteStatus.SENT else QuoteEvent.SEND
    new_status = transition(status, event)

    pdf_blob_path = quote.get("pdf_blob_path")
    review = quote.get("review") or {}
    approved_revision = review.get("approved_revision")
    pdf_revision = quote.get("pdf_revision")
    if not pdf_blob_path or (
        approved_revision is not None and pdf_revision is not None and pdf_revision != approved_revision
    ):
        raise PdfNotReadyError()
    revision = int(approved_revision or pdf_revision or quote.get("version") or 1)

    transaction.set(
        d_ref,
        {
            "delivery_id": delivery_id,
            "to": to,
            "cc": cc,
            "subject": subject,
            "message": message,
            "revision": revision,
            "pdf_blob_path": pdf_blob_path,
            "status": "queued",
            "provider": settings.EMAIL_PROVIDER,
            "attempts": 0,
            "events": [],
            "created_by": actor,
            "created_at": now,
            "updated_at": now,
        },
    )
    transaction.set(
        db.collection(OUTBOX).document(delivery_id),
        {
            "kind": "quote_delivery",
            "project_id": project_id,
            "delivery_id": delivery_id,
            "status": "pending",
            "attempts": 0,
            "next_attempt_at": now,
            "created_at": now,
            "updated_at": now,
        },
    )
    transaction.update(
        q_ref,
        {
            "status": new_status.value,
            "delivery_status": "queued",
            "last_delivery_id": delivery_id,
            "updated_at": now,
        },
    )
    return EnqueueResult(delivery_id, new_status.value, quote.get("quote_number"), duplicate=False)


async def enqueue_quote_delivery(db: Any, project_id: str, **kwargs: Any) -> EnqueueResult:
    result = await _transact(db, lambda tx: enqueue_quote_delivery_tx(tx, db, project_id, **kwargs))
    if not result.duplicate:
        # One delayed safety check (no recurring job): a no-op if the inline
        # dispatch already sent it.
        await schedule_dispatch(result.delivery_id, kwargs["now"] + SAFETY_DELAY, "safety")
    return result


# ── Enqueue: a pre-rendered message (admin notifications) ─────────────────────


async def enqueue_message(
    db: Any, *, kind: str, to: str, subject: str, text: str, html: str | None, now: datetime | None = None
) -> str:
    """Store a fully rendered email in the outbox (single write → atomic)."""
    when = now or utc_now()
    ref = db.collection(OUTBOX).document()
    await ref.set(
        {
            "kind": kind,
            "status": "pending",
            "attempts": 0,
            "next_attempt_at": when,
            "created_at": when,
            "updated_at": when,
            "message": {"to": to, "subject": subject, "text": text, "html": html},
        }
    )
    await schedule_dispatch(ref.id, when + SAFETY_DELAY, "safety")
    return ref.id


# ── Dispatch ──────────────────────────────────────────────────────────────────


async def lease_tx(transaction: Any, db: Any, outbox_id: str, now: datetime) -> dict[str, Any] | None:
    """Claim the entry for LEASE; None if not due, already done, or held."""
    ref = db.collection(OUTBOX).document(outbox_id)
    snap = await ref.get(transaction=transaction)
    if not snap.exists:
        return None
    entry = snap.to_dict() or {}
    status = entry.get("status")
    if status == "pending":
        due = entry.get("next_attempt_at")
        if isinstance(due, datetime) and due > now:
            return None
    elif status == "leased":
        lease_until = entry.get("lease_until")
        if isinstance(lease_until, datetime) and lease_until > now:
            return None
    else:  # done / dead
        return None
    attempts = int(entry.get("attempts") or 0) + 1
    transaction.update(ref, {"status": "leased", "lease_until": now + LEASE, "attempts": attempts, "updated_at": now})
    return {**entry, "attempts": attempts, "id": outbox_id}


def _download_sync(blob_path: str) -> bytes:
    return storage.bucket().blob(blob_path).download_as_bytes()


async def build_quote_email(db: Any, entry: dict[str, Any]) -> tuple[OutboundEmail, dict[str, Any]]:
    """Render the client email for a quote delivery (attachment = the PDF)."""
    project_id = entry["project_id"]
    d_snap = await delivery_ref(db, project_id, entry["delivery_id"]).get()
    q_snap = await quote_doc_ref(db, project_id).get()
    if not d_snap.exists or not q_snap.exists:
        raise ProviderError("Delivery or quote missing.", permanent=True)
    delivery = d_snap.to_dict() or {}
    quote = q_snap.to_dict() or {}
    pdf = await asyncio.to_thread(_download_sync, delivery["pdf_blob_path"])
    snapshot = quote.get("client_snapshot") or {}
    content = client_quote_email(
        client_name=snapshot.get("display_name"),
        quote_number=quote.get("quote_number"),
        grand_total=to_cents((quote.get("financials") or {}).get("grand_total") or 0),
        valid_until=resolve_validity(quote)[2],
        revision=int(delivery.get("revision") or 1),
        has_attachment=True,
        admin_message=delivery.get("message"),
    )
    email = OutboundEmail(
        to=delivery["to"],
        cc=tuple(delivery.get("cc") or ()),
        subject=delivery.get("subject") or content.subject,
        text=content.text,
        html=content.html,
        attachments=(Attachment(attachment_filename(quote.get("quote_number")), pdf),),
        list_unsubscribe=UNSUBSCRIBE_MAILBOX,
        reference=entry["delivery_id"],
        tags=("quote",),
    )
    return email, quote


def _message_email(entry: dict[str, Any]) -> OutboundEmail:
    msg = entry.get("message") or {}
    return OutboundEmail(
        to=str(msg.get("to") or ""),
        subject=str(msg.get("subject") or ""),
        text=str(msg.get("text") or ""),
        html=msg.get("html"),
        reference=str(entry.get("id")),
        tags=(str(entry.get("kind") or "notification"),),
    )


async def _record_success(db: Any, entry: dict[str, Any], provider: str, message_id: str, now: datetime) -> None:
    async def _txn(transaction: Any) -> None:
        out_ref = db.collection(OUTBOX).document(entry["id"])
        updates: list[tuple[Any, dict[str, Any]]] = []
        if entry.get("kind") == "quote_delivery":
            q_ref = quote_doc_ref(db, entry["project_id"])
            q_snap = await q_ref.get(transaction=transaction)
            d_ref = delivery_ref(db, entry["project_id"], entry["delivery_id"])
            updates.append((d_ref, {"status": "sent", "provider": provider, "provider_message_id": message_id,
                                    "attempts": entry["attempts"], "sent_at": now, "updated_at": now,
                                    "last_error": None}))
            if q_snap.exists and (q_snap.to_dict() or {}).get("last_delivery_id") == entry["delivery_id"]:
                updates.append((q_ref, {"delivery_status": "sent", "sent_at": now}))
            transaction.set(
                db.collection(MESSAGES).document(message_index_id(provider, message_id)),
                {"provider": provider, "project_id": entry["project_id"], "delivery_id": entry["delivery_id"],
                 "created_at": now},
            )
        for ref, data in updates:
            transaction.update(ref, data)
        transaction.update(out_ref, {"status": "done", "done_at": now, "updated_at": now, "lease_until": None,
                                     "provider_message_id": message_id, "last_error": None})

    await _transact(db, _txn)


async def _record_failure(db: Any, entry: dict[str, Any], error: ProviderError, now: datetime) -> str:
    dead = error.permanent or entry["attempts"] >= settings.EMAIL_MAX_ATTEMPTS
    code = str(error.status_code) if error.status_code else error.extra.get("type", type(error).__name__)
    error_type = f"{'permanent' if error.permanent else 'transient'}:{code}"

    async def _txn(transaction: Any) -> None:
        out_ref = db.collection(OUTBOX).document(entry["id"])
        quote_update: tuple[Any, dict[str, Any]] | None = None
        if entry.get("kind") == "quote_delivery":
            q_ref = quote_doc_ref(db, entry["project_id"])
            q_snap = await q_ref.get(transaction=transaction)
            if dead and q_snap.exists and (q_snap.to_dict() or {}).get("last_delivery_id") == entry["delivery_id"]:
                quote_update = (q_ref, {"delivery_status": "failed"})
            transaction.update(
                delivery_ref(db, entry["project_id"], entry["delivery_id"]),
                {"status": "failed" if dead else "queued", "attempts": entry["attempts"],
                 "last_error": error_type, "updated_at": now},
            )
        if quote_update:
            transaction.update(*quote_update)
        transaction.update(
            out_ref,
            {"status": "dead" if dead else "pending", "lease_until": None, "last_error": error_type,
             "next_attempt_at": now + backoff(entry["attempts"]), "updated_at": now},
        )

    await _transact(db, _txn)
    if dead:
        # Alert signal (#478): deploy/observability/email_dead_letter.yaml counts these and
        # its alert pages the admin through Cloud Monitoring, independent of the failing provider.
        # No recipient address here: ids and the error class are enough to triage.
        logger.error("[Email/Outbox] Dead-letter: delivery abandoned.", extra={
            "event": "email_dead_letter", "outbox_id": entry["id"], "kind": entry.get("kind"),
            "project_id": entry.get("project_id"), "attempts": entry["attempts"], "last_error": error_type,
        })
    else:
        # Event-driven retry: one task at the retry time, none otherwise.
        await schedule_dispatch(entry["id"], now + backoff(entry["attempts"]), f"a{entry['attempts'] + 1}")
    return "dead" if dead else "retry"


async def dispatch_one(db: Any, outbox_id: str, provider: EmailProvider, now: datetime | None = None) -> str:
    """Lease → render → send → record. Returns sent | retry | dead | skipped.

    `now` pins the clock (tests, sweeps); otherwise each step reads the real
    time, so the backoff starts when the attempt actually ended."""
    when = now or utc_now()

    def finished() -> datetime:
        return when if now is not None else utc_now()

    entry = await _transact(db, lambda tx: lease_tx(tx, db, outbox_id, when))
    if entry is None:
        return "skipped"
    try:
        if entry.get("kind") == "quote_delivery":
            email, _quote = await build_quote_email(db, entry)
        else:
            email = _message_email(entry)
        result = await provider.send(email)
    except ProviderError as exc:
        outcome = await _record_failure(db, entry, exc, finished())
        logger.warning("[Email/Outbox] Send failed.", extra={"outbox_id": outbox_id, "outcome": outcome,
                                                               "attempts": entry["attempts"]})
        return outcome
    except Exception as exc:  # noqa: BLE001 — render/storage errors are retried like transient ones
        wrapped = ProviderError("Dispatch error.", extra={"type": type(exc).__name__})
        outcome = await _record_failure(db, entry, wrapped, finished())
        logger.warning("[Email/Outbox] Dispatch error.", extra={"outbox_id": outbox_id, "outcome": outcome,
                                                                 "error_type": type(exc).__name__})
        return outcome
    await _record_success(db, entry, result.provider, result.message_id, finished())
    logger.info("[Email/Outbox] Sent.", extra={"outbox_id": outbox_id, "kind": entry.get("kind")})
    return "sent"


async def sweep(db: Any, provider: EmailProvider, now: datetime | None = None, limit: int = 25) -> dict[str, int]:
    """Re-dispatch due pending entries and expired leases (Cloud Scheduler)."""
    when = now or utc_now()
    outbox = db.collection(OUTBOX)
    due = outbox.where(filter=FieldFilter("status", "==", "pending")).where(
        filter=FieldFilter("next_attempt_at", "<=", when)
    ).limit(limit)
    stale = outbox.where(filter=FieldFilter("status", "==", "leased")).where(
        filter=FieldFilter("lease_until", "<=", when)
    ).limit(limit)
    ids = [doc.id async for doc in due.stream()] + [doc.id async for doc in stale.stream()]
    counts: dict[str, int] = {"sent": 0, "retry": 0, "dead": 0, "skipped": 0}
    for outbox_id in dict.fromkeys(ids):
        outcome = await dispatch_one(db, outbox_id, provider, when)
        counts[outcome] = counts.get(outcome, 0) + 1
    return counts


# ── Provider events (webhooks) ────────────────────────────────────────────────


async def apply_event_tx(transaction: Any, db: Any, event: DeliveryEvent, now: datetime) -> bool:
    """Record one provider event on its delivery. Idempotent per (event, time)."""
    index = await db.collection(MESSAGES).document(message_index_id(event.provider, event.message_id)).get(
        transaction=transaction
    )
    if not index.exists:
        return False
    info = index.to_dict() or {}
    d_ref = delivery_ref(db, info["project_id"], info["delivery_id"])
    q_ref = quote_doc_ref(db, info["project_id"])
    d_snap = await d_ref.get(transaction=transaction)
    q_snap = await q_ref.get(transaction=transaction)
    if not d_snap.exists:
        return False
    delivery = d_snap.to_dict() or {}
    events = list(delivery.get("events") or [])
    key = (event.raw_event or event.event, event.occurred_at.isoformat())
    if any((e.get("event"), _iso(e.get("at"))) == key for e in events):
        return False  # webhook retried: already recorded
    events.append({"event": event.raw_event or event.event, "at": event.occurred_at, "detail": event.detail or None})
    updates: dict[str, Any] = {"events": events[-50:], "updated_at": now}
    new_status = _EVENT_TO_STATUS.get(event.event)
    current = str(delivery.get("status") or "queued")
    if new_status and _RANK[new_status] > _RANK.get(current, 0):
        updates["status"] = new_status
    transaction.update(d_ref, updates)
    if "status" in updates and q_snap.exists and (q_snap.to_dict() or {}).get("last_delivery_id") == info["delivery_id"]:
        transaction.update(q_ref, {"delivery_status": updates["status"]})
    return True


def _iso(value: Any) -> str | None:
    return value.isoformat() if isinstance(value, datetime) else None


async def apply_events(db: Any, events: list[DeliveryEvent]) -> int:
    applied = 0
    for event in events:
        if await _transact(db, lambda tx, event=event: apply_event_tx(tx, db, event, utc_now())):
            applied += 1
    return applied


def assert_sendable(quote: dict[str, Any]) -> None:
    """Pre-check used by send-defaults (the transaction re-checks everything):
    raises InvalidQuoteTransitionError if the quote cannot be sent now."""
    status = str(quote.get("status") or "")
    transition(status, QuoteEvent.RESEND if status == QuoteStatus.SENT else QuoteEvent.SEND)
