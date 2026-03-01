"""
OrchestratorFactory: Runtime selection of chat orchestration backend.

Reads ORCHESTRATOR_MODE from settings to determine which BaseOrchestrator
implementation to instantiate:

  "langgraph" (default):
      LangGraphOrchestrator — current production implementation.
      Safe, battle-tested, no external dependencies beyond what's deployed.

  "vertex_adk" (Phase 1+, not yet implemented):
      ADKOrchestrator — Vertex AI Agent Builder implementation.
      Auto-fallback to LangGraph if health check fails.

Usage in FastAPI:
    from src.services.orchestrator_factory import get_orchestrator
    from src.services.base_orchestrator import BaseOrchestrator

    @app.post("/chat/stream")
    async def chat_stream(
        orchestrator: BaseOrchestrator = Depends(get_orchestrator),
        ...
    ):
        ...
"""

import logging
from fastapi import Depends
from src.services.base_orchestrator import BaseOrchestrator
from src.services.agent_orchestrator import LangGraphOrchestrator
from src.repositories.conversation_repository import ConversationRepository
from src.core.config import settings

logger = logging.getLogger(__name__)


def get_orchestrator(
    repo: ConversationRepository = Depends(ConversationRepository),
) -> BaseOrchestrator:
    """
    FastAPI dependency: selects the active orchestrator based on ORCHESTRATOR_MODE.

    Phase 0: "langgraph" only.
    Phase 1: "vertex_adk" with auto-fallback.
    """
    mode = settings.ORCHESTRATOR_MODE

    if mode == "langgraph":
        return LangGraphOrchestrator(repo)

    # Phase 1 placeholder: ADK support will be inserted here.
    # When vertex_adk is implemented, this block will:
    #   1. Instantiate ADKOrchestrator
    #   2. Call health_check() → fallback to LangGraph on failure
    if mode == "vertex_adk":
        logger.warning(
            "[OrchestratorFactory] ORCHESTRATOR_MODE=vertex_adk is not yet implemented "
            "(Phase 1). Falling back to langgraph."
        )
        return LangGraphOrchestrator(repo)

    logger.error(
        f"[OrchestratorFactory] Unknown ORCHESTRATOR_MODE='{mode}'. "
        "Falling back to langgraph. Valid values: langgraph, vertex_adk."
    )
    return LangGraphOrchestrator(repo)
