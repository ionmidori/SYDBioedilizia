"""
ADK Orchestrator implementation.
Wraps the Vertex API Agent Engine runner into the BaseOrchestrator interface for drop-in compatibility.
"""
import json
import logging
from typing import AsyncIterator, Any
from google.adk.runners import Runner
from google.adk import types

from src.services.base_orchestrator import BaseOrchestrator
from src.adk.agents import syd_orchestrator
from src.adk.session import get_session_service
from src.adk.filters import sanitize_before_agent, filter_agent_output

logger = logging.getLogger(__name__)

class ADKOrchestrator(BaseOrchestrator):
    def __init__(self):
        self.runner = Runner(
            agent=syd_orchestrator,
            session_service=get_session_service(),
        )

    async def stream_chat(
        self,
        request: Any,       # ChatRequest
        credentials: Any,   # HTTPAuthorizationCredentials | None
    ) -> AsyncIterator[str]:
        """
        Streams response chunks from Vertex ADK Runner formatted for Vercel AI SDK.
        """
        user_id = "anonymous"
        if getattr(request, "user_session", None):
            user_id = request.user_session.uid

        # P2 Requirement: Input Sanitization
        sanitized_input = await sanitize_before_agent(request.message)

        session_id = request.project_id or "default-session"
        
        try:
            # Note: run_async yields stream chunks containing parts
            async for event in self.runner.run_async(
                session_id=session_id,
                user_id=user_id,
                new_message=types.Content(parts=[types.Part(text=sanitized_input)]),
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            # P2 Requirement: Output Filtering Layer
                            filtered = await filter_agent_output(part.text)
                            # Yield Vercel AI Text Chunk
                            yield f'0:{json.dumps(filtered)}\n'
        except Exception as e:
            logger.exception("Error in ADKOrchestrator execution.")
            yield f'3:{json.dumps(str(e))}\n'

    async def resume_interrupt(
        self,
        session_id: str,
        response: dict,
    ) -> AsyncIterator[str]:
        """HITL interrupt resumption."""
        project_id = session_id  # Assuming session_id matches project_id in our architecture
        provided_token = response.get("token")
        
        from src.adk.hitl import verify_resumption_token
        
        # Verify cryptographically secure token first
        if not provided_token or not await verify_resumption_token(project_id, provided_token):
            yield f'3:{json.dumps("Invalid or expired resumption token")}\n'
            return

        try:
            # P2 Requirement: Resume the runner execution
            # Note: run_async on a resumed context yields the rest of the stream
            async for event in self.runner.run_async(
                session_id=session_id,
                user_id="admin",
                interrupt_response=response,
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            filtered = await filter_agent_output(part.text)
                            yield f'0:{json.dumps(filtered)}\n'
        except Exception as e:
            logger.exception("Error during ADK resume_interrupt.")
            yield f'3:{json.dumps(str(e))}\n'

    async def health_check(self) -> bool:
        """Verifies if the Agent Builder backend is accessible."""
        # Simple healthcheck placeholder
        return True
