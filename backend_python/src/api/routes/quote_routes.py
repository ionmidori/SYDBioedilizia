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

import asyncio
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
from src.schemas.internal import UserSession
from src.schemas.quote import QuoteItem, QuoteSchema
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event
from src.services.notification_service import NotificationService
from src.services.pdf_service import PdfService
from src.services.pricing_service import PricingService
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


class AdminDecisionBody(BaseModel):
    model_config = {"extra": "forbid"}

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
    model_config = {"extra": "ignore"}
    status: str
    project_id: str
    decision: str


class QuoteUpdateBody(BaseModel):
    model_config = {"extra": "forbid"}

    items: Optional[list[QuoteItem]] = None
    admin_notes: Optional[str] = Field(None, max_length=2000)


class QuoteListItemResponse(BaseModel):
    """Golden Sync: web_client/types/quote.ts → QuoteListItem."""
    model_config = {"extra": "ignore"}
    project_id: str
    project_name: str = ""
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


async def _resolve_project_owner_uid(project_id: str) -> str | None:
    """
    Resolve the uid of the client who owns the project (projects/{id}.userId).

    Used by the post-approval delivery pipeline: the quote must go to the
    project owner, NOT to the admin performing the approval.
    """
    db = get_async_firestore_client()
    doc = await db.collection("projects").document(project_id).get()
    if not doc.exists:
        return None
    return (doc.to_dict() or {}).get("userId")


async def _get_user_profile(uid: str) -> dict:
    """
    Resolves user contact info from Firebase Auth + Firestore.

    Returns {name, email, phone} for PDF generation and email delivery.
    Phone is optional — only available if the user provided it during a quote flow.
    Never raises: missing fields default to empty string.
    """
    name = ""
    email = ""
    phone = ""

    # 1. Firebase Auth: authoritative source for email + display name
    try:
        from firebase_admin import auth as fb_auth
        user_record = await run_in_threadpool(fb_auth.get_user, uid)
        email = user_record.email or ""
        name = user_record.display_name or ""
    except Exception:
        logger.warning("[UserProfile] Firebase Auth lookup failed for uid=%s", uid)

    # 2. Firestore users/{uid}: phone (saved during quote flow) + name fallback
    try:
        db = get_async_firestore_client()
        doc = await db.collection("users").document(uid).get()
        data = doc.to_dict() or {} if doc.exists else {}
        phone = data.get("phone", "")
        if not name:
            name = data.get("displayName") or data.get("name", "")
        if not email:
            email = data.get("email", "")
    except Exception:
        logger.warning("[UserProfile] Firestore lookup failed for uid=%s", uid)

    return {"name": name, "email": email, "phone": phone}


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
    except QuoteAlreadyApprovedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Quote for project '{project_id}' is already approved.",
        )
    except CheckpointError as e:
        logger.error(f"Checkpoint error: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e),
        )
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


async def _run_quote_approval(
    project_id: str, decision: str, notes: str, actor_uid: str
) -> ApproveQuoteResponse:
    """
    Phase 2 core logic: updates the Firestore checkpoint with the admin
    decision, resumes the graph, then (on approve) runs PDF generation +
    client delivery.

    Shared by two callers with different auth models:
      - POST /api/quote/{id}/approve (this module) — Firebase ID token,
        actor_uid = the admin's Firebase uid.
      - POST /internal/quote/approve (internal_quote_routes.py) — shared
        secret, actor_uid = the Streamlit admin console username (no
        Firebase user exists for that caller).

    CRITICAL: ainvoke(None, config) resumes — do NOT pass initial state.
    """
    logger.info(
        "Resuming HITL quote (ADK).",
        extra={"project_id": project_id, "decision": decision, "admin_uid": actor_uid},
    )

    try:
        from src.adk.hitl import approve_quote_hitl
        await approve_quote_hitl(
            project_id=project_id,
            decision=decision,
            notes=notes,
            admin_uid=actor_uid,
        )
    except QuoteNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No pending quote found for project '{project_id}'. Run /start first.",
        )
    except CheckpointError as e:
        logger.error(f"Checkpoint error during approve: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e),
        )
    except Exception:
        logger.exception("Unexpected error in approve_quote.", extra={"project_id": project_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error_code": "INTERNAL_ERROR", "project_id": project_id},
        )

    result_status = "completed" if decision == "approve" else "rejected"
    audit_action = AuditAction.QUOTE_APPROVE if decision == "approve" else AuditAction.QUOTE_REJECT
    emit_audit_event(
        audit_action, AuditResourceType.QUOTE, project_id,
        user_id=actor_uid, metadata={"decision": decision},
    )

    # ── Post-approval pipeline: PDF generation + client delivery ──────────
    if decision == "approve":
        try:
            quote_ref = _quote_doc_ref(project_id)
            quote_doc = await quote_ref.get()
            quote_data = (quote_doc.to_dict() or {}) if quote_doc.exists else {}
            quote_data["project_id"] = project_id
            if notes:
                quote_data["admin_notes"] = notes

            # 1. Generate PDF bytes once (sync ReportLab → run in thread),
            #    then upload for the 7-day signed link. The same bytes are
            #    attached to the delivery email — no re-download needed.
            pdf_service = PdfService()
            pdf_bytes = await asyncio.to_thread(pdf_service.generate_pdf_bytes, quote_data)
            pdf_url, pdf_blob_path = await asyncio.to_thread(
                pdf_service.upload_pdf, pdf_bytes, project_id
            )

            # 2. Save PDF URL + blob path to quote document.
            # The blob path powers the client area "Preventivi" section:
            # GET /quote/{id}/pdf mints fresh short-lived signed URLs from it.
            await quote_ref.update({"pdf_url": pdf_url, "pdf_blob_path": pdf_blob_path})
            logger.info("PDF generated and saved.", extra={"project_id": project_id, "pdf_url": pdf_url[:80]})

            # 3. Deliver to client (fire-and-forget — don't block the response).
            #    Recipient = the PROJECT OWNER's email (from Firebase Auth),
            #    not the admin performing the approval.
            owner_uid = await _resolve_project_owner_uid(project_id)
            client_email = ""
            if owner_uid:
                user_profile = await _get_user_profile(owner_uid)
                client_email = user_profile["email"]
            else:
                logger.warning(
                    "Cannot resolve project owner for delivery.",
                    extra={"project_id": project_id},
                )
            grand_total = quote_data.get("financials", {}).get("grand_total", 0.0)
            if client_email:
                notification = NotificationService()
                asyncio.create_task(
                    notification.deliver_quote_to_client(
                        project_id=project_id,
                        pdf_url=pdf_url,
                        client_email=client_email,
                        quote_total=grand_total,
                        pdf_bytes=pdf_bytes,
                    )
                )
        except Exception:
            # PDF/delivery failure must not break the approval response
            logger.error(
                "Post-approval pipeline failed (PDF/delivery).",
                extra={"project_id": project_id},
                exc_info=True,
            )

    return ApproveQuoteResponse(
        status=result_status,
        project_id=project_id,
        decision=decision,
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
    """
    _require_admin(user_session)
    return await _run_quote_approval(project_id, body.decision, body.notes, user_session.uid)


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

    is_admin = user_session.claims.get("role") == "admin"

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
            if not is_admin and quote_status != "approved":
                grand_total = 0.0

            proj_data = proj_doc.to_dict() or {}
            results.append(
                QuoteListItemResponse(
                    project_id=proj_doc.id,
                    project_name=proj_data.get("name", ""),
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
    is_admin = user_session.claims.get("role") == "admin"
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
