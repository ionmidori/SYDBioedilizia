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
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from src.auth.admin import has_admin_role
from src.auth.jwt_handler import verify_token
from src.core.exceptions import (
    CheckpointError,
    QuoteAlreadyApprovedError,
)
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.schemas.internal import UserSession
from src.schemas.quote import QuoteSchema
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)
# /api prefix: client-facing routers live under /api/* — the Next.js rewrite
# maps /api/py/:path* → backend /api/:path*, and NEXT_PUBLIC_API_URL ends in
# /api. Without it the dashboard "Preventivi" calls 404'd (found in smoke).
router = APIRouter(prefix="/api/quote", tags=["Quote"])

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
    model_config = {"extra": "ignore"}
    status: str = "awaiting_admin_review"
    project_id: str
    message: str


class QuoteListItemResponse(BaseModel):
    """Golden Sync: web_client/types/quote.ts → QuoteListItem."""
    model_config = {"extra": "ignore"}
    project_id: str
    project_name: str = ""
    # Human-readable reference (PRV-YYYY-NNNN); None for quotes not yet numbered.
    quote_number: str | None = None
    status: str
    # Confidential until admin approval: masked to 0.0 for non-admin callers
    # when status != "approved" (the draft is reviewed by the admin first).
    grand_total: float
    item_count: int
    updated_at: str
    pdf_available: bool = False


class QuotePdfUrlResponse(BaseModel):
    model_config = {"extra": "ignore"}
    pdf_url: str
    expires_in_seconds: int = 900


# ─── Security Helpers ─────────────────────────────────────────────────────────

def _is_admin(user_session: UserSession) -> bool:
    return has_admin_role(user_session)


# Review/pipeline metadata the client must never receive: who reviewed or
# started the review, the raw decision, and Storage locations / long-lived
# signed URLs (the client downloads the PDF via GET /{id}/pdf, 15-min URL).
_CLIENT_HIDDEN_FIELDS = (
    "reviewed_by",
    "started_by",
    "admin_decision",
    "pdf_url",
    "pdf_blob_path",
    # Admin dossier data: Storage paths, search index, contact snapshot.
    "media",
    "search_keys",
    "client_snapshot",
    "review",  # admin uids, lock and approval metadata
    "pdf_revision",
    "last_delivery_id",  # outbox/delivery internals
)


def _strip_internal_fields(data: dict) -> dict:
    """🛡️ Client view of a quote: drop review metadata; admin notes only once
    approved (they are printed on the PDF, but drafts may hold internal notes)."""
    for field in _CLIENT_HIDDEN_FIELDS:
        data.pop(field, None)
    if data.get("status") not in ("approved", "sent"):
        data.pop("admin_notes", None)
    return data


def _mask_draft_prices(data: dict) -> dict:
    """🛡️ The draft is confidential until admin approval: hide every price."""
    data["items"] = [{**item, "unit_price": 0.0, "total": 0.0} for item in data.get("items", [])]
    data["financials"] = {}
    return data


async def _verify_project_ownership(
    project_id: str, user_session: UserSession
) -> None:
    """
    Raise 403 if the authenticated user does not own the project.
    Admins bypass ownership checks.
    Raises 404 if the project does not exist.
    """
    if has_admin_role(user_session):
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
    logger.info(
        "Starting HITL quote flow (ADK).",
        extra={"project_id": project_id, "uid": user_session.uid},
    )

    try:
        from src.adk.hitl import start_quote_hitl
        await start_quote_hitl(project_id=project_id, user_id=user_session.uid)
    except QuoteAlreadyApprovedError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Quote for project '{project_id}' is already approved.",
        ) from e
    except CheckpointError as e:
        logger.error(f"Checkpoint error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Quote checkpoint service is temporarily unavailable.",
        ) from e
    except Exception as e:
        logger.exception("Unexpected error in start_quote_flow.", extra={"project_id": project_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error_code": "INTERNAL_ERROR", "project_id": project_id},
        ) from e

    return StartQuoteResponse(
        project_id=project_id,
        message=(
            "Quote analysis complete. Awaiting admin review in the admin console. "
            f"Visit /admin to review project '{project_id}'."
        ),
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
    if user_id != user_session.uid and not has_admin_role(user_session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied.",
        )

    db = get_async_firestore_client()
    projects_query = db.collection("projects").where("userId", "==", user_id)
    project_docs = await projects_query.get()

    is_admin = has_admin_role(user_session)

    results: list[QuoteListItemResponse] = []
    for proj_doc in project_docs:
        quote_ref = proj_doc.reference.collection("private_data").document("quote")
        quote_doc = await quote_ref.get()
        if quote_doc.exists:
            qdata = quote_doc.to_dict() or {}
            # Exclude soft-deleted quotes
            if qdata.get("status") == "deleted":
                continue
            quote_status = qdata.get("status", "draft")
            financials = qdata.get("financials", {})
            items = qdata.get("items", [])
            updated = qdata.get("updated_at", "")
            if hasattr(updated, "isoformat"):
                updated = updated.isoformat()

            # Confidentiality: the draft is reviewed by the admin first —
            # non-admin callers see the total only once approved.
            grand_total = financials.get("grand_total", 0.0)
            if not is_admin and quote_status not in ("approved", "sent"):
                grand_total = 0.0

            proj_data = proj_doc.to_dict() or {}
            results.append(
                QuoteListItemResponse(
                    project_id=proj_doc.id,
                    project_name=proj_data.get("name", ""),
                    quote_number=qdata.get("quote_number"),
                    status=quote_status,
                    grand_total=grand_total,
                    item_count=len(items),
                    updated_at=str(updated),
                    pdf_available=bool(qdata.get("pdf_blob_path") or qdata.get("pdf_url")),
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
    if not _is_admin(user_session):
        if data.get("status") not in ("approved", "sent"):
            data = _mask_draft_prices(data)
        data = _strip_internal_fields(data)
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
    Non-admin callers can only fetch the PDF of an APPROVED quote (the draft
    is confidential until the admin review — client area "Preventivi" section).
    """
    await _verify_project_ownership(project_id, user_session)

    quote_doc = await _quote_doc_ref(project_id).get()
    qdata = (quote_doc.to_dict() or {}) if quote_doc.exists else {}
    is_admin = has_admin_role(user_session)
    if not is_admin and qdata.get("status") != "approved":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not yet available for this project.",
        )

    # Blob path saved at approval time; legacy fallback for pre-existing quotes.
    blob_path = qdata.get("pdf_blob_path") or f"projects/{project_id}/quote.pdf"

    try:
        from firebase_admin import storage as fb_storage

        def _generate_url() -> str | None:
            bucket = fb_storage.bucket()
            blob = bucket.blob(blob_path)
            if not blob.exists():
                return None
            return blob.generate_signed_url(
                expiration=timedelta(minutes=15), method="GET", version="v4"
            )

        pdf_url = await run_in_threadpool(_generate_url)
    except Exception as e:
        logger.exception("Error generating PDF URL.", extra={"project_id": project_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate PDF URL.",
        ) from e

    if pdf_url is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not yet generated for this project. Approve the quote first.",
        )

    return QuotePdfUrlResponse(pdf_url=pdf_url, expires_in_seconds=900)


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
