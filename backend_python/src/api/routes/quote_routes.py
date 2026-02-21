"""
Quote API Routes — HITL flow (start/approve) + CRUD (get/list/update/delete).

HITL Flow (LangGraph):
  - POST /{project_id}/start   — Phase 1: AI analysis → suspend at admin_review
  - POST /{project_id}/approve — Phase 2: inject decision → resume graph

CRUD (Firestore):
  - GET  /{project_id}         — Get quote by project
  - GET  /user/{user_id}       — List all quotes for a user
  - PATCH /{project_id}        — Update quote items/notes
  - DELETE /{project_id}       — Delete quote draft

Storage path: projects/{project_id}/private_data/quote
"""
from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from src.core.exceptions import (
    QuoteNotFoundError,
    QuoteAlreadyApprovedError,
    CheckpointError,
)
from src.graph.quote_graph import QuoteGraphFactory
from src.schemas.quote import QuoteItem, QuoteFinancials, QuoteSchema
from src.services.pricing_service import PricingService
from src.db.firebase_client import get_async_firestore_client
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/quote", tags=["Quote"])

# ─── Singleton graph (compiled once, reused per thread_id) ────────────────────
_factory = QuoteGraphFactory()
_graph = _factory.create_graph()


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


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _quote_doc_ref(project_id: str):
    """Canonical Firestore path: projects/{project_id}/private_data/quote."""
    db = get_async_firestore_client()
    return db.collection("projects").document(project_id).collection("private_data").document("quote")


# ─── HITL Endpoints ─────────────────────────────────────────────────────────

@router.post(
    "/{project_id}/start",
    response_model=StartQuoteResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start HITL quote flow (Phase 1)",
)
async def start_quote_flow(project_id: str) -> StartQuoteResponse:
    """
    Phase 1: runs the QuantitySurveyor node, then suspends at admin_review.
    State is persisted to Firestore via FirestoreSaver.
    Returns 202 Accepted.
    """
    config = {"configurable": {"thread_id": project_id}}
    logger.info("Starting HITL quote flow.", extra={"project_id": project_id})

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
    summary="Admin approve/reject HITL quote (Phase 2)",
)
async def approve_quote(project_id: str, body: AdminDecisionBody) -> ApproveQuoteResponse:
    """
    Phase 2: updates the Firestore checkpoint with the admin decision,
    then resumes the graph from where it was interrupted.
    CRITICAL: ainvoke(None, config) resumes — do NOT pass initial state.
    """
    config = {"configurable": {"thread_id": project_id}}
    logger.info(
        "Resuming HITL quote graph.",
        extra={"project_id": project_id, "decision": body.decision},
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


# ─── CRUD Endpoints ─────────────────────────────────────────────────────────

@router.get(
    "/{project_id}",
    response_model=QuoteSchema,
    summary="Get quote by project ID",
)
async def get_quote(project_id: str) -> QuoteSchema:
    """Retrieve the quote document for a project."""
    doc = await _quote_doc_ref(project_id).get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No quote found for project '{project_id}'.",
        )
    data = doc.to_dict()
    data["id"] = doc.id
    return QuoteSchema(**data)


@router.get(
    "/user/{user_id}",
    response_model=list[QuoteListItemResponse],
    summary="List all quotes for a user",
)
async def list_user_quotes(user_id: str) -> list[QuoteListItemResponse]:
    """List all quotes across projects owned by a user."""
    db = get_async_firestore_client()

    # Query all projects owned by this user
    projects_query = db.collection("projects").where("userId", "==", user_id)
    project_docs = await projects_query.get()

    results: list[QuoteListItemResponse] = []
    for proj_doc in project_docs:
        quote_ref = proj_doc.reference.collection("private_data").document("quote")
        quote_doc = await quote_ref.get()
        if quote_doc.exists:
            qdata = quote_doc.to_dict()
            financials = qdata.get("financials", {})
            items = qdata.get("items", [])
            updated = qdata.get("updated_at", "")
            if hasattr(updated, "isoformat"):
                updated = updated.isoformat()
            results.append(QuoteListItemResponse(
                project_id=proj_doc.id,
                status=qdata.get("status", "draft"),
                grand_total=financials.get("grand_total", 0.0),
                item_count=len(items),
                updated_at=str(updated),
            ))

    return results


@router.patch(
    "/{project_id}",
    response_model=QuoteSchema,
    summary="Update quote items or admin notes",
)
async def update_quote(project_id: str, body: QuoteUpdateBody) -> QuoteSchema:
    """
    Partial update of a quote. If items are changed, financials are recalculated
    deterministically via PricingService.
    """
    ref = _quote_doc_ref(project_id)
    doc = await ref.get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No quote found for project '{project_id}'.",
        )

    current = doc.to_dict()
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

    # Return refreshed document
    refreshed = await ref.get()
    data = refreshed.to_dict()
    data["id"] = refreshed.id
    return QuoteSchema(**data)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete quote draft",
)
async def delete_quote(project_id: str) -> None:
    """Delete a quote document. Only drafts should be deleted."""
    ref = _quote_doc_ref(project_id)
    doc = await ref.get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No quote found for project '{project_id}'.",
        )

    qdata = doc.to_dict()
    if qdata.get("status") in ("approved", "sent"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete a quote with status '{qdata.get('status')}'.",
        )

    await ref.delete()
