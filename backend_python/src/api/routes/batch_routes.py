"""
Quote Batch API Routes — Multi-project batch submission for admin review.

A QuoteBatch is a grouping container: individual project quotes are preserved
as-is (no aggregation/merge). The batch groups them for a single submission.

Security: All endpoints require JWT authentication (Depends(verify_token)).
          Admin-only actions (per-project approve/reject) require role="admin".

Firestore path: quote_batches/{batch_id}

Flow:
  1. User creates a batch from selected project IDs → POST /quote/batch
  2. User submits batch to admin → POST /quote/batch/{batch_id}/submit
  3. Admin reviews each project independently → POST /quote/batch/{batch_id}/projects/{project_id}/decide
"""
from __future__ import annotations

import logging
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field

from src.auth.jwt_handler import verify_token
from src.core.exceptions import BatchNotFoundError
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.schemas.internal import UserSession
from src.schemas.quote import AggregationAdjustment, BatchProject, BatchStatusType, QuoteItem, QuoteBatch
from src.services.batch_aggregation_engine import (
    ProjectQuoteSummary,
    get_batch_aggregation_engine,
)
from src.services.notification_service import NotificationService
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/quote/batch", tags=["QuoteBatch"])

_BATCH_ID = Path(
    ...,
    min_length=1,
    max_length=128,
    pattern=r"^[a-zA-Z0-9_-]+$",
    description="Batch ID",
)

_PROJECT_ID = Path(
    ...,
    min_length=1,
    max_length=128,
    pattern=r"^[a-zA-Z0-9_-]+$",
    description="Project ID",
)


# ── Request / Response Schemas ───────────────────────────────────────────────

class CreateBatchBody(BaseModel):
    model_config = {"extra": "forbid"}
    project_ids: list[str] = Field(
        ..., min_length=1, max_length=20,
        description="List of project IDs to include in the batch",
    )


class CreateBatchResponse(BaseModel):
    model_config = {"extra": "ignore"}
    batch_id: str
    total_projects: int
    batch_subtotal: float
    status: str


class BatchListItemResponse(BaseModel):
    model_config = {"extra": "ignore"}
    batch_id: str
    status: str
    total_projects: int
    batch_subtotal: float
    created_at: str


class AggregationPreviewResponse(BaseModel):
    model_config = {"extra": "ignore"}
    batch_id: str
    total_savings: float
    original_combined_subtotal: float
    optimized_subtotal: float
    adjustments: list[AggregationAdjustment]


class ProjectDecisionBody(BaseModel):
    model_config = {"extra": "forbid"}
    decision: Literal["approve", "reject"] = Field(
        ..., description="Admin decision for this project within the batch",
    )
    notes: str = Field(default="", max_length=2000)


class ProjectDecisionResponse(BaseModel):
    model_config = {"extra": "ignore"}
    batch_id: str
    project_id: str
    decision: str
    batch_status: str


# ── Helpers ──────────────────────────────────────────────────────────────────

def _batch_ref(batch_id: str):
    """Firestore path: quote_batches/{batch_id}."""
    db = get_async_firestore_client()
    return db.collection("quote_batches").document(batch_id)


async def _get_batch_or_404(batch_id: str) -> dict:
    """Load batch document or raise 404."""
    doc = await _batch_ref(batch_id).get()
    if not doc.exists:
        raise BatchNotFoundError(batch_id)
    return doc.to_dict() or {}


async def _verify_batch_ownership(batch_data: dict, user_session: UserSession) -> None:
    """Raise 403 if caller doesn't own the batch (admins bypass)."""
    if user_session.claims.get("role") == "admin":
        return
    if batch_data.get("user_id") != user_session.uid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied.",
        )


