"""
Quote API Routes — HITL flow (start/approve) + CRUD (get/list/update/delete).

Security: All endpoints require JWT authentication (Depends(verify_token)).
          Admin-only actions (approve) require role="admin" Firebase custom claim.
          Project-specific actions verify caller owns the project (or is admin).

HITL Flow (LangGraph):
  - POST /{project_id}/start   — Phase 1: AI analysis → suspend at admin_review
  - POST /{project_id}/approve — Phase 2: inject decision → resume graph (ADMIN ONLY)

CRUD (Firestore):
  - GET  /user/{user_id}       — List all quotes for a user (IDOR-safe: enforces uid match)
  - GET  /{project_id}         — Get quote by project
  - GET  /{project_id}/pdf     — On-demand short-lived PDF signed URL (15 min)
  - PATCH /{project_id}        — Update quote items/notes
  - DELETE /{project_id}       — Delete quote draft (not approved/sent)

Storage path: projects/{project_id}/private_data/quote
"""
from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from src.auth.jwt_handler import verify_token
from src.core.exceptions import (
    CheckpointError,
    QuoteAlreadyApprovedError,
    QuoteNotFoundError,
)
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.graph.quote_graph import QuoteGraphFactory
from src.schemas.internal import UserSession
from src.schemas.quote import QuoteFinancials, QuoteItem, QuoteSchema
from src.services.pricing_service import PricingService
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/quote", tags=["Quote"])

# ─── Singleton graph (compiled once, reused per thread_id) ────────────────────
_factory = QuoteGraphFactory()
_graph = _factory.create_graph()

# ─── Path parameter: project_id with strict format validation ─────────────────
_PROJECT_ID = Path(
    ...,
    min_length=1,
    max_length=128,
    pattern=r"^[a-zA-Z0-9_-]+$",
    description="Project ID (alphanumeric, hyphens and underscores only)",
)


# ─── Schemas ─────────────────────────────────────────────────────────────────

class StartQuoteResponse(BaseModel):
    status: str = "awaiting_admin_review"
    project_id: str
    message: str


class AdminDecisionBody(BaseModel):
    decision: Literal["approve", "reject", "edit"] = Field(
        ...,
        description="Admin decision: 'approve' triggers PDF+delivery, 'reject' ends the flow.",
    )
    notes: str = Field(
        default="",
        description="Optional admin notes included in the PDF and stored on the quote.",
        max_length=2000,
    )


class ApproveQuoteResponse(BaseModel):
    status: str
    project_id: str
    decision: str


class QuoteUpdateBody(BaseModel):
    items: Optional[list[QuoteItem]] = None
    admin_notes: Optional[str] = Field(None, max_length=2000)


class QuoteListItemResponse(BaseModel):
    project_id: str
    status: str
    grand_total: float
    item_count: int
    updated_at: str


class QuotePdfUrlResponse(BaseModel):
    pdf_url: str
    expires_in_seconds: int = 900


# ─── Security Helpers ─────────────────────────────────────────────────────────

def _require_admin(user_session: UserSession) -> None:
    """Raise 403 if caller does not have the 'admin' Firebase custom claim."""
    if user_session.claims.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required.",
        )


async def _verify_project_ownership(
    project_id: str, user_session: UserSession
) -> None:
    """
    Raise 403 if the authenticated user does not own the project.
    Admins bypass ownership checks.
    Raises 404 if the project does not exist.
    """
    if user_session.claims.get("role") == "admin":
        return  # Admins can access any project

    db = get_async_firestore_client()
    doc = await db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found.",
        )
    project_data = doc.to_dict() or {}
    if project_data.get("userId") != user_session.uid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied.",
        )


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _quote_doc_ref(project_id: str):
    """Canonical Firestore path: projects/{project_id}/private_data/quote."""
    db = get_async_firestore_client()
    return (
        db.collection("projects")
        .document(project_id)
        .collection("private_data")
        .document("quote")
    )


# ─── HITL Endpoints ─────────────────────────────────────────────────────────

