"""
Firestore Session Service for ADK runner.
Manages Google ADK chat histories in Firestore to maintain GDPR compliance and data ownership.
"""
import logging
from google.adk.sessions import FirestoreSessionService
from src.core.config import settings

logger = logging.getLogger(__name__)

def get_session_service() -> FirestoreSessionService:
    """Returns the configured Firestore session service for the ADK runner."""
    project_id = settings.GOOGLE_CLOUD_PROJECT
    if not project_id:
        logger.warning("GOOGLE_CLOUD_PROJECT not set, defaulting to internal project.")
        project_id = "chatbotluca-a8a73"

    logger.info("Initializing ADK FirestoreSessionService", extra={"project_id": project_id})
    return FirestoreSessionService(
        project_id=project_id,
        collection="adk_sessions",
    )
