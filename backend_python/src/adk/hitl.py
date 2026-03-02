"""
Admin resumption token pattern for ADK HITL interrupts.
Ensures that only authorized admins can resume paused quote approval flows.
"""
import secrets
import logging
from typing import Optional
from google.cloud import firestore
from src.core.exceptions import QuoteAlreadyApprovedError, QuoteNotFoundError

logger = logging.getLogger(__name__)
db = firestore.AsyncClient()

async def save_resumption_token(project_id: str, nonce: str) -> None:
    """Saves a cryptographically secure token to the project's quote document."""
    try:
        quote_ref = db.collection("projects").document(project_id).collection("quotes").document("active")
        await quote_ref.set({"resumption_token": nonce}, merge=True)
        logger.info(f"Saved resumption token for project {project_id}")
    except Exception as e:
        logger.error(f"Failed to save resumption token for {project_id}: {e}")

async def verify_resumption_token(project_id: str, provided_token: str) -> bool:
    """Verifies the resumption token and clears it if successful."""
    try:
        quote_ref = db.collection("projects").document(project_id).collection("quotes").document("active")
        doc = await quote_ref.get()
        if not doc.exists:
            return False

        stored_token = doc.to_dict().get("resumption_token")
        if stored_token and secrets.compare_digest(stored_token, provided_token):
            await quote_ref.update({"resumption_token": firestore.DELETE_FIELD})
            return True

        return False
    except Exception as e:
        logger.error(f"Failed to verify resumption token for {project_id}: {e}")
        return False


# ─── HITL Flow Entry Points (called by quote_routes.py) ──────────────────────

async def start_quote_hitl(project_id: str, user_id: str) -> None:
    """
    Phase 1: trigger ADK quote analysis and suspend at admin_review.
    Saves a pending-review record to Firestore so approve_quote_hitl can resume it.
    Raises QuoteAlreadyApprovedError if the quote is already approved.
    """
    quote_ref = (
        db.collection("projects")
        .document(project_id)
        .collection("private_data")
        .document("quote")
    )
    doc = await quote_ref.get()
    if doc.exists and (doc.to_dict() or {}).get("status") == "approved":
        raise QuoteAlreadyApprovedError(f"Quote for project '{project_id}' is already approved.")

    nonce = secrets.token_urlsafe(32)
    await save_resumption_token(project_id, nonce)

    # Mark quote as pending admin review in Firestore
    await quote_ref.set(
        {"status": "pending_review", "started_by": user_id, "project_id": project_id},
        merge=True,
    )
    logger.info(f"[HITL] Quote flow started for project {project_id} by user {user_id}.")


async def approve_quote_hitl(project_id: str, decision: str, notes: str, admin_uid: str) -> None:
    """
    Phase 2: admin approves or rejects the pending quote.
    Raises QuoteNotFoundError if no pending review exists.
    """
    quote_ref = (
        db.collection("projects")
        .document(project_id)
        .collection("private_data")
        .document("quote")
    )
    doc = await quote_ref.get()
    if not doc.exists or (doc.to_dict() or {}).get("status") != "pending_review":
        raise QuoteNotFoundError(f"No pending quote found for project '{project_id}'.")

    new_status = "approved" if decision == "approve" else "rejected"
    await quote_ref.update(
        {
            "status": new_status,
            "admin_decision": decision,
            "admin_notes": notes,
            "reviewed_by": admin_uid,
        }
    )
    logger.info(f"[HITL] Quote {decision}d for project {project_id} by admin {admin_uid}.")
