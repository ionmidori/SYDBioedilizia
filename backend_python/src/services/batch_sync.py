"""
Keeps `quote_batches` consistent with the decisions taken in the quote dossier.

A client can send several quotes in a batch; the admin decides each quote in
`/admin/quotes/{project_id}` (approve → send, or reject). The batch document
holds a per-project status and an overall status that the client dashboard
reads, so every decision made on a quote that belongs to a batch is mirrored
here.

The mirror never trusts the decision it was called for: inside the batch
transaction it reads the quote's CURRENT status and maps it. Two quick
actions on the same quote (approve then reopen, a retry) therefore end with
the batch matching the quote whatever order their syncs commit in.
"""
from __future__ import annotations

import logging
from typing import Any

from google.api_core.exceptions import GoogleAPIError
from google.cloud.firestore_v1 import async_transactional

from src.services.quote_drafts import quote_doc_ref
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)


def project_status_from(quote_status: str | None) -> str:
    """The per-project status stored in the batch for a quote status.

    `draft` means "not decided yet" (the batch route's own vocabulary).
    """
    if quote_status in ("approved", "sent"):
        return "approved"
    if quote_status == "rejected":
        return "rejected"
    return "draft"


def batch_status_from(projects: list[dict[str, Any]]) -> str:
    """Overall batch status from its projects (same rules as the batch decide route)."""
    statuses = {p.get("status") for p in projects}
    if statuses <= {"approved"}:
        return "approved"
    if statuses <= {"rejected"}:
        return "rejected"
    if "draft" not in statuses:
        return "partially_approved"
    return "submitted"


async def _transact(db: Any, body: Any) -> Any:
    @async_transactional
    async def _txn(transaction: Any) -> Any:
        return await body(transaction)

    return await _txn(db.transaction())


async def sync_project_decision(db: Any, project_id: str) -> bool:
    """Mirror the quote's current status on the batch it belongs to.

    True if a batch was updated. No-op for quotes outside a batch and for a
    batch that was never submitted.
    """
    quote_ref = quote_doc_ref(db, project_id)
    first_look = await quote_ref.get()
    batch_id = ((first_look.to_dict() or {}).get("request") or {}).get("batch_id") if first_look.exists else None
    if not batch_id:
        return False

    async def body(transaction: Any) -> bool:
        batch_ref = db.collection("quote_batches").document(batch_id)
        # Reads first (Firestore transactions cannot read after writing).
        batch_snap = await batch_ref.get(transaction=transaction)
        quote_snap = await quote_ref.get(transaction=transaction)
        data = (batch_snap.to_dict() or {}) if batch_snap.exists else {}
        if data.get("status") not in ("submitted", "partially_approved", "approved", "rejected"):
            return False
        projects = list(data.get("projects") or [])
        target = next((p for p in projects if p.get("project_id") == project_id), None)
        if target is None:
            return False
        target["status"] = project_status_from((quote_snap.to_dict() or {}).get("status") if quote_snap.exists else None)
        transaction.update(
            batch_ref,
            {"projects": projects, "status": batch_status_from(projects), "updated_at": utc_now()},
        )
        return True

    return bool(await _transact(db, body))


async def sync_project_decision_safely(db: Any, project_id: str) -> None:
    """For routes: the quote decision already committed, so a failure here is
    logged (and repaired by the next decision on the batch) rather than failing
    the request. `ValueError` is what `async_transactional` raises when it runs
    out of retries on contention."""
    try:
        await sync_project_decision(db, project_id)
    except (GoogleAPIError, OSError, RuntimeError, ValueError):
        logger.warning("[Batch] Could not mirror a quote decision on its batch.", exc_info=True)