def _require_admin(user_session: UserSession) -> None:
    if user_session.claims.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required.",
        )


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=CreateBatchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a quote batch from selected projects",
)
@limiter.limit("10/hour")
async def create_batch(
    request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    body: CreateBatchBody,
    user_session: UserSession = Depends(verify_token),
) -> CreateBatchResponse:
    """
    Creates a new QuoteBatch by snapshotting the current quote state
    of each selected project. Only projects with a 'draft' quote owned
    by the caller are included.
    """
    db = get_async_firestore_client()
    batch_project_objects: list[BatchProject] = []
    quote_summaries: list[ProjectQuoteSummary] = []

    for pid in body.project_ids:
        # Verify ownership
        proj_doc = await db.collection("projects").document(pid).get()
        if not proj_doc.exists:
            logger.warning("Batch: project not found, skipping.", extra={"project_id": pid})
            continue
        proj_data = proj_doc.to_dict() or {}
        if proj_data.get("userId") != user_session.uid:
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
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No eligible projects found. Each project must have a draft quote.",
        )

    # Compute cross-project aggregation preview (advisory only)
    engine = get_batch_aggregation_engine()
    preview = engine.preview(quote_summaries)

    batch_subtotal = sum(p.subtotal for p in batch_project_objects)
    n_projects = len(batch_project_objects)
    batch_id = str(uuid.uuid4())
    now = utc_now()

    batch_doc = QuoteBatch(
        id=batch_id,
        user_id=user_session.uid,
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

    return CreateBatchResponse(
        batch_id=batch_id,
        total_projects=n_projects,
        batch_subtotal=batch_subtotal,
        status="draft",
    )


@router.get(
    "/user/{user_id}",
    response_model=list[BatchListItemResponse],
    summary="List batches for a user",
)
@limiter.limit("60/minute")
async def list_user_batches(
    request,  # pyright: ignore[reportUnusedParameter]
    user_id: str,
    user_session: UserSession = Depends(verify_token),
) -> list[BatchListItemResponse]:
    """List all quote batches for a user. IDOR-safe: caller must match or be admin."""
    if user_id != user_session.uid and user_session.claims.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    db = get_async_firestore_client()
    query = db.collection("quote_batches").where("user_id", "==", user_id)
    docs = await query.get()

    results: list[BatchListItemResponse] = []
    for doc in docs:
        data = doc.to_dict() or {}
        created = data.get("created_at", "")
        if hasattr(created, "isoformat"):
            created = created.isoformat()
        results.append(
            BatchListItemResponse(
                batch_id=doc.id,
                status=data.get("status", "draft"),
                total_projects=data.get("total_projects", 0),
                batch_subtotal=data.get("batch_subtotal", 0.0),
                created_at=str(created),
            )
        )

    return results


@router.get(
    "/{batch_id}",
    response_model=QuoteBatch,
    summary="Get batch details",
)
@limiter.limit("60/minute")
async def get_batch(
    request,  # pyright: ignore[reportUnusedParameter]
    batch_id: str = _BATCH_ID,
    user_session: UserSession = Depends(verify_token),
) -> QuoteBatch:
    """Get full batch document with all project snapshots."""
    data = await _get_batch_or_404(batch_id)
    await _verify_batch_ownership(data, user_session)
    data["id"] = batch_id
    return QuoteBatch(**data)  # type: ignore[reportCallIssue]


@router.get(
    "/{batch_id}/preview",
    response_model=AggregationPreviewResponse,
    summary="Get cross-project savings preview for a batch",
)
@limiter.limit("30/minute")
async def get_aggregation_preview(
    request,  # pyright: ignore[reportUnusedParameter]
    batch_id: str = _BATCH_ID,
    user_session: UserSession = Depends(verify_token),
) -> AggregationPreviewResponse:
    """
    Returns the advisory cross-project optimization preview.
    Shows potential savings without modifying any project data.
    """
    data = await _get_batch_or_404(batch_id)
    await _verify_batch_ownership(data, user_session)

    return AggregationPreviewResponse(
        batch_id=batch_id,
        total_savings=data.get("potential_savings", 0.0),
        original_combined_subtotal=data.get("batch_subtotal", 0.0),
        optimized_subtotal=round(
            data.get("batch_subtotal", 0.0) - data.get("potential_savings", 0.0), 2
        ),
        adjustments=[
            AggregationAdjustment(**adj) for adj in data.get("aggregation_preview", [])
        ],
    )


@router.post(
    "/{batch_id}/submit",
    response_model=CreateBatchResponse,
    summary="Submit batch to admin for review",
)
@limiter.limit("5/hour")
async def submit_batch(
    request,  # pyright: ignore[reportUnusedParameter]
    batch_id: str = _BATCH_ID,
    user_session: UserSession = Depends(verify_token),
) -> CreateBatchResponse:
    """
    Submit a draft batch to admin. This transitions the batch status
    to 'submitted' and triggers the admin notification.
    Each project's quote status is also updated to 'pending_review'.
    """
    data = await _get_batch_or_404(batch_id)
    await _verify_batch_ownership(data, user_session)

    if data.get("status") != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Batch is already '{data.get('status')}'. Only draft batches can be submitted.",
        )

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
    import asyncio
    try:
        notification = NotificationService()
        asyncio.create_task(
            notification.notify_admin_quote_ready(
                project_id=batch_id,
                grand_total=data.get("batch_grand_total", 0.0),
                user_id=user_session.uid,
            )
        )
    except Exception:
        logger.warning("Admin notification failed (non-fatal).", exc_info=True)

    logger.info(
        "Batch submitted to admin.",
        extra={"batch_id": batch_id, "projects": len(projects)},
    )

    return CreateBatchResponse(
        batch_id=batch_id,
        total_projects=data.get("total_projects", 0),
        batch_subtotal=data.get("batch_subtotal", 0.0),
        status="submitted",
    )


