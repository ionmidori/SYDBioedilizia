"""
Direct submission of a project's quote to the team (Phase 138 PR-4).

One quote per project (sections per room), one submission: the chat tool
submit_quote_request and the dashboard "Invia al team" button both call
submit_project_quote. It replaces the quote batch, which was the only way to
reach the team.

In ONE Firestore transaction (transactional outbox, see email/outbox.py):
  draft ──submit──▶ pending_review   (quote_state.transition)
  + the outbox entry of the admin "new request" email.
If the transaction commits, the email will be sent; if not, nothing changed.

Idempotent: a quote already with the team (pending_review or later) is not
submitted twice and sends no second email; the same Idempotency-Key always
answers like the first request (the outbox entry id derives from it).
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from google.cloud.firestore_v1 import async_transactional

from src.core.config import settings
from src.core.exceptions import EmptyQuoteError, PermissionDenied, QuoteNotFoundError, ResourceNotFound
from src.db.firebase_client import get_async_firestore_client
from src.db.ownership import real_owners
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event
from src.services.email import get_email_provider, outbox
from src.services.email_templates import admin_new_requests_email, digest_from_quote
from src.services.quote_drafts import quote_doc_ref
from src.services.quote_state import QuoteEvent, QuoteStatus, transition
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

# The team already has the quote: submitting again changes nothing.
_WITH_THE_TEAM = frozenset({QuoteStatus.PENDING_REVIEW, QuoteStatus.IN_REVIEW, QuoteStatus.APPROVED, QuoteStatus.SENT})


@dataclass(frozen=True)
class SubmissionResult:
    project_id: str
    status: str
    quote_number: str | None
    # True when nothing was sent now: the quote was already with the team.
    duplicate: bool


def submission_id_for(project_id: str, idempotency_key: str) -> str:
    """Deterministic outbox id: the same Idempotency-Key never sends a second email."""
    return "submit_" + hashlib.sha256(f"{project_id}:{idempotency_key}".encode()).hexdigest()[:24]


async def _transact(db: Any, body: Any) -> Any:
    """Run `body(transaction)` in a Firestore transaction (retried on contention).
    Single seam for the in-memory fakes used by the unit tests."""

    @async_transactional
    async def _txn(transaction: Any) -> Any:
        return await body(transaction)

    return await _txn(db.transaction())


async def _verify_owner(db: Any, user_id: str, project_id: str) -> None:
    snap = await db.collection("projects").document(project_id).get()
    if not snap.exists:
        raise ResourceNotFound(message=f"Project '{project_id}' not found.", detail={"project_id": project_id})
    # Every owner field spelling (legacy `user_id`/`uid` too), like the GDPR erasure.
    if user_id not in real_owners(snap.to_dict() or {}):
        raise PermissionDenied(message="Access denied.")


async def _submit_tx(
    transaction: Any, db: Any, project_id: str, outbox_id: str | None, now: datetime
) -> tuple[SubmissionResult, str | None]:
    """draft → pending_review + admin email in the outbox. Returns the result
    and the outbox id to dispatch (None when nothing was queued)."""
    q_ref = quote_doc_ref(db, project_id)
    snap = await q_ref.get(transaction=transaction)
    quote = (snap.to_dict() or {}) if snap.exists else {}
    status = str(quote.get("status") or "")
    if not snap.exists or status == QuoteStatus.DELETED:
        raise QuoteNotFoundError(project_id)
    number = quote.get("quote_number")

    if outbox_id is not None:  # same Idempotency-Key: answer like the first request
        previous = await db.collection(outbox.OUTBOX).document(outbox_id).get(transaction=transaction)
        if previous.exists:
            return SubmissionResult(project_id, status, number, duplicate=True), None
    if status in _WITH_THE_TEAM:
        return SubmissionResult(project_id, status, number, duplicate=True), None
    if not quote.get("items"):
        raise EmptyQuoteError(project_id)

    new_status = transition(status, QuoteEvent.SUBMIT)  # 409 from rejected or a legacy status
    transaction.update(q_ref, {"status": new_status.value, "updated_at": now})

    if not settings.ADMIN_EMAIL:
        # The quote still reaches the admin inbox (pending_review), but nobody is emailed.
        logger.error("Admin notification skipped: ADMIN_EMAIL not configured.")
        return SubmissionResult(project_id, new_status.value, number, duplicate=False), None
    content = admin_new_requests_email(requests=[digest_from_quote(quote)], admin_url=settings.ADMIN_DASHBOARD_URL)
    out_ref = db.collection(outbox.OUTBOX).document(outbox_id) if outbox_id else db.collection(outbox.OUTBOX).document()
    transaction.set(
        out_ref,
        outbox.message_entry(
            kind="admin_notification", to=settings.ADMIN_EMAIL, subject=content.subject,
            text=content.text, html=content.html, now=now, project_id=project_id,
        ),
    )
    return SubmissionResult(project_id, new_status.value, number, duplicate=False), out_ref.id


_background_tasks: set[asyncio.Task[Any]] = set()


async def _dispatch(db: Any, outbox_id: str, now: datetime) -> None:
    """Safety task first (it recovers the email if this instance stops), then
    send in the background: the client does not wait for the provider."""
    await outbox.schedule_dispatch(outbox_id, now + outbox.SAFETY_DELAY, "safety")
    task = asyncio.create_task(outbox.dispatch_one(db, outbox_id, get_email_provider()))
    _background_tasks.add(task)  # keep a reference until done (asyncio holds only weak refs)
    task.add_done_callback(_background_tasks.discard)


async def submit_project_quote(
    user_id: str, project_id: str, *, idempotency_key: str | None = None, now: datetime | None = None
) -> SubmissionResult:
    """Send the project's quote draft to the team for review.

    Raises ResourceNotFound / PermissionDenied (project), QuoteNotFoundError,
    EmptyQuoteError, InvalidQuoteTransitionError (e.g. a rejected quote).
    """
    db = get_async_firestore_client()
    await _verify_owner(db, user_id, project_id)
    when = now or utc_now()
    outbox_id = submission_id_for(project_id, idempotency_key) if idempotency_key else None
    result, queued_id = await _transact(db, lambda tx: _submit_tx(tx, db, project_id, outbox_id, when))
    if result.duplicate:
        return result
    if queued_id:
        await _dispatch(db, queued_id, when)
    emit_audit_event(
        AuditAction.QUOTE_SUBMIT, AuditResourceType.QUOTE, project_id,
        user_id=user_id, metadata={"quote_number": result.quote_number},
    )
    # The quote number only: the project id is the chat session id (an access token).
    logger.info("Quote submitted to the team.", extra={"quote_number": result.quote_number})
    return result
