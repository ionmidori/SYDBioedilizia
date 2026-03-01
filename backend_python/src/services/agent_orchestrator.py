
import logging
import asyncio
import os
import re
from typing import AsyncGenerator, Dict, Any, List, Optional
from datetime import datetime
from urllib.parse import unquote, urlparse

from fastapi import HTTPException
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

from src.repositories.conversation_repository import ConversationRepository
from src.graph.agent import get_agent_graph
from src.graph.state import AgentState
from src.services.base_orchestrator import BaseOrchestrator
from src.utils.stream_protocol import (
    stream_text,
    stream_tool_call,
    stream_tool_result,
    stream_error
)
from src.utils.context import set_current_user_id, set_current_media_metadata, set_is_anonymous
from src.models.chat import MediaAttachment
from src.auth.jwt_handler import verify_token
from src.core.config import settings

logger = logging.getLogger(__name__)

from src.core.telemetry import trace_span

class AgentOrchestrator(BaseOrchestrator):
    """
    LangGraph implementation of BaseOrchestrator.

    Orchestrates the chat interaction:
    1. Prepares context (User, Media).
    2. Persists User Message.
    3. Runs Agent Graph (LangGraph astream_events v2).
    4. Streams events (Vercel Protocol).
    5. Persists AI/Tool Messages.

    Use LangGraphOrchestrator (alias below) as the canonical name in new code.
    """
    
    def __init__(self, repository: ConversationRepository):
        self.repo = repository
        # 🛡️ Prevent GC of fire-and-forget tasks
        self._background_tasks = set()

    async def stream_chat(
        self,
        request: Any, # Typed as ChatRequest in usage
        credentials: Any # HTTPAuthorizationCredentials
    ) -> AsyncGenerator[str, None]:
        """
        Main generator for the chat stream.
        """
        try:
            # ⚡ Send immediate keep-alive
            yield '0:"..."\n'

            # ✅ AUTH VERIFICATION (Zero Latency)
            try:
                user_session = verify_token(credentials)
                user_id = user_session.uid
            except Exception as auth_error:
                logger.warning(f"[Orchestrator] Auth failed: {auth_error}")
                async for chunk in stream_error("Authentication failed. Please refresh."):
                    yield chunk
                return

            # ✅ Context Setup
            set_current_user_id(user_id)
            set_is_anonymous(user_session.is_anonymous) 
            if request.media_metadata:
                 set_current_media_metadata(request.media_metadata)
            
            # 🔥 Ensure Session & Load History
            await self.repo.ensure_session(request.session_id, user_id=user_id)
            conversation_history = await self.repo.get_context(request.session_id, limit=10)
            logger.info(f"[Orchestrator] Loaded {len(conversation_history)} messages")
            
            # 🔥 Process User Message & Attachments
            latest_msg = request.messages[-1] if request.messages else None
            latest_user_message = latest_msg.model_dump() if hasattr(latest_msg, 'model_dump') else (latest_msg or {"role": "user", "content": ""})
            user_content = self._parse_content(latest_user_message.get("content", "") if isinstance(latest_user_message, dict) else getattr(latest_user_message, 'content', ""))
            # 🛡️ Sanitize user input against prompt injection
            user_content = self._sanitize_user_input(user_content)
            
            attachments_data, user_content_with_markers = self._process_attachments(request, user_id, user_content)
            
            # 🔥 Persist User Message
            await self.repo.save_message(
                request.session_id, 
                "user", 
                user_content_with_markers,
                attachments=attachments_data
            )
            
            # 🔥 Prepare LangChain Messages
            lc_messages = self._prepare_langchain_messages(
                conversation_history, 
                user_content_with_markers, 
                attachments_data, # Use data to reconstruct LC attachments if needed
                request # passed for native video check
            )
            
            # Prepare State
            state: AgentState = {
                "messages": lc_messages,
                "session_id": request.session_id,
                "user_id": user_id,
                "project_id": request.project_id, # 🌍 Context Injection
                "is_authenticated": user_session.is_authenticated and not user_session.is_anonymous # 🔥 Anonymous = Not Authenticated for Restricted Actions
            }
            
            # 🔥 Execute Graph & Stream
            accumulated_response = ""
            message_persisted = False  # A2 FIX: Prevent double-save
            agent_graph = get_agent_graph()
            
            # ✅ Initialize Status Handler
            from src.services.status_handler import GraphStatusHandler
            status_handler = GraphStatusHandler()
            
            # 🔄 astream_events for Granular Control (v2 API)
            async for event in agent_graph.astream_events(state, version="v2"):
                
                # 1. Status Events
                async for status_chunk in status_handler.process_event(event):
                    yield status_chunk

                kind = event.get("event")
                
                # 💬 Stream Text as it arrives (Low Latency)
                if kind == "on_chat_model_stream":
                    # 🛑 FILTER: Ignore Reasoning Tier output (internal JSON)
                    tags = event.get("tags", [])
                    name = event.get("name")
                    if "reasoning_tier" in tags or name == "reasoning_node" or name == "reasoning":
                        continue

                    content = event["data"]["chunk"].content
                    
                    # 🛡️ ROBUSTNESS: Handle content polymorphism (str vs list of dicts/str)
                    text_content = ""
                    if isinstance(content, str):
                        text_content = content
                    elif isinstance(content, list):
                        parts = []
                        for c in content:
                            if isinstance(c, str):
                                parts.append(c)
                            elif isinstance(c, dict) and "text" in c:
                                parts.append(c["text"])
                        text_content = "".join(parts)
                    
                    # 🛡️ FILTER THOUGHTS (Leaky CoT)
                    if text_content:
                        text_content = re.sub(r'<thought>.*?</thought>', '', text_content, flags=re.DOTALL)
                        text_content = re.sub(r'(?m)^Thought:.*$', '', text_content)

                    if text_content:
                         accumulated_response += text_content
                         async for stream_chunk in stream_text(text_content):
                             yield stream_chunk

                # A2 FIX: AI Message Persistence (INSIDE the loop)
                elif kind == "on_chat_model_end":
                    tags = event.get("tags", [])
                    if "reasoning_tier" not in tags:
                        output = event["data"]["output"]
                        if isinstance(output, AIMessage):
                            raw_content = output.content
                            
                            full_content = ""
                            if isinstance(raw_content, str):
                                full_content = raw_content
                            elif isinstance(raw_content, list):
                                 parts = []
                                 for c in raw_content:
                                     if isinstance(c, str):
                                         parts.append(c)
                                     elif isinstance(c, dict) and "text" in c:
                                         parts.append(c["text"])
                                 full_content = "".join(parts)
                            tool_calls = output.tool_calls
                            
                            serialized_tc = [
                                {"id": tc["id"], "name": tc["name"], "args": tc["args"]}
                                for tc in tool_calls
                            ] if tool_calls else []
                            
                            await self.repo.save_message(request.session_id, "assistant", full_content or "", tool_calls=serialized_tc)
                            message_persisted = True  # A2 FIX: Mark as saved
                            
                            if tool_calls:
                                 for tool_call in tool_calls:
                                    async for chunk in stream_tool_call(
                                        tool_call_id=tool_call.get("id", "unknown"),
                                        tool_name=tool_call.get("name", "unknown"),
                                        args=tool_call.get("args", {})
                                    ):
                                        yield chunk

                # A4: Tool Result Persistence (INSIDE the loop)
                elif kind == "on_tool_end":
                    tool_output = event.get("data", {}).get("output", "")
                    tool_name = event.get("name", "unknown")
                    output_str = str(tool_output) if tool_output else ""
                    
                    async for chunk in stream_tool_result(
                        tool_call_id=event.get("run_id", "unknown"),
                        result=output_str
                    ):
                        yield chunk

            # A2 FIX: Only persist from accumulated if on_chat_model_end didn't fire
            if not message_persisted:
                if accumulated_response:
                    await self.repo.save_message(request.session_id, "assistant", accumulated_response)
                    logger.info(f"[Orchestrator] Saved response ({len(accumulated_response)} chars)")
                else:
                    logger.warning("[Orchestrator] Agent finished without producing text or tool calls.")
                    fallback_msg = "Non sono riuscito a generare una risposta. Prova a riformulare la richiesta o controlla la connessione."
                    await self.repo.save_message(request.session_id, "assistant", fallback_msg)
                    async for chunk in stream_text(fallback_msg):
                        yield chunk

        except Exception as e:
            await self._handle_error(e)
            yield self._format_safe_error(e)

    def _process_attachments(self, request, user_id: str, base_content: str):
        """Handle legacy URLs and Native Video URIs."""
        attachments_data = []
        final_content = base_content
        
        media_urls = request.media_urls or request.image_urls
        media_types = request.media_types or []
        
        # 1. HTTP URLs
        if media_urls:
            for idx, url in enumerate(media_urls):
                mime_type = media_types[idx] if idx < len(media_types) else None
                guessed_type = "image"
                
                if not mime_type:
                    if any(url.lower().endswith(ext) for ext in ['.mp4', '.webm', '.mov', '.avi']):
                         guessed_type = "video"
                         mime_type = "video/mp4"
                    else:
                         mime_type = "image/jpeg"
                elif mime_type.startswith('video/'):
                     guessed_type = "video"
                
                attachment = MediaAttachment(
                    url=url,
                    media_type=guessed_type,
                    mime_type=mime_type
                )
                attachments_data.append(attachment.to_firestore())
                
                # Metadata persistence (async fire & forget)
                self._save_file_metadata_bg(request.session_id, user_id, url, guessed_type, mime_type)
                
                # Marker
                label = "Video allegato" if guessed_type == "video" else "Immagine allegata"
                final_content += f"\n\n[{label}: {url}]"

        # 2. Native Video URIs
        if request.video_file_uris:
            for video_uri in request.video_file_uris:
                attachment = MediaAttachment(
                    url=video_uri,
                    media_type="video",
                    mime_type="video/mp4",
                    file_uri=video_uri
                )
                attachments_data.append(attachment.to_firestore())
                final_content += f"\n\n[Video allegato: {video_uri}]"
                
        return attachments_data, final_content

    def _prepare_langchain_messages(self, history, user_content, current_attachments, request):
        """Construct conversation history for the Agent."""
        lc_messages = []
        
        # History
        for msg in history:
            role = msg.get("role")
            content = msg.get("content", "")
            attachments = msg.get("attachments", [])
            
            if role == "user":
                if not content and not attachments:
                    content = "..." # 🛡️ Prevent empty HumanMessage (API Error)

                if attachments:
                    multimodal_blocks = [{"type": "text", "text": content or "..."}] # Ensure text block exists
                    for att in attachments:
                        if att.get("media_type") == "image":
                            multimodal_blocks.append({"type": "image_url", "image_url": {"url": att["url"]}})
                        elif att.get("media_type") == "video" and att.get("file_uri"):
                            multimodal_blocks.append({"type": "file_data", "file_data": {"file_uri": att["file_uri"]}})
                    lc_messages.append(HumanMessage(content=multimodal_blocks))
                else:
                    lc_messages.append(HumanMessage(content=content))
            elif role == "assistant":
                tool_calls = msg.get("tool_calls")
                if tool_calls:
                    lc_messages.append(AIMessage(content=content or "", tool_calls=tool_calls))
                else:
                    lc_messages.append(AIMessage(content=content))
            elif role == "tool":
                lc_messages.append(ToolMessage(content=content, tool_call_id=msg.get("tool_call_id", "unknown")))
        
        # Current Message
        if current_attachments:
            multimodal_content = [{"type": "text", "text": user_content or "..."}]
            # Re-inject from request to get logic right (splitting legacy URL vs Native)
            # Actually we can just use the processed 'current_attachments' if we trust the structure
            # But the 'processed' ones are pure dicts.
            
            # Logic: If it has file_uri, it's native. If it's image URL, it's image_url.
            # If it's Video URL (legacy), it's just text marker (handled in user_content).
            
            for att in current_attachments:
                if att.get("media_type") == "image":
                     multimodal_content.append({"type": "image_url", "image_url": {"url": att["url"]}})
                elif att.get("media_type") == "video" and att.get("file_uri"):
                     multimodal_content.append({"type": "file_data", "file_data": {"file_uri": att["file_uri"]}})
            
            lc_messages.append(HumanMessage(content=multimodal_content))
        else:
            if not user_content:
                user_content = "..." # 🛡️ Prevent empty HumanMessage
            lc_messages.append(HumanMessage(content=user_content))
            
        return lc_messages

    def _save_file_metadata_bg(self, session_id, user_id, url, type_, mime_type):
        """Fire and forget save with strong reference tracking."""
        try:
             path = urlparse(url).path
             filename_raw = os.path.basename(path)
             filename = unquote(filename_raw) or f"File {datetime.now()}"
        except Exception:
             filename = f"File {datetime.now()}"

        async def _save_task():
             try:
                 await self.repo.save_file_metadata(
                    project_id=session_id,
                    file_data={
                        'url': url,
                        'type': type_,
                        'name': filename,
                        'size': 0,
                        'uploadedBy': user_id,
                        'mimeType': mime_type
                    }
                )
             except Exception as e:
                 logger.error(f"[Orchestrator] Bg metadata save failed: {e}")

        # 🛡️ Safe Fire-and-Forget
        task = asyncio.create_task(_save_task())
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    def _extract_text(self, content) -> str:
        if isinstance(content, str): return content
        if isinstance(content, list):
             return "\n".join([c if isinstance(c, str) else c.get("text", "") for c in content])
        return str(content)

    def _parse_content(self, raw):
        return self._extract_text(raw).strip()

    def _sanitize_user_input(self, content: str) -> str:
        """Strip system-level markers and prompt injection patterns from user input."""
        # Remove system context markers that could be used for injection
        content = re.sub(r'\[\[.*?\]\]', '', content)
        # Remove XML-like system/instruction tags
        content = re.sub(
            r'<(?:system|instruction|prompt|identity|mode|protocol|critical_protocols|reasoning_instructions|output_rules).*?>.*?</.*?>',
            '', content, flags=re.DOTALL
        )
        # Truncate excessively long messages
        max_length = 10000
        if len(content) > max_length:
            content = content[:max_length]
        return content.strip() or "..."

    async def _handle_error(self, e: Exception):
        import traceback
        logger.error(f"❌ ORCHESTRATOR ERROR: {str(e)}\n{traceback.format_exc()}")

    def _format_safe_error(self, e: Exception) -> str:
        """L1 FIX: Return formatted error string directly instead of broken async generator."""
        import json
        msg = str(e) if settings.ENV != "production" else "An internal error occurred."
        return f'3:{json.dumps(msg)}\n'

    # ── BaseOrchestrator contract ──────────────────────────────────────────────

    async def resume_interrupt(self, session_id: str, response: dict):  # type: ignore[override]
        """
        LangGraph HITL resume is handled directly in quote_routes.py via the
        quote_graph module, not through the orchestrator interface.
        This method exists for BaseOrchestrator contract compliance.
        ADKOrchestrator (Phase 1) will implement the full streaming resume here.
        """
        raise NotImplementedError(
            "LangGraph HITL resume is handled via quote_routes.py + quote_graph, "
            "not through the orchestrator. See src/api/routes/quote_routes.py."
        )

    async def health_check(self) -> bool:
        """Verify the LangGraph agent graph can be compiled."""
        try:
            get_agent_graph()
            return True
        except Exception as exc:
            logger.warning(f"[LangGraphOrchestrator] Health check failed: {exc}")
            return False


# ── Canonical alias (use in new code) ─────────────────────────────────────────
LangGraphOrchestrator = AgentOrchestrator


from fastapi import Depends
def get_orchestrator(
    repo: ConversationRepository = Depends(ConversationRepository)
) -> AgentOrchestrator:
    """Legacy dependency — prefer OrchestratorFactory.get_orchestrator() in new code."""
    return AgentOrchestrator(repo)
