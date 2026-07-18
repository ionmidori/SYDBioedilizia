"""
BaseOrchestrator: Abstract interface for chat orchestration engines.

Defines the contract for the ADK-only orchestration backend (Phase 4+ completed).
The sole concrete implementation is ADKOrchestrator (Vertex AI Agent Builder).

OrchestratorFactory returns the ADKOrchestrator singleton directly.
"""

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator


class BaseOrchestrator(ABC):
    """
    Abstract base for the chat orchestration engine.

    Defines the interface that FastAPI endpoints depend on.

    Contract:
    - stream_chat()       — primary streaming chat (called by /chat/stream)
    - health_check()      — liveness check

    Streaming Protocol: UI Message Stream SSE (Vercel AI SDK v6).
    """

    @abstractmethod
    def stream_chat(
        self,
        request: Any,        # ChatRequest (typed in concrete implementations)
        user_session: Any,   # UserSession (typed in concrete implementations)
        background_tasks: Any = None, # FastAPI BackgroundTasks
    ) -> AsyncIterator[str]:
        """
        Main streaming chat method — yields Vercel AI protocol chunks.

        Responsibilities (implementation-defined):
        1. JWT authentication & user context setup
        2. Session + conversation history loading
        3. User message parsing, sanitization, and attachment handling
        4. LLM/agent graph execution
        5. Streaming response chunks to client
        6. Message persistence to Firestore

        Yields:
            Vercel AI protocol strings (text tokens, tool calls, errors)
        """
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """
        Verify the orchestrator is operational.

        Returns:
            True if the orchestrator is ready to handle requests.
        """
        ...
