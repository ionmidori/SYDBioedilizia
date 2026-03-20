"""
OrchestratorFactory: ADK-only orchestration backend (Phase 4 — LangGraph decommissioned).

Returns ADKOrchestrator directly. No dual-mode, no canary routing.

Performance: ADKOrchestrator is lazy-imported to defer the google.adk + google.genai
import chain (~2.8s) until the orchestrator is actually needed, rather than at module
load time. This cuts ~2.8s from the server import phase.

Thread safety: Uses double-checked locking so that background warm-up and the first
/chat/stream request never create duplicate ADKOrchestrator instances.

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
from __future__ import annotations

import threading
from typing import TYPE_CHECKING

from src.services.base_orchestrator import BaseOrchestrator

if TYPE_CHECKING:
    from src.adk.adk_orchestrator import ADKOrchestrator

_orchestrator: ADKOrchestrator | None = None
_lock = threading.Lock()


def _create_orchestrator() -> ADKOrchestrator:
    """Lazy-import and instantiate ADKOrchestrator.

    Defers the heavy google.adk + google.genai + vertexai import chain
    until the orchestrator is actually needed.
    """
    from src.adk.adk_orchestrator import ADKOrchestrator

    return ADKOrchestrator()


def warm_up_orchestrator() -> None:
    """Pre-initialize the ADKOrchestrator singleton during app lifespan.

    Thread-safe: acquires _lock so concurrent get_orchestrator() calls
    wait for warm-up to finish rather than creating a second instance.
    """
    global _orchestrator
    with _lock:
        if _orchestrator is None:
            _orchestrator = _create_orchestrator()


def get_orchestrator() -> BaseOrchestrator:
    """FastAPI dependency: Returns the ADKOrchestrator singleton.

    Double-checked locking: fast path (no lock) when warm-up is done,
    blocking path (with lock) if warm-up is still running — avoids
    duplicate Vertex AI initialization.

    FastAPI runs sync dependencies in a threadpool, so blocking on the
    lock does NOT block the event loop (health/ready endpoints stay responsive).
    """
    global _orchestrator
    if _orchestrator is not None:
        return _orchestrator
    with _lock:
        if _orchestrator is None:
            _orchestrator = _create_orchestrator()
        return _orchestrator
