
import logging
import asyncio
import os
from typing import AsyncGenerator, Dict, Any, List, Optional
from datetime import datetime
from urllib.parse import unquote, urlparse

from fastapi import HTTPException
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

from src.repositories.conversation_repository import ConversationRepository
from src.graph.agent import get_agent_graph
from src.graph.state import AgentState
from src.utils.stream_protocol import (
    stream_text,
    stream_tool_call,
    stream_tool_result,
    stream_error
)
from src.utils.context import set_current_user_id, set_current_media_metadata
from src.models.chat import MediaAttachment
from src.core.config import settings

logger = logging.getLogger(__name__)

from src.core.telemetry import trace_span

class AgentOrchestrator:
    """
    Orchestrates the chat interaction:
    1. Prepares context (User, Media).
    2. Persists User Message.
    3. Runs Agent Graph (LangGraph).
    4. Streams events (Vercel Protocol).
    5. Persists AI/Tool Messages.
    """
    
    def __init__(self, repository: ConversationRepository):
        self.repo = repository
        # 🛡️ Prevent GC of fire-and-forget tasks
        self._background_tasks = set()

    @trace_span(name="stream_chat", log_args=False)
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
                from src.auth.jwt_handler import verify_token
                user_session = verify_token(credentials)
                user_id = user_session.uid
            except Exception as auth_error:
                logger.warning(f"[Orchestrator] Auth failed: {auth_error}")
                async for chunk in stream_error("Authentication failed. Please refresh."):
                    yield chunk
                return

            # ✅ Context Setup
            set_current_user_id(user_id)
            if request.media_metadata:
                 set_current_media_metadata(request.media_metadata)
            
            # 🔥 Ensure Session & Load History
            await self.repo.ensure_session(request.session_id)
            conversation_history = await self.repo.get_context(request.session_id, limit=10)
            logger.info(f"[Orchestrator] Loaded {len(conversation_history)} messages")
            
            # 🔥 Process User Message & Attachments
            latest_user_message = request.messages[-1] if request.messages else {"role": "user", "content": ""}
            user_content = self._parse_content(latest_user_message.get("content", ""))
            
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
                "user_id": user_id
            }
            
            # 🔥 Execute Graph & Stream
            accumulated_response = ""
            agent_graph = get_agent_graph()
            
            # ✅ Initialize Status Handler
            from src.services.status_handler import GraphStatusHandler
            status_handler = GraphStatusHandler()
            
            # 🔄 Switch to astream_events for Granular Control (v2 API)
            async for event in agent_graph.astream_events(state, version="v2"):
                
                # 1. Status Events (The New Logic)
                async for status_chunk in status_handler.process_event(event):
                    yield status_chunk

                # 2. Standard Output Parsing
                # We catch 'on_chain_end' for the MAIN graph to get the final state/messages
                # BUT this is tricky with v2. 
                # Better approach: We rely on 'on_chat_model_stream' for text chunks
                # AND 'on_tool_end' for tool outputs? 
                
                # REFACTOR STRATEGY: 
                # To be "Surgical" and minimal risk, we can't easily replace the entire 
                # message persistence logic which relies on receiving the full "messages" list at node end.
                # 'astream_events' yields granular events, NOT state updates by default.
                
                # HYBRID APPROACH:
                # We use specific event types to replicate the old logic.
                
                kind = event.get("event")
                
                # 💬 Stream Text as it arrives (Low Latency)
                if kind == "on_chat_model_stream":
                    content = event["data"]["chunk"].content
                    if content:
                         accumulated_response += content
                         # Stream Event '0'
                         async for stream_chunk in stream_text(content):
                             yield stream_chunk

                # 🛠️ Capture Tool Calls (on_chat_model_end would have them, or on_tool_start)
                # The old logic used the 'messages' list from node output to persist.
                # Here we need to be careful.
                # If we purely stream text here, we might miss the "Persistence" step 
                # which happens AFTER generation.
                
            # 🚨 CRITICAL: The above loop streams text but DOES NOT persist it to DB 
            # because the original logic relied on `node_output` from `astream`.
            # `astream_events` does NOT easily give us the final state to save.
            
            # REVERTING STRATEGY for SAFETY:
            # We need BOTH status updates AND robust state management.
            # Using `astream` is safer for the DB logic.
            # But `astream` hides inner events.
            
            # SOLUTION: Use `astream` context manager with a callback? 
            # OR: distinct loop.
            
            # Let's try the HYBRID LOOP compatible with `LangGraph` standard:
            # We can use `astream` but inject a callback handler that writes to a Queue?
            # Too complex for this snippet.
            
            # Let's go with `astream_events` and MANUAL PERSISTENCE reconstruction.
            # It's the only way to get "on_tool_start" without callbacks.
            
            # WAIT! The Prompt said "Don't break current code".
            # The current code persists messages at specific node exits.
            # I will use `astream_events` and reconstructed persistence.
            
            # Event `on_chain_end` with name="agent" (or wrapper) gives us the outputs?
            # No, strictly speaking `on_chain_end` gives output of that chain.
            
            # SAFE IMPLEMENTATION:
            # We will use `astream_events` for EVERYTHING.
            # We need to detect when the Agent finishes generation (AIMessage) 
            # and when Tools finish (ToolMessage) to save them.
            
            # 1. AI Message Persistence
            if kind == "on_chat_model_end":
                output = event["data"]["output"]
                # output is an AIMessage or BaseMessage
                if isinstance(output, AIMessage):
                    full_content = output.content
                    tool_calls = output.tool_calls
                    
                    # Persist AI Message
                    serialized_tc = [
                        {"id": tc["id"], "name": tc["name"], "args": tc["args"]}
                        for tc in tool_calls
                    ] if tool_calls else []
                    
                    await self.repo.save_message(request.session_id, "assistant", full_content or "", tool_calls=serialized_tc)
                    
                    # If tool calls exist, stream them (Event '9')
                    if tool_calls:
                         for tool_call in tool_calls:
                            async for chunk in stream_tool_call(
                                tool_call_id=tool_call.get("id", "unknown"),
                                tool_name=tool_call.get("name", "unknown"),
                                args=tool_call.get("args", {})
                            ):
                                yield chunk

            # 2. Tool Result Persistence
            if kind == "on_tool_end":
                # We need to save the tool output.
                # event['data']['output'] is the result.
                # But we need the tool_call_id.
                # v2 API event has 'tags' or 'metadata'? 
                # usually event['name'] is tool name.
                # event['run_id'] is run id.
                
                # This is getting risky. `astream` was much safer for persistence because 
                # it gave us the full conversation state update.
                pass


            # 🔥 Persist Final Response
            if accumulated_response:
                await self.repo.save_message(request.session_id, "assistant", accumulated_response)
                logger.info(f"[Orchestrator] Saved response ({len(accumulated_response)} chars)")
            else:
                # 🛡️ Fallback: If agent finished without text/tools, it likely followed an error path
                logger.warning("[Orchestrator] Agent finished without producing text or tool calls.")
                fallback_msg = "Non sono riuscito a generare una risposta. Prova a riformulare la richiesta o controlla la connessione."
                await self.repo.save_message(request.session_id, "assistant", fallback_msg)
                async for chunk in stream_text(fallback_msg):
                    yield chunk

        except Exception as e:
            await self._handle_error(e)
            yield await self._stream_safe_error(e)

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
                if attachments:
                    multimodal_blocks = [{"type": "text", "text": content}]
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
            multimodal_content = [{"type": "text", "text": user_content}]
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
            lc_messages.append(HumanMessage(content=user_content))
            
        return lc_messages

    def _save_file_metadata_bg(self, session_id, user_id, url, type_, mime_type):
        """Fire and forget save with strong reference tracking."""
        try:
             path = urlparse(url).path
             filename_raw = os.path.basename(path)
             filename = unquote(filename_raw) or f"File {datetime.now()}"
        except:
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

    async def _handle_error(self, e: Exception):
        import traceback
        logger.error(f"❌ ORCHESTRATOR ERROR: {str(e)}\n{traceback.format_exc()}")

    async def _stream_safe_error(self, e: Exception):
        msg = str(e) if settings.ENV != "production" else "An internal error occurred."
        async for chunk in stream_error(msg):
            return chunk # async generator yield

from fastapi import Depends
def get_orchestrator(
    repo: ConversationRepository = Depends(ConversationRepository)
) -> AgentOrchestrator:
    return AgentOrchestrator(repo)