@router.post(
    "/{project_id}/start",
    response_model=StartQuoteResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start HITL quote flow (Phase 1)",
)
@limiter.limit("5/hour")
async def start_quote_flow(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    project_id: str = _PROJECT_ID,
    user_session: UserSession = Depends(verify_token),
) -> StartQuoteResponse:
    """
    Phase 1: runs the QuantitySurveyor node, then suspends at admin_review.
    State is persisted to Firestore via FirestoreSaver.
    Returns 202 Accepted.
    Caller must own the project or be admin.
    """
    await _verify_project_ownership(project_id, user_session)

    config = {"configurable": {"thread_id": project_id}}
    logger.info(
        "Starting HITL quote flow.",
        extra={"project_id": project_id, "uid": user_session.uid},
    )

    try:
        await _graph.ainvoke(
            {"project_id": project_id, "admin_decision": None, "admin_notes": ""},
            config,
        )
    except QuoteAlreadyApprovedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Quote for project '{project_id}' is already approved.",
        )
    except CheckpointError as exc:
        logger.error("Checkpoint save failed.", extra={"project_id": project_id})
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.detail)
    except Exception:
        logger.exception("Unexpected error in start_quote_flow.", extra={"project_id": project_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error_code": "INTERNAL_ERROR", "project_id": project_id},
        )

    return StartQuoteResponse(
        project_id=project_id,
        message=(
            "Quote analysis complete. Awaiting admin review in the admin console. "
            f"Visit /admin to review project '{project_id}'."
        ),
    )


@router.post(
    "/{project_id}/approve",
    response_model=ApproveQuoteResponse,
    summary="Admin approve/reject HITL quote (Phase 2) — ADMIN ONLY",
)
@limiter.limit("10/hour")
async def approve_quote(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    project_id: str = _PROJECT_ID,
    body: AdminDecisionBody = ...,  # type: ignore[assignment]
    user_session: UserSession = Depends(verify_token),
) -> ApproveQuoteResponse:
    """
    Phase 2: updates the Firestore checkpoint with the admin decision,
    then resumes the graph from where it was interrupted.
    ADMIN ONLY: requires 'role=admin' Firebase custom claim.
    CRITICAL: ainvoke(None, config) resumes — do NOT pass initial state.
    """
    _require_admin(user_session)

    config = {"configurable": {"thread_id": project_id}}
    logger.info(
        "Resuming HITL quote graph.",
        extra={
            "project_id": project_id,
            "decision": body.decision,
            "admin_uid": user_session.uid,
        },
    )

    try:
        await _graph.aupdate_state(
            config,
            {"admin_decision": body.decision, "admin_notes": body.notes},
        )
        await _graph.ainvoke(None, config)
    except QuoteNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No checkpoint found for project '{project_id}'. Run /start first.",
        )
    except CheckpointError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.detail)
    except Exception:
        logger.exception("Unexpected error in approve_quote.", extra={"project_id": project_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error_code": "INTERNAL_ERROR", "project_id": project_id},
        )

    result_status = "completed" if body.decision == "approve" else "rejected"
    return ApproveQuoteResponse(
        status=result_status,
        project_id=project_id,
        decision=body.decision,
    )


# ─── CRUD Endpoints ──────────────────────────────────────────────────────────
# NOTE: /user/{user_id} must be declared BEFORE /{project_id} at the same depth
# to ensure FastAPI resolves the literal "user" segment correctly.

@router.get(
    "/user/{user_id}",
    response_model=list[QuoteListItemResponse],
    summary="List all quotes for a user (IDOR-safe)",
)
@limiter.limit("60/minute")
async def list_user_quotes(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    user_id: str,
    user_session: UserSession = Depends(verify_token),
) -> list[QuoteListItemResponse]:
    """
    List all quotes across projects owned by a user.
    IDOR fix: caller can only access their own quotes.
    Admin can access any user's quotes.
    """
    # IDOR guard: caller must match user_id or be admin
    if user_id != user_session.uid and user_session.claims.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied.",
        )

    db = get_async_firestore_client()
    projects_query = db.collection("projects").where("userId", "==", user_id)
    project_docs = await projects_query.get()

    results: list[QuoteListItemResponse] = []
    for proj_doc in project_docs:
        quote_ref = proj_doc.reference.collection("private_data").document("quote")
        quote_doc = await quote_ref.get()
        if quote_doc.exists:
            qdata = quote_doc.to_dict() or {}
            # Exclude soft-deleted quotes
            if qdata.get("status") == "deleted":
                continue
            financials = qdata.get("financials", {})
            items = qdata.get("items", [])
            updated = qdata.get("updated_at", "")
            if hasattr(updated, "isoformat"):
                updated = updated.isoformat()
            results.append(
                QuoteListItemResponse(
                    project_id=proj_doc.id,
                    status=qdata.get("status", "draft"),
                    grand_total=financials.get("grand_total", 0.0),
                    item_count=len(items),
                    updated_at=str(updated),
                )
            )

    return results


