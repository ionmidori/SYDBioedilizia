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
import hashlib
from typing import AsyncIterator, Any
from fastapi import Depends
from src.services.base_orchestrator import BaseOrchestrator
from src.services.agent_orchestrator import LangGraphOrchestrator
from src.repositories.conversation_repository import ConversationRepository
from src.core.config import settings

logger = logging.getLogger(__name__)


class CanaryOrchestratorProxy(BaseOrchestrator):
    """
    Proxy orchestrator that sits in front of LangGraph and ADK, enabling:
    1. Canary routing (percentage-based traffic splitting for new sessions).
    2. Session draining (routing existing active sessions to their original engine).
    """

    def __init__(self, repo: ConversationRepository):
        self.repo = repo
        self.langgraph_orchest = LangGraphOrchestrator(repo)
        self.adk_orchest = None

        if settings.ORCHESTRATOR_MODE in ("vertex_adk", "canary"):
            try:
                from src.adk.adk_orchestrator import ADKOrchestrator
                self.adk_orchest = ADKOrchestrator()
                if settings.ORCHESTRATOR_MODE == "vertex_adk":
                    logger.info("[OrchestratorFactory] ORCHESTRATOR_MODE=vertex_adk. Using ADKOrchestrator.")
            except Exception as e:
                logger.error(f"[OrchestratorFactory] Failed to initialize ADKOrchestrator ({e}).")

    async def _get_target_orchestrator(self, session_id: str) -> BaseOrchestrator:
        """Deterministically select orchestrator based on session state and canary settings."""
        if settings.ORCHESTRATOR_MODE == "vertex_adk" and self.adk_orchest:
            return self.adk_orchest
        elif settings.ORCHESTRATOR_MODE == "langgraph" or not self.adk_orchest:
            return self.langgraph_orchest

        # Phase 3: Canary Mode
        # "Drenare sessioni HITL LangGraph in-flight":
        # Check if session exists. If so, default to LangGraph to safely finish it.
        try:
            messages = await self.repo.get_context(session_id, limit=1)
            if messages:
                logger.debug(f"[Canary] Session {session_id} exists. Draining via LangGraph.")
                return self.langgraph_orchest
        except Exception as e:
            logger.warning(f"[Canary] Failed to check session history ({e}). Defaulting to LangGraph.")
            return self.langgraph_orchest

        # New Session Traffic Splitting
        session_hash = int(hashlib.sha256(session_id.encode("utf-8")).hexdigest(), 16)
        percentile = session_hash % 100
        
        canary_percent = getattr(settings, "ADK_CANARY_PERCENT", 0)
        
        if percentile < canary_percent:
            logger.info(f"[Canary] Routing NEW session {session_id} to ADK ({percentile} < {canary_percent})")
            return self.adk_orchest
            
        return self.langgraph_orchest

    async def stream_chat(
        self,
        request: Any,
        credentials: Any,
    ) -> AsyncIterator[str]:
        target = await self._get_target_orchestrator(request.session_id)
        async for chunk in target.stream_chat(request, credentials):
            yield chunk

    async def resume_interrupt(
        self,
        session_id: str,
        response: dict,
    ) -> AsyncIterator[str]:
        target = await self._get_target_orchestrator(session_id)
        async for chunk in target.resume_interrupt(session_id, response):
            yield chunk

    async def health_check(self) -> bool:
        if settings.ORCHESTRATOR_MODE == "vertex_adk" and self.adk_orchest:
            return await self.adk_orchest.health_check()
        return await self.langgraph_orchest.health_check()


def get_orchestrator(
    repo: ConversationRepository = Depends(ConversationRepository),
) -> BaseOrchestrator:
    """
    FastAPI dependency: Returns the proxy orchestrator.
    """
    return CanaryOrchestratorProxy(repo)
