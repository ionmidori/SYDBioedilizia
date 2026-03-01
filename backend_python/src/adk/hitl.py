"""
Admin resumption token pattern for ADK HITL interrupts.
Ensures that only authorized admins can resume paused quote approval flows.
"""
import secrets
import logging
from typing import Optional
from google.cloud import firestore

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
            # Token valid, clear it to prevent reuse
            await quote_ref.update({"resumption_token": firestore.DELETE_FIELD})
            return True
            
        return False
    except Exception as e:
        logger.error(f"Failed to verify resumption token for {project_id}: {e}")
        return False