@router.get(
    "/{project_id}",
    response_model=QuoteSchema,
    summary="Get quote by project ID",
)
@limiter.limit("60/minute")
async def get_quote(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    project_id: str = _PROJECT_ID,
    user_session: UserSession = Depends(verify_token),
) -> QuoteSchema:
    """Retrieve the quote document for a project. Caller must own the project or be admin."""
    await _verify_project_ownership(project_id, user_session)

    doc = await _quote_doc_ref(project_id).get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No quote found for project '{project_id}'.",
        )
    data = doc.to_dict() or {}
    if data.get("status") == "deleted":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No quote found for project '{project_id}'.",
        )
    data["id"] = doc.id
    return QuoteSchema(**data)


@router.get(
    "/{project_id}/pdf",
    response_model=QuotePdfUrlResponse,
    summary="Get on-demand short-lived PDF signed URL (15 min TTL)",
)
@limiter.limit("20/minute")
async def get_quote_pdf_url(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    project_id: str = _PROJECT_ID,
    user_session: UserSession = Depends(verify_token),
) -> QuotePdfUrlResponse:
    """
    Generates a fresh 15-minute signed URL for the project's quote PDF.
    Does NOT use long-lived cached URLs — every call produces a new short-lived token.
    Caller must own the project or be admin.
    """
    await _verify_project_ownership(project_id, user_session)

    try:
        from firebase_admin import storage as fb_storage

        def _generate_url() -> str | None:
            bucket = fb_storage.bucket()
            blob = bucket.blob(f"projects/{project_id}/quote.pdf")
            if not blob.exists():
                return None
            return blob.generate_signed_url(expiration=900, method="GET")  # 15 minutes

        pdf_url = await run_in_threadpool(_generate_url)
    except Exception:
        logger.exception("Error generating PDF URL.", extra={"project_id": project_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate PDF URL.",
        )

    if pdf_url is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not yet generated for this project. Approve the quote first.",
        )

    return QuotePdfUrlResponse(pdf_url=pdf_url, expires_in_seconds=900)


@router.patch(
    "/{project_id}",
    response_model=QuoteSchema,
    summary="Update quote items or admin notes",
)
@limiter.limit("20/minute")
async def update_quote(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    project_id: str = _PROJECT_ID,
    body: QuoteUpdateBody = ...,  # type: ignore[assignment]
    user_session: UserSession = Depends(verify_token),
) -> QuoteSchema:
    """
    Partial update of a quote. If items are changed, financials are recalculated
    deterministically via PricingService.
    Caller must own the project or be admin.
    """
    await _verify_project_ownership(project_id, user_session)

    ref = _quote_doc_ref(project_id)
    doc = await ref.get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No quote found for project '{project_id}'.",
        )

    current = doc.to_dict() or {}
    if current.get("status") in ("approved", "sent"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot edit a quote with status '{current.get('status')}'.",
        )

    updates: dict = {"updated_at": utc_now()}

    if body.admin_notes is not None:
        updates["admin_notes"] = body.admin_notes

    if body.items is not None:
        items_dump = [item.model_dump() for item in body.items]
        financials = PricingService.calculate_financials(body.items)
        updates["items"] = items_dump
        updates["financials"] = financials.model_dump()
        updates["version"] = current.get("version", 1) + 1

    await ref.update(updates)

    refreshed = await ref.get()
    data = refreshed.to_dict() or {}
    data["id"] = refreshed.id
    return QuoteSchema(**data)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete quote draft",
)
@limiter.limit("5/hour")
async def delete_quote(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    project_id: str = _PROJECT_ID,
    user_session: UserSession = Depends(verify_token),
) -> None:
    """
    Soft-delete a quote document (sets status='deleted' for audit trail).
    Only drafts in 'draft' or 'pending_review' status can be deleted.
    Caller must own the project or be admin.
    """
    await _verify_project_ownership(project_id, user_session)

    ref = _quote_doc_ref(project_id)
    doc = await ref.get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No quote found for project '{project_id}'.",
        )

    qdata = doc.to_dict() or {}
    if qdata.get("status") in ("approved", "sent", "deleted"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete a quote with status '{qdata.get('status')}'.",
        )

    # Soft-delete: preserve audit trail
    await ref.update({"status": "deleted", "deleted_at": utc_now()})
