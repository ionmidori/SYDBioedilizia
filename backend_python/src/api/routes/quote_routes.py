"""
Quote HITL API Routes — Phase 1 (start) and Phase 2 (approve/reject).

Skill: langgraph-hitl-patterns — §FastAPI Endpoints (Phase 1 + Phase 2)

CRITICAL (from skill):
  - Phase 2 calls aupdate_state BEFORE ainvoke(None, config)
  - ainvoke(None, config) resumes from Firestore checkpoint
  - NEVER pass initial_state to ainvoke on resume
"""
from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from src.core.exceptions import (
    QuoteNotFoundError,
    QuoteAlreadyApprovedError,
    CheckpointError,
)
from src.graph.quote_graph import QuoteGraphFactory

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/quote", tags=["Quote HITL"])

# ─── Singleton graph (compiled once, reused per thread_id) ────────────────────
_factory = QuoteGraphFactory()
_graph = _factory.create_graph()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class StartQuoteResponse(BaseModel):
    status: str = "awaiting_admin_review"
    project_id: str
    message: str


class AdminDecisionBody(BaseModel):
    """
    Body for the admin approval/rejection endpoint.
    Skill: rule #11 — every tool/endpoint MUST use Pydantic args_schema.
    """
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


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post(
    "/{project_id}/start",
    response_model=StartQuoteResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start HITL quote flow (Phase 1)",
)
async def start_quote_flow(project_id: str) -> StartQuoteResponse:
    """
    Fase 1: runs the QuantitySurveyor node, then suspends at admin_review.
    State is persisted to Firestore via FirestoreSaver.

    Returns 202 Accepted — the flow is NOT complete: it awaits admin review.
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
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=exc.detail,
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


@router.post(
    "/{project_id}/approve",
    response_model=ApproveQuoteResponse,
    summary="Admin approve/reject HITL quote (Phase 2)",
)
async def approve_quote(project_id: str, body: AdminDecisionBody) -> ApproveQuoteResponse:
    """
    Fase 2: updates the Firestore checkpoint with the admin decision,
    then resumes the graph from where it was interrupted.

    CRITICAL: ainvoke(None, config) resumes — do NOT pass initial state.
    """
    config = {"configurable": {"thread_id": project_id}}

    logger.info(
        "Resuming HITL quote graph.",
        extra={"project_id": project_id, "decision": body.decision},
    )

    try:
        # Step A: inject admin decision into the persisted state
        await _graph.aupdate_state(
            config,
            {"admin_decision": body.decision, "admin_notes": body.notes},
        )

        # Step B: resume from checkpoint (pass None as input = resume pattern)
        await _graph.ainvoke(None, config)

    except QuoteNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No checkpoint found for project '{project_id}'. Run /start first.",
        )
    except CheckpointError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=exc.detail,
        )
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
