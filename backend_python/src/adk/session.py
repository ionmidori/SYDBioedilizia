"""
Session & Artifact Services for ADK runner.

Sessions live in process memory (InMemorySessionService): they are lost on
restart and not shared between Cloud Run instances. Firestore
(`sessions/{id}/messages`) is the source of truth; the orchestrator rebuilds an
ADK session from it when the instance has none or holds an outdated one
(`adk_orchestrator._rehydrate_session`).

Artifact Service: InMemoryArtifactService stores tool-generated artifacts
(renders, PDFs) keyed by filename. Tools save via tool_context.save_artifact();
cross-agent access is automatic.
"""
import logging

from google.adk.artifacts import InMemoryArtifactService
from google.adk.sessions import InMemorySessionService

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

