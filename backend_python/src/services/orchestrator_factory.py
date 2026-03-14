"""
OrchestratorFactory: ADK-only orchestration backend (Phase 4 — LangGraph decommissioned).

Returns ADKOrchestrator directly. No dual-mode, no canary routing.

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

from src.services.base_orchestrator import BaseOrchestrator
from src.adk.adk_orchestrator import ADKOrchestrator


_orchestrator: ADKOrchestrator | None = None


def warm_up_orchestrator() -> None:
    """Pre-initialize the ADKOrchestrator singleton during app lifespan.

    Call this at startup so the first /chat/stream request doesn't pay
    the Vertex AI init + Runner creation cost (~1-2s).
    """
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = ADKOrchestrator()


def get_orchestrator() -> BaseOrchestrator:
    """
    FastAPI dependency: Returns the ADKOrchestrator singleton.
    """
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = ADKOrchestrator()
    return _orchestrator
