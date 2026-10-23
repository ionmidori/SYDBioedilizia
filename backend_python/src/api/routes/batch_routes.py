"""
Quote Batch API Routes — Multi-project batch submission for admin review.

A QuoteBatch is a grouping container: individual project quotes are preserved
as-is (no aggregation/merge). The batch groups them for a single submission.

Security: All endpoints require JWT authentication (Depends(verify_token)).
          A client sees only its own batches. The admin reviews and decides each quote
          in the admin console (/api/admin/batches, /api/admin/quotes), never from here.

Firestore path: quote_batches/{batch_id}

Flow:
  1. User creates a batch from selected project IDs → POST /quote/batch
  2. User submits batch to admin → POST /quote/batch/{batch_id}/submit
  3. Admin decides each quote in its dossier (/admin/quotes/{project_id});
     the batch follows (services/batch_sync.py).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from pydantic import BaseModel, Field
from src.auth.admin import has_admin_role
from src.auth.jwt_handler import verify_token
from src.core.exceptions import (
    BatchNotFoundError,
    BatchNotSubmittableError,
    NoEligibleProjectsError,
    PermissionDenied,
)
from src.core.money import Money, to_cents
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.schemas.internal import UserSession
from src.schemas.quote import AggregationAdjustment, QuoteBatch
from src.services import batch_service

logger = logging.getLogger(__name__)
# /api prefix: see quote_routes.py — client-facing routers live under /api/*.
router = APIRouter(prefix="/api/quote/batch", tags=["QuoteBatch"])

_BATCH_ID = Path(
    ...,
    min_length=1,
    max_length=128,
    pattern=r"^[a-zA-Z0-9_-]+$",
    description="Batch ID",
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
    batch_subtotal: Money
    status: str


class BatchListItemResponse(BaseModel):
    model_config = {"extra": "ignore"}
    batch_id: str
    status: str
    total_projects: int
    batch_subtotal: Money
    created_at: str


class AggregationPreviewResponse(BaseModel):
    model_config = {"extra": "ignore"}
    batch_id: str
    total_savings: Money
    original_combined_subtotal: Money
    optimized_subtotal: Money
    adjustments: list[AggregationAdjustment]


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
    if has_admin_role(user_session):
        return
    if batch_data.get("user_id") != user_session.uid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied.",
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
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    body: CreateBatchBody,
    user_session: UserSession = Depends(verify_token),
) -> CreateBatchResponse:
    """
    Creates a new QuoteBatch by snapshotting the current quote state
    of each selected project. Only projects with a 'draft' quote owned
    by the caller are included.

    Thin wrapper over batch_service.create_batch (shared with the chat
    submit_quote_request tool — single submission path).
    """
    try:
        summary = await batch_service.create_batch(
            user_id=user_session.uid,
            project_ids=body.project_ids,
        )
    except NoEligibleProjectsError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=e.message,
        ) from e

    return CreateBatchResponse(
        batch_id=summary.batch_id,
        total_projects=summary.total_projects,
        batch_subtotal=summary.batch_subtotal,
        status=summary.status,
    )


@router.get(
    "/user/{user_id}",
    response_model=list[BatchListItemResponse],
    summary="List batches for a user",
)
@limiter.limit("60/minute")
async def list_user_batches(
    request: Request,  # pyright: ignore[reportUnusedParameter]
    user_id: str,
    user_session: UserSession = Depends(verify_token),
) -> list[BatchListItemResponse]:
    """List all quote batches for a user. IDOR-safe: caller must match or be admin."""
    if user_id != user_session.uid and not has_admin_role(user_session):
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
                batch_subtotal=to_cents(data.get("batch_subtotal") or 0),
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
    request: Request,  # pyright: ignore[reportUnusedParameter]
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
    request: Request,  # pyright: ignore[reportUnusedParameter]
    batch_id: str = _BATCH_ID,
    user_session: UserSession = Depends(verify_token),
) -> AggregationPreviewResponse:
    """
    Returns the advisory cross-project optimization preview.
    Shows potential savings without modifying any project data.
    """
    data = await _get_batch_or_404(batch_id)
    await _verify_batch_ownership(data, user_session)

    subtotal = to_cents(data.get("batch_subtotal") or 0)
    savings = to_cents(data.get("potential_savings") or 0)
    return AggregationPreviewResponse(
        batch_id=batch_id,
        total_savings=savings,
        original_combined_subtotal=subtotal,
        optimized_subtotal=subtotal - savings,
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
    request: Request,  # pyright: ignore[reportUnusedParameter]
    batch_id: str = _BATCH_ID,
    user_session: UserSession = Depends(verify_token),
) -> CreateBatchResponse:
    """
    Submit a draft batch to admin. This transitions the batch status
    to 'submitted' and triggers the admin notification.
    Each project's quote status is also updated to 'pending_review'.

    Thin wrapper over batch_service.submit_batch (shared with the chat
    submit_quote_request tool — single submission path).
    """
    try:
        summary = await batch_service.submit_batch(
            user_id=user_session.uid,
            batch_id=batch_id,
            is_admin=has_admin_role(user_session),
        )
    except PermissionDenied as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied.",
        ) from e
    except BatchNotSubmittableError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=e.message,
        ) from e

    return CreateBatchResponse(
        batch_id=summary.batch_id,
        total_projects=summary.total_projects,
        batch_subtotal=summary.batch_subtotal,
        status=summary.status,
    )
