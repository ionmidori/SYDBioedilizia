"""
ADK Orchestrator implementation.
Wraps the Vertex API Agent Engine runner into the BaseOrchestrator interface for drop-in compatibility.

Stream format: UI Message Stream SSE (compatible with Vercel AI SDK v6 / @ai-sdk/react v3).
Protocol: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
"""
import json
import logging
import uuid
from typing import AsyncIterator, Any
from google.adk.runners import Runner
from google.genai import types
from google.adk.agents.run_config import RunConfig, StreamingMode
from src.services.base_orchestrator import BaseOrchestrator
from src.adk.agents import syd_orchestrator
from src.adk.session import get_session_service
from src.adk.filters import sanitize_before_agent, filter_agent_output
import httpx
import asyncio
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


from src.utils.stream_protocol import (
    stream_text, 
    stream_data, 
    stream_error,
    stream_status
)

def _sse(data: dict) -> str:
    """DEPRECATED. Use stream_protocol helpers instead."""
    return f"data: {json.dumps(data)}\n\n"

class ADKOrchestrator(BaseOrchestrator):
    def __init__(self):
        from src.core.config import settings
        import vertexai
        
        # P1 Requirement: EU Region constraint for ADK and CMEK Encryption
        logger.info(
            "Initializing Vertex AI for ADK", 
            extra={
                "project_id": settings.GOOGLE_CLOUD_PROJECT, 
                "location": settings.ADK_LOCATION,
                "cmek": bool(settings.ADK_CMEK_KEY_NAME)
            }
        )
        
        vertexai.init(
            project=settings.GOOGLE_CLOUD_PROJECT,
            location=settings.ADK_LOCATION
        )

        self.runner = Runner(
            app_name="syd_orchestrator",
            agent=syd_orchestrator,
            session_service=get_session_service(),
        )

    async def stream_chat(
        self,
        request: Any,       # ChatRequest
        user_session: Any,  # UserSession
    ) -> AsyncIterator[str]:
        """
        Main streaming chat method for Vertex AI Agent Builder.
        
        Responsibilities:
        - Use the already verified user_session (H1 fix)
        - Session + conversation history loading via ADK Session Service
        - Multimodal handling (GCS images/video integration)
        - Native ADK Runner execution (Agent Engine)
        - Vercel AI protocol SSE output (AI SDK v6)
        """
        from src.core.config import settings

        session_id = request.session_id
        user_id = user_session.uid

        # Handle message extraction (works with both request.message or request.messages[-1].content)
        user_message_text = getattr(request, "message", None)
        if not user_message_text and hasattr(request, "messages") and request.messages:
            last_msg_content = request.messages[-1].content
            user_message_text = last_msg_content if isinstance(last_msg_content, str) else str(last_msg_content)
            
        sanitized_input = await sanitize_before_agent(user_message_text or "")
        # FIX: Use the client's session_id to ensure chats don't mix up across projects
        session_id = getattr(request, "session_id", "default-session")
        
        # Multimodal Injection & Triage Trigger
        content_parts = [types.Part(text=sanitized_input)]
        
        media_urls = getattr(request, "media_urls", []) or []
        video_uris = getattr(request, "video_file_uris", []) or []
        media_types = getattr(request, "media_types", []) or []

        async with httpx.AsyncClient(timeout=5.0) as client:
            for i, url in enumerate(media_urls):
                try:
                    parsed_url = urlparse(url)
                    # Enterprise Security: SSRF Prevention - enforce storage domain (H3 fix)
                    if parsed_url.hostname != settings.FIREBASE_STORAGE_BUCKET:
                        logger.warning(f"Rejected invalid media URL source: {url}")
                        continue
                        
                    response = await client.get(url)
                    response.raise_for_status()
                    image_bytes = response.content
                    mime_type = media_types[i] if i < len(media_types) else "image/jpeg"
                    
                    # 1. Native GenAI Part
                    content_parts.append(types.Part(inline_data=types.Blob(mime_type=mime_type, data=image_bytes)))
                except Exception as e:
                    logger.error(f"Failed to fetch or process media URL {url}: {e}")
                    # Graceful degradation - proceed without this image

        # Handle Video File API URIs
        for uri in video_uris:
            # H2 FIX: SSRF validation for video URIs
            try:
                parsed_uri = urlparse(uri)
                if parsed_uri.scheme != "gs":
                    logger.warning(f"Rejected invalid video URI scheme: {uri}")
                    continue
                if parsed_uri.netloc != settings.FIREBASE_STORAGE_BUCKET:
                    logger.warning(f"Rejected invalid video URI bucket: {uri}")
                    continue
                content_parts.append(types.Part(file_data=types.FileData(file_uri=uri, mime_type="video/mp4")))
            except Exception as e:
                logger.error(f"Failed to process video URI {uri}: {e}")

        try:
            # Ensure session exists — ADK raises SessionNotFoundError otherwise
            session_service = get_session_service()
            session = await session_service.get_session(
                app_name="syd_orchestrator",
                user_id=user_id,
                session_id=session_id,
            )
            if session is None:
                await session_service.create_session(
                    app_name="syd_orchestrator",
                    user_id=user_id,
                    session_id=session_id,
                )
                logger.info("Created new ADK session", extra={"session_id": session_id, "user_id": user_id})

            async for event in self.runner.run_async(
                session_id=session_id,
                user_id=user_id,
                new_message=types.Content(parts=content_parts),
                run_config=RunConfig(streaming_mode=StreamingMode.SSE)
            ):
                # ── Handle Interrupts (HITL) ──
                if hasattr(event, "event_type") and event.event_type == "interrupt":
                    payload = {
                        "type": "interrupt",
                        "payload": getattr(event, "payload", {})
                    }
                    async for chunk in stream_data(payload):
                        yield chunk
                    continue

                # ── Handle Content (Text chunks) ──
                if getattr(event, 'partial', False) and event.content and event.content.parts:
                    has_text = any(hasattr(p, 'text') and p.text for p in event.content.parts)
                    has_fc = any(hasattr(p, 'function_call') and p.function_call for p in event.content.parts)

                    if has_text and not has_fc:
                        for part in event.content.parts:
                            if hasattr(part, 'text') and part.text:
                                filtered = await filter_agent_output(part.text)
                                async for chunk in stream_text(filtered):
                                    yield chunk
                                
        except Exception as e:
            logger.exception("Error in ADKOrchestrator execution.")
            async for chunk in stream_error("An internal error occurred while processing your request."):
                yield chunk

    async def resume_interrupt(
        self,
        session_id: str,
        response: dict,
        admin_uid: str = "unknown",
    ) -> AsyncIterator[str]:
        """HITL interrupt resumption.

        Args:
            session_id: The paused session identifier (matches project_id).
            response: Admin decision payload with 'token', 'decision', 'notes'.
            admin_uid: The authenticated admin's UID for audit trail attribution.
        """
        project_id = session_id  # Assuming session_id matches project_id in our architecture
        provided_token = response.get("token")

        from src.adk.hitl import verify_resumption_token

        # Verify cryptographically secure token first
        if not provided_token or not await verify_resumption_token(project_id, provided_token):
            async for chunk in stream_error("Invalid or expired resumption token"):
                yield chunk
            return

        try:
            async for event in self.runner.run_async(
                session_id=session_id,
                user_id=admin_uid,
                interrupt_response=response,
            ):
                # Handle Interrupts nested in resumption
                if hasattr(event, "event_type") and event.event_type == "interrupt":
                    payload = {
                        "type": "interrupt",
                        "payload": getattr(event, "payload", {})
                    }
                    async for chunk in stream_data(payload):
                        yield chunk
                    continue

                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            filtered = await filter_agent_output(part.text)
                            async for chunk in stream_text(filtered):
                                yield chunk
        except Exception as e:
            logger.exception("Error during ADK resume_interrupt.")
            async for chunk in stream_error("An internal error occurred while resuming the session."):
                yield chunk

    async def health_check(self) -> bool:
        """Verifies if the Vertex AI ADK backend is accessible by listing sessions."""
        try:
            session_service = get_session_service()
            # Attempt a lightweight Firestore read to verify connectivity
            await session_service.list_sessions(user_id="__healthcheck__", app_name="syd_orchestrator")
            return True
        except Exception as e:
            logger.warning(f"[ADKOrchestrator] Health check failed: {e}")
            return False
