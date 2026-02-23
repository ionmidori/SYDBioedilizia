"""
HITL Quote Graph — LangGraph graph with FirestoreSaver + interrupt_before.

Skill: langgraph-hitl-patterns — §Core: Soft Interrupt + Resume Pattern
                               — §Graph Factory Pattern (rule #10)

Architecture:
  quantity_surveyor → [interrupt_before: admin_review] → admin_review → finalize → END
                                        ↑
                     Admin sends POST /quote/{project_id}/approve

CRITICAL (from skill GOTCHAS table):
  - Resume uses ainvoke(None, config) — NOT ainvoke(initial_state, config)
  - aupdate_state MUST be called BEFORE ainvoke(None, ...)
  - FirestoreSaver, NOT MemorySaver (MemorySaver is lost on restart)
"""
from __future__ import annotations

import logging
from typing import Any

from langgraph.graph import StateGraph, END

from src.graph.quote_state import QuoteState
from src.core.exceptions import CheckpointError, PDFGenerationError, DeliveryError

logger = logging.getLogger(__name__)


# ─── Checkpointer factory (per skill) ─────────────────────────────────────────

def get_checkpointer():
    """
    Returns a FirestoreSaver instance using project settings.

    Requires: langgraph-checkpoint-firestore
      uv add langgraph-checkpoint-firestore
    """
    try:
        from langgraph_checkpoint_firestore import FirestoreSaver
        from src.core.config import settings

        return FirestoreSaver(
            project_id=settings.GOOGLE_CLOUD_PROJECT,
            checkpoints_collection="langgraph_checkpoints",
            writes_collection="langgraph_writes",
        )
    except ImportError as exc:
        raise ImportError(
            "langgraph-checkpoint-firestore not installed. "
            "Run: uv add langgraph-checkpoint-firestore"
        ) from exc


# ─── Nodes ────────────────────────────────────────────────────────────────────

async def quantity_surveyor_node(state: QuoteState) -> dict[str, Any]:
    """
    Fase 1: Analizza la chat history e le foto del progetto per generare
    una bozza di preventivo usando Gemini Vision + Price Book.

    Output: ai_draft (InsightAnalysis.model_dump())

    Note: For cost optimization, uses gemini-2.5-flash-lite with temperature=0.1
          as recommended in QUANTITY_SURVEYOR.md.
    """
    from src.tools.quote_tools import suggest_quote_items_wrapper

    project_id: str = state["project_id"]
    logger.info("QS node: analyzing project.", extra={"project_id": project_id})

    try:
        # suggest_quote_items_wrapper already handles chat summary + SKU matching
        result_text = await suggest_quote_items_wrapper(
            session_id=project_id,  # uses project_id as thread identifier
            project_id=project_id,
            user_id="system",       # system-initiated, no end-user context
        )

        # Post-draft: notify admin via n8n so they can review in the console
        from src.tools.n8n_mcp_tools import notify_admin_wrapper
        await notify_admin_wrapper(
            project_id=project_id,
            estimated_value=0.0,   # Actual value extracted by admin in review
            urgency="normal",
        )

        # Store the raw analysis as the ai_draft (review page will render it)
        return {"ai_draft": {"summary": result_text}}
    except Exception as exc:
        logger.exception("QS node failed.", extra={"project_id": project_id})
        # Graceful degradation: return empty draft so admin can fill manually
        return {"ai_draft": {"summary": f"[AI Error — review manually]: {exc}"}}


async def admin_review_node(state: QuoteState) -> dict[str, Any]:
    """
    Fase 2 (stub): This node is interrupted BEFORE execution.
    Control returns to the API caller. State is persisted to Firestore.
    The admin console resumes this graph via POST /quote/{id}/approve.
    """
    # No-op: graph is interrupted before this node runs.
    return {}


async def finalize_node(state: QuoteState) -> dict[str, Any]:
    """
    Fase 3: PDF generation → Firebase Storage upload → n8n webhook → DB update.

    Runs AFTER admin approval (admin_decision == "approve").
    """
    project_id: str = state["project_id"]
    admin_notes: str = state.get("admin_notes", "")

    logger.info("Finalize node: starting approval pipeline.", extra={"project_id": project_id})

    # Import here to avoid circular deps at module level
    from src.services.admin_service import AdminService  # type: ignore[import]

    service = AdminService()
    try:
        service.approve_quote(project_id, admin_notes=admin_notes)
        # AdminService.approve_quote returns None and writes pdf_url to Firestore
        # We don't have the URL here without reading it back, so we log completion.
        logger.info("Finalize node: complete.", extra={"project_id": project_id})
        return {}
    except (PDFGenerationError, DeliveryError) as exc:
        logger.error(
            "Finalize node failed.",
            extra={"project_id": project_id, "error_code": exc.error_code},
        )
        raise


# ─── Edge: conditional routing after admin_review ────────────────────────────

def _route_after_review(state: QuoteState) -> str:
    decision = state.get("admin_decision")
    if decision == "approve":
        return "finalize"
    # reject / edit / None → end the graph
    return END


# ─── Graph Factory ────────────────────────────────────────────────────────────

class QuoteGraphFactory:
    """
    Instantiates the HITL quote graph per request.

    Skill: rule #10 — Graph Factory Pattern for DI and fresh state.
    Usage:
        factory = QuoteGraphFactory()
        graph = factory.create_graph()
        await graph.ainvoke({"project_id": pid, ...}, config)
    """

    def create_graph(self):
        """Build and compile the HITL quote graph with FirestoreSaver."""
        builder = StateGraph(QuoteState)

        builder.add_node("quantity_surveyor", quantity_surveyor_node)
        builder.add_node("admin_review", admin_review_node)
        builder.add_node("finalize", finalize_node)

        builder.set_entry_point("quantity_surveyor")
        builder.add_edge("quantity_surveyor", "admin_review")
        builder.add_conditional_edges(
            "admin_review",
            _route_after_review,
            {"finalize": "finalize", END: END},
        )
        builder.add_edge("finalize", END)

        checkpointer = get_checkpointer()
        return builder.compile(
            checkpointer=checkpointer,
            interrupt_before=["admin_review"],  # ← SOFT INTERRUPT (skill CRITICAL)
        )
