"""
BaseOrchestrator: Abstract interface for chat orchestration engines.

Defines the contract shared by all orchestration backends, enabling the
dual-mode architecture required for the LangGraph → Vertex AI ADK migration:

  - LangGraphOrchestrator (AgentOrchestrator): current production implementation
  - ADKOrchestrator: Vertex AI Agent Builder implementation (Phase 1+)

OrchestratorFactory selects the backend at runtime via ORCHESTRATOR_MODE env var.

Migration Phases:
  Phase 0 (current): LangGraph only, interface defined here
  Phase 1: ADKOrchestrator added, ORCHESTRATOR_MODE=vertex_adk in staging
  Phase 2: Full feature parity (HITL, multi-agent, MCPTool)
  Phase 3: Canary rollout (10% → 100%)
  Phase 4: LangGraph decommissioned
"""

from abc import ABC, abstractmethod
from typing import AsyncIterator, Any


class BaseOrchestrator(ABC):
    """
    Abstract base for all chat orchestration backends.

    Defines the interface that FastAPI endpoints depend on, enabling zero-downtime
    migration between orchestration engines without changing the API layer.

    Contract:
    - stream_chat() is the primary method (called by /chat/stream endpoint)
    - resume_interrupt() handles HITL admin approval flow
    - health_check() is called by OrchestratorFactory for auto-fallback

    Streaming Protocol:
    All methods yield Vercel AI protocol-formatted strings:
      text:    0:"token"\n
      error:   3:"message"\n
      tool:    b:{...}\n / a:{...}\n
    """

    @abstractmethod
    async def stream_chat(
        self,
        request: Any,       # ChatRequest (typed in concrete implementations)
        credentials: Any,   # HTTPAuthorizationCredentials | None
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
    async def resume_interrupt(
        self,
        session_id: str,
        response: dict,
    ) -> AsyncIterator[str]:
        """
        Resume an HITL (Human-in-the-Loop) interrupt.

        Called by the admin quote approval flow after the orchestrator
        has paused execution waiting for human review.

        Args:
            session_id: The paused session/thread identifier.
            response: Admin decision payload, e.g.:
                {"decision": "approve", "notes": "Approved with modifications"}
                {"decision": "reject", "reason": "Pricing too high"}

        Yields:
            Vercel AI protocol strings for the resumed execution stream.
        """
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """
        Verify the orchestrator is operational.

        Called by OrchestratorFactory before committing to an implementation.
        If this returns False, the factory falls back to LangGraphOrchestrator.

        Returns:
            True if the orchestrator is ready to handle requests.
        """
        ...
