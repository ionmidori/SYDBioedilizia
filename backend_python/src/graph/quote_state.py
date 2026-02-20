"""
HITL QuoteState — TypedDict for the LangGraph quote approval graph.

Skill: langgraph-hitl-patterns — §State Design Rules
- MUST be TypedDict, not BaseModel (LangGraph requirement).
- Optional admin fields default to None.
- Never use MemorySaver in production → use FirestoreSaver.
"""
from __future__ import annotations

from typing import Literal, TypedDict


class QuoteState(TypedDict, total=False):
    """
    State for the HITL quote generation and approval graph.

    Lifecycle:
        1. quantity_surveyor node → populates ai_draft
        2. [interrupt_before admin_review] → persisted to FirestoreSaver
        3. Admin sets admin_decision via FastAPI endpoint
        4. finalize node → generates PDF, triggers n8n, updates DB
    """

    # ── Input ─────────────────────────────────────────────────────────────────
    project_id: str
    """Firestore document ID under projects/{project_id}."""

    # ── Quantity Surveyor output ───────────────────────────────────────────────
    ai_draft: dict
    """Structured output from Gemini Vision analysis (InsightAnalysis.model_dump())."""

    # ── Admin Decision (set via aupdate_state before resume) ──────────────────
    admin_decision: Literal["approve", "reject", "edit"] | None
    """Decision made by the admin in the console. None until human acts."""

    admin_notes: str
    """Optional notes from the admin, included in the PDF and stored on the quote."""

    # ── Finalize output ───────────────────────────────────────────────────────
    pdf_url: str
    """Signed Firebase Storage URL of the generated PDF (populated by finalize node)."""