@router.post(
    "/{batch_id}/projects/{project_id}/decide",
    response_model=ProjectDecisionResponse,
    summary="Admin: approve or reject a single project in the batch",
)
@limiter.limit("20/minute")
async def decide_project(
    request,  # pyright: ignore[reportUnusedParameter]
    batch_id: str = _BATCH_ID,
    project_id: str = _PROJECT_ID,
    body: ProjectDecisionBody = ...,  # type: ignore[assignment]
    user_session: UserSession = Depends(verify_token),
) -> ProjectDecisionResponse:
    """
    Admin approves or rejects a single project within a batch.
    When all projects have been decided, the batch status auto-transitions.
    """
    _require_admin(user_session)

    data = await _get_batch_or_404(batch_id)
    if data.get("status") not in ("submitted", "partially_approved"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Batch status is '{data.get('status')}'. Must be 'submitted' or 'partially_approved'.",
        )

    # Find and update the target project
    projects = data.get("projects", [])
    found = False
    new_status = "approved" if body.decision == "approve" else "rejected"
    for proj in projects:
        if proj.get("project_id") == project_id:
            new_status = "approved" if body.decision == "approve" else "rejected"
            proj["status"] = new_status
            if body.notes:
                proj["admin_notes"] = body.notes
            found = True
            break

    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found in batch '{batch_id}'.",
        )

    # Determine overall batch status
    statuses = {p.get("status") for p in projects}
    if statuses <= {"approved"}:
        batch_status: BatchStatusType = "approved"
    elif statuses <= {"rejected"}:
        batch_status = "rejected"
    elif "draft" not in statuses:
        batch_status = "partially_approved"
    else:
        batch_status = "submitted"

    now = utc_now()
    await _batch_ref(batch_id).update({
        "projects": projects,
        "status": batch_status,
        "updated_at": now,
    })

    # Also update the individual project's quote document
    db = get_async_firestore_client()
    quote_ref = (
        db.collection("projects").document(project_id)
        .collection("private_data").document("quote")
    )
    try:
        quote_update: dict = {"status": new_status, "updated_at": now}
        if body.notes:
            quote_update["admin_notes"] = body.notes
        await quote_ref.update(quote_update)
    except Exception:
        logger.warning("Failed to sync project quote status.", extra={"project_id": project_id})

    logger.info(
        "Admin decided on project in batch.",
        extra={
            "batch_id": batch_id,
            "project_id": project_id,
            "decision": body.decision,
            "batch_status": batch_status,
        },
    )

    return ProjectDecisionResponse(
        batch_id=batch_id,
        project_id=project_id,
        decision=body.decision,
        batch_status=batch_status,
    )
