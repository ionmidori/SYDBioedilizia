"""
Session Service for ADK runner.

ADK 1.26 ships VertexAiSessionService (managed by Vertex AI Agent Engine)
and InMemorySessionService (dev/test only).

FirestoreSessionService is NOT available in ADK 1.26 — Vertex AI manages
session persistence when using VertexAiSessionService.

GDPR note: VertexAiSessionService respects the region set in vertexai.init()
(ADK_LOCATION=europe-west1 in .env), so data stays in EU.
"""
import logging
from google.adk.sessions import VertexAiSessionService, InMemorySessionService
from src.core.config import settings

logger = logging.getLogger(__name__)


def get_session_service():
    """
    Returns the appropriate ADK session service based on environment.

    - production / staging → VertexAiSessionService (persistent, managed, EU region)
    - development (no GCP project) → InMemorySessionService (ephemeral, for local dev)
    """
    project_id = settings.GOOGLE_CLOUD_PROJECT
    location = settings.ADK_LOCATION  # europe-west1 by default (GDPR)

    if not project_id:
        logger.warning(
            "GOOGLE_CLOUD_PROJECT not set — using InMemorySessionService. "
            "Sessions will NOT persist across restarts."
        )
        return InMemorySessionService()

    logger.info(
        "Initializing VertexAiSessionService",
        extra={"project_id": project_id, "location": location},
    )
    return VertexAiSessionService(project=project_id, location=location)
