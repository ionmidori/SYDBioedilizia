"""
Keeps `quote_batches` consistent with the decisions taken in the quote dossier.

A client sends one or more quotes in a batch; the admin decides each quote in
`/admin/quotes/{project_id}` (approve → send, or reject). The batch document
holds a per-project status and an overall status that the client dashboard
reads, so every decision made on a quote that belongs to a batch is mirrored
here — in a transaction, so concurrent decisions on two projects of the same
batch cannot overwrite each other.
"""
from __future__ import annotations

import logging
from typing import Any, Literal

from google.api_core.exceptions import GoogleAPIError
from google.cloud.firestore_v1 import async_transactional

from src.services.quote_drafts import quote_doc_ref
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

ProjectDecision = Literal["approved", "rejected", "draft"]


def batch_status_from(projects: list[dict[str, Any]]) -> str:
    """Overall batch status from its projects (same rules as the batch decide route).

    `draft` means "not decided yet".
    """
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


async def sync_project_decision(
    db: Any, project_id: str, decision: ProjectDecision, notes: str | None = None
) -> bool:
    """Mirror a decision on the batch the quote belongs to. True if a batch was updated.

    No-op for quotes outside a batch or for a batch that was never submitted.
    """
    quote_snap = await quote_doc_ref(db, project_id).get()
    batch_id = ((quote_snap.to_dict() or {}).get("request") or {}).get("batch_id") if quote_snap.exists else None
    if not batch_id:
        return False

    async def body(transaction: Any) -> bool:
        ref = db.collection("quote_batches").document(batch_id)
        snap = await ref.get(transaction=transaction)
        data = (snap.to_dict() or {}) if snap.exists else {}
        if data.get("status") not in ("submitted", "partially_approved", "approved", "rejected"):
            return False
        projects = list(data.get("projects") or [])
        target = next((p for p in projects if p.get("project_id") == project_id), None)
        if target is None:
            return False
        target["status"] = decision
        if notes:
            target["admin_notes"] = notes
        transaction.update(
            ref,
            {"projects": projects, "status": batch_status_from(projects), "updated_at": utc_now()},
        )
        return True

    return bool(await _transact(db, body))


async def sync_project_decision_safely(
    db: Any, project_id: str, decision: ProjectDecision, notes: str | None = None
) -> None:
    """For routes: the quote decision already committed, so a failure here is
    logged (and repaired by the next decision) rather than failing the request."""
    try:
        await sync_project_decision(db, project_id, decision, notes)
    except (GoogleAPIError, OSError, RuntimeError):
        logger.warning("[Batch] Could not mirror a quote decision on its batch.", exc_info=True)
