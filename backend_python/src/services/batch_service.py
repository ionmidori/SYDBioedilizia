"""
BatchService: create and submit quote batches (shared by REST routes and ADK tools).

Logic extracted 1:1 from src/api/routes/batch_routes.py so that the dashboard
button (POST /quote/batch + /submit) and the chat tool submit_quote_request
share a SINGLE submission path.

Pattern: Service Layer (no HTTP logic — raises domain AppException subclasses;
routes map them to HTTPException, tools map them to user-facing messages).
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass

from src.core.exceptions import (
    BatchNotFoundError,
    BatchNotSubmittableError,
    NoEligibleProjectsError,
    PermissionDenied,
)
from src.db.firebase_client import get_async_firestore_client
from src.schemas.quote import BatchProject, QuoteBatch, QuoteItem
from src.services.batch_aggregation_engine import (
    ProjectQuoteSummary,
    get_batch_aggregation_engine,
)
from src.services.notification_service import NotificationService
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BatchSummary:
    """Result of a create/submit operation (mirrors CreateBatchResponse)."""
    batch_id: str
    total_projects: int
    batch_subtotal: float
    status: str


def _batch_ref(batch_id: str):
    """Firestore path: quote_batches/{batch_id}."""
    db = get_async_firestore_client()
    return db.collection("quote_batches").document(batch_id)


async def create_batch(user_id: str, project_ids: list[str]) -> BatchSummary:
    """
    Create a new QuoteBatch by snapshotting the current quote state of each
    selected project. Only projects with a 'draft'/'pending_review' quote
    owned by user_id are included.

    Raises NoEligibleProjectsError if no project qualifies.
    """
    db = get_async_firestore_client()
    batch_project_objects: list[BatchProject] = []
    quote_summaries: list[ProjectQuoteSummary] = []

    for pid in project_ids:
        # Verify ownership
        proj_doc = await db.collection("projects").document(pid).get()
        if not proj_doc.exists:
            logger.warning("Batch: project not found, skipping.", extra={"project_id": pid})
            continue
        proj_data = proj_doc.to_dict() or {}
        if proj_data.get("userId") != user_id:
            logger.warning("Batch: user doesn't own project, skipping.", extra={"project_id": pid})
            continue

        # Load quote snapshot
        quote_doc = await (
            db.collection("projects").document(pid)
            .collection("private_data").document("quote").get()
        )
        if not quote_doc.exists:
            logger.warning("Batch: no quote for project, skipping.", extra={"project_id": pid})
            continue

        qdata = quote_doc.to_dict() or {}
        if qdata.get("status") not in ("draft", "pending_review"):
            logger.warning(
                "Batch: quote not in draft/pending_review, skipping.",
                extra={"project_id": pid, "status": qdata.get("status")},
            )
            continue

        financials = qdata.get("financials", {})
        raw_items = qdata.get("items", [])
        project_name = proj_data.get("name", pid)

        batch_project_objects.append(
            BatchProject(  # type: ignore[call-arg]
                project_id=pid,
                project_name=project_name,
                status="draft",
                item_count=len(raw_items),
                subtotal=financials.get("subtotal", 0.0),
            )
        )

        # Parse items for aggregation preview
        parsed_items = []
        for raw in raw_items:
            try:
                parsed_items.append(QuoteItem(**raw))
            except Exception:
                pass  # Skip malformed items
        if parsed_items:
            quote_summaries.append(ProjectQuoteSummary(pid, project_name, parsed_items))

    if not batch_project_objects:
        raise NoEligibleProjectsError()

    # Compute cross-project aggregation preview (advisory only)
    engine = get_batch_aggregation_engine()
    preview = engine.preview(quote_summaries)

    batch_subtotal = sum(p.subtotal for p in batch_project_objects)
    n_projects = len(batch_project_objects)
    batch_id = str(uuid.uuid4())
    now = utc_now()

    batch_doc = QuoteBatch(
        id=batch_id,
        user_id=user_id,
        status="draft",
        projects=batch_project_objects,
        total_projects=n_projects,
        batch_subtotal=batch_subtotal,
        batch_grand_total=round(batch_subtotal * 1.22, 2),
        submitted_at=None,
        created_at=now,
        updated_at=now,
        potential_savings=preview.total_savings,
        aggregation_preview=preview.adjustments,
    )

    await _batch_ref(batch_id).set(batch_doc.model_dump(mode="json"))

    logger.info(
        "Batch created.",
        extra={"batch_id": batch_id, "projects": n_projects, "subtotal": batch_subtotal},
    )

    return BatchSummary(
        batch_id=batch_id,
        total_projects=n_projects,
        batch_subtotal=batch_subtotal,
        status="draft",
    )


async def submit_batch(user_id: str, batch_id: str, *, is_admin: bool = False) -> BatchSummary:
    """
    Submit a draft batch to admin: batch → 'submitted', each project's quote →
    'pending_review', then fire-and-forget admin notification.

    Raises BatchNotFoundError, PermissionDenied, BatchNotSubmittableError.
    """
    doc = await _batch_ref(batch_id).get()
    if not doc.exists:
        raise BatchNotFoundError(batch_id)
    data = doc.to_dict() or {}

    if not is_admin and data.get("user_id") != user_id:
        raise PermissionDenied(message="Access denied.")

    if data.get("status") != "draft":
        raise BatchNotSubmittableError(batch_id, str(data.get("status")))

    now = utc_now()
    db = get_async_firestore_client()

    # Update each project's quote status to pending_review
    projects = data.get("projects", [])
    for proj in projects:
        pid = proj.get("project_id")
        if pid:
            quote_ref = (
                db.collection("projects").document(pid)
                .collection("private_data").document("quote")
            )
            try:
                await quote_ref.update({"status": "pending_review", "updated_at": now})
            except Exception:
                logger.warning("Failed to update project quote status.", extra={"project_id": pid})

    # Update batch status
    await _batch_ref(batch_id).update({
        "status": "submitted",
        "submitted_at": now,
        "updated_at": now,
    })

    # Fire-and-forget admin notification
    try:
        notification = NotificationService()
        asyncio.create_task(
            notification.notify_admin_quote_ready(
                project_id=batch_id,
                grand_total=data.get("batch_grand_total", 0.0),
                user_id=user_id,
            )
        )
    except Exception:
        logger.warning("Admin notification failed (non-fatal).", exc_info=True)

    logger.info(
        "Batch submitted to admin.",
        extra={"batch_id": batch_id, "projects": len(projects)},
    )

    return BatchSummary(
        batch_id=batch_id,
        total_projects=data.get("total_projects", 0),
        batch_subtotal=data.get("batch_subtotal", 0.0),
        status="submitted",
    )
