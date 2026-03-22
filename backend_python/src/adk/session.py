"""
Session & Artifact Services for ADK runner.

ADK 1.27 ships VertexAiSessionService (managed by Vertex AI Agent Engine)
and InMemorySessionService (dev/test only).

Artifact Service (ADK 1.27+): InMemoryArtifactService stores tool-generated
artifacts (renders, PDFs) keyed by filename. Tools save via
tool_context.save_artifact(); cross-agent access is automatic.

GDPR note: VertexAiSessionService respects the region set in vertexai.init()
(ADK_LOCATION=europe-west1 in .env), so data stays in EU.
"""
import logging
from google.adk.sessions import InMemorySessionService
from google.adk.artifacts import InMemoryArtifactService

logger = logging.getLogger(__name__)

_session_service_instance = None
_artifact_service_instance = None


def get_session_service():
    """
    Returns the appropriate ADK session service based on environment.

    Returns a singleton so the Runner and stream_chat share the same in-memory store.
    """
    global _session_service_instance
    if _session_service_instance is not None:
        return _session_service_instance

    logger.info("Initializing InMemorySessionService for ADK Orchestrator (singleton)")
    _session_service_instance = InMemorySessionService()
    return _session_service_instance


def get_artifact_service():
    """
    Returns the ADK artifact service singleton.

    Tools use tool_context.save_artifact(filename, Part) to persist artifacts
    (renders, PDFs). The Runner wires this service so artifacts are accessible
    cross-agent within the same session.
    """
    global _artifact_service_instance
    if _artifact_service_instance is not None:
        return _artifact_service_instance

    logger.info("Initializing InMemoryArtifactService for ADK Orchestrator (singleton)")
    _artifact_service_instance = InMemoryArtifactService()
    return _artifact_service_instance

