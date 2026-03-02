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

from src.services.base_orchestrator import BaseOrchestrator
from src.adk.agents import syd_orchestrator
from src.adk.session import get_session_service
from src.adk.filters import sanitize_before_agent, filter_agent_output
import httpx
import asyncio
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line (UI Message Stream protocol)."""
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
        credentials: Any,   # HTTPAuthorizationCredentials | None
    ) -> AsyncIterator[str]:
        """
        Streams response chunks from Vertex ADK Runner formatted for Vercel AI SDK.
        Supports multimodal parts integration and Vision Integration (Hybrid).
        """
        from src.core.config import settings

        user_id = "anonymous"
        if getattr(request, "user_session", None):
            user_id = request.user_session.uid

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
                    # Enterprise Security: SSRF Prevention - enforce storage domain
                    if settings.FIREBASE_STORAGE_BUCKET not in parsed_url.netloc:
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
            content_parts.append(types.Part(file_data=types.FileData(file_uri=uri, mime_type="video/mp4")))

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

            # UI Message Stream SSE protocol (AI SDK v6)
            msg_id = f"msg-{uuid.uuid4().hex[:12]}"
            text_part_id = f"txt-{uuid.uuid4().hex[:12]}"
            yield _sse({"type": "start", "messageId": msg_id})
            yield _sse({"type": "text-start", "id": text_part_id})

            async for event in self.runner.run_async(
                session_id=session_id,
                user_id=user_id,
                new_message=types.Content(parts=content_parts),
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            filtered = await filter_agent_output(part.text)
                            yield _sse({"type": "text-delta", "id": text_part_id, "delta": filtered})

            yield _sse({"type": "text-end", "id": text_part_id})
            yield _sse({"type": "finish-step"})
            yield _sse({"type": "finish"})
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("Error in ADKOrchestrator execution.")
            yield _sse({"type": "error", "error": str(e)})

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
            yield _sse({"type": "error", "error": "Invalid or expired resumption token"})
            return

        try:
            msg_id = f"msg-{uuid.uuid4().hex[:12]}"
            text_part_id = f"txt-{uuid.uuid4().hex[:12]}"
            yield _sse({"type": "start", "messageId": msg_id})
            yield _sse({"type": "text-start", "id": text_part_id})

            async for event in self.runner.run_async(
                session_id=session_id,
                user_id="admin",
                interrupt_response=response,
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            filtered = await filter_agent_output(part.text)
                            yield _sse({"type": "text-delta", "id": text_part_id, "delta": filtered})

            yield _sse({"type": "text-end", "id": text_part_id})
            yield _sse({"type": "finish-step"})
            yield _sse({"type": "finish"})
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("Error during ADK resume_interrupt.")
            yield _sse({"type": "error", "error": str(e)})

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
