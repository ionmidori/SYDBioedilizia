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


def get_orchestrator() -> BaseOrchestrator:
    """
    FastAPI dependency: Returns the ADKOrchestrator.
    """
    return ADKOrchestrator()
