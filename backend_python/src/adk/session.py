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

_session_service_instance = None


def get_session_service():
    """
    Returns the appropriate ADK session service based on environment.

    - production / staging → VertexAiSessionService (persistent, managed, EU region)
      Note: VertexAiSessionService only works if deployed to an Agent Engine natively.
    - development (no GCP project) → InMemorySessionService (ephemeral, for local dev)

    Returns a singleton so the Runner and stream_chat share the same in-memory store.
    """
    global _session_service_instance
    if _session_service_instance is not None:
        return _session_service_instance

    # In a FastAPI/CloudRun deployment without a deployed Reasoning Engine,
    # VertexAiSessionService raises:
    # "App name syd_orchestrator is not valid. It should either be the full ReasoningEngine resource name, or the reasoning engine id."
    # We must use InMemorySessionService and rely on our DB layer (conversation_repository.py) for storage
    logger.info("Initializing InMemorySessionService for ADK Orchestrator (singleton)")
    _session_service_instance = InMemorySessionService()
    return _session_service_instance

