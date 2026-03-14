"""
ADK Orchestrator implementation.
Wraps the Vertex API Agent Engine runner into the BaseOrchestrator interface for drop-in compatibility.

Stream format: Data Stream Protocol v1 (compatible with Vercel AI SDK v6 / @ai-sdk/react v3).
Protocol: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol#data-stream-protocol
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
from src.repositories.conversation_repository import get_conversation_repository
import httpx
import asyncio
import time
from urllib.parse import urlparse
from google.adk.events import Event, EventActions

logger = logging.getLogger(__name__)


from src.utils.stream_protocol import (
    stream_text,
    stream_data,
    stream_error,
    stream_status,
    stream_tool_call,
    stream_tool_result,
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
        background_tasks: Any = None,  # FastAPI BackgroundTasks (unused here, required by BaseOrchestrator)
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

        # 0. Stream status immediately to unlock UI
        async for chunk in stream_status("Syd sta analizzando la tua richiesta..."):
            yield chunk

        # Extract user message from the messages array
        user_message_text = ""
        if hasattr(request, "messages") and request.messages:
            last_msg_content = request.messages[-1].content
            user_message_text = last_msg_content if isinstance(last_msg_content, str) else str(last_msg_content)
            
        sanitized_input = await sanitize_before_agent(user_message_text or "")
        # FIX: Use the client's session_id to ensure chats don't mix up across projects
        session_id = getattr(request, "session_id", "default-session")
        
        # ────────── SYSTEM CONTEXT INJECTION (Auth State) ──────────
        # Since ADK agents have static instructions, we must inject dynamic state 
        # (like authentication status) into the user's message payload.
        is_guest = user_session.is_anonymous or not user_session.is_authenticated
        auth_status_msg = (
            "STATO AUTENTICAZIONE: L'utente è un OSPITE ANONIMO. Se richiede salvataggi di progetti, preventivi definitivi o azioni che richiedono un account, DEVI usare il tool request_login_adk."
            if is_guest else
            "STATO AUTENTICAZIONE: L'utente è GIA' LOGGATO con un account verificato. NON DEVI MAI USARE il tool request_login_adk per nessun motivo."
        )
        logger.info(f"[ADK] Auth injection: is_guest={is_guest}, uid={user_id}")
        system_context = f"[SYSTEM_MESSAGE]\n{auth_status_msg}\n[END_SYSTEM_MESSAGE]\n\n"
        
        # Apply the Sandwich Defense boundary delimiters to the clean input
        delimited_input = f"{system_context}###\n{sanitized_input}\n###"
        
        # Multimodal Injection & Triage Trigger
        content_parts = [types.Part(text=delimited_input)]
        
        media_urls = getattr(request, "media_urls", []) or []
        video_uris = getattr(request, "video_file_uris", []) or []
        media_types = getattr(request, "media_types", []) or []

        # Optimized Media Fetching: Parallelize using asyncio.gather
        async def fetch_media(i, url, mime=None):
            try:
                parsed_url = urlparse(url)
                bucket = settings.FIREBASE_STORAGE_BUCKET or ""
                # Firebase Storage URLs can be either:
                # - https://storage.googleapis.com/{bucket}/{path}  (bucket in path)
                # - https://{bucket}.firebasestorage.app/{path}     (bucket in hostname)
                # Both must reference our configured bucket for security.
                hostname_ok = parsed_url.hostname == bucket
                path_ok = bucket and parsed_url.hostname == "storage.googleapis.com" and parsed_url.path.startswith(f"/{bucket}/")
                if not (hostname_ok or path_ok):
                    logger.warning(f"Rejected invalid media URL source: {url}")
                    return None
                
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.get(url)
                    response.raise_for_status()
                    image_bytes = response.content
                    final_mime = mime or (media_types[i] if i < len(media_types) else "image/jpeg")
                    logger.info(f"[ADK] Fetched media {i}: {len(image_bytes)} bytes ({final_mime})")
                    # Return both the image data and a text hint so the agent knows the source URL
                    img_part = types.Part(inline_data=types.Blob(mime_type=final_mime, data=image_bytes))
                    hint_part = types.Part(text=f"\n[URL Immagine Caricata per riferimento o tool: {url}]\n")
                    return [img_part, hint_part]
            except Exception as e:
                logger.error(f"Failed to fetch media {url}: {e}")
                return None

        # Handle Video File API URIs (local check, no download)
        for uri in video_uris:
            try:
                parsed_uri = urlparse(uri)
                if parsed_uri.scheme == "gs" and parsed_uri.netloc == settings.FIREBASE_STORAGE_BUCKET:
                    content_parts.append(types.Part(file_data=types.FileData(file_uri=uri, mime_type="video/mp4")))
            except Exception:
                pass

        # Execute parallel fetch using TaskGroup (Python 3.12+): auto-cancels on exception
        if media_urls:
            logger.info(f"[ADK] Parallel fetching {len(media_urls)} media items...")
            async with asyncio.TaskGroup() as tg:
                task_objs = [tg.create_task(fetch_media(i, url)) for i, url in enumerate(media_urls)]
            for t in task_objs:
                p_list = t.result()
                if p_list is not None:
                    if isinstance(p_list, list):
                        content_parts.extend(p_list)
                    else:
                        content_parts.append(p_list)

        try:
            # Ensure session exists — ADK raises SessionNotFoundError otherwise
            session_service = get_session_service()
            try:
                session = await session_service.get_session(
                    app_name="syd_orchestrator",
                    user_id=user_id,
                    session_id=session_id,
                )
            except Exception as e:
                if type(e).__name__ == "SessionNotFoundError" or "Session not found" in str(e):
                    session = None
                else:
                    raise e
            
            if session is None:
                session = await session_service.create_session(
                    app_name="syd_orchestrator",
                    user_id=user_id,
                    session_id=session_id,
                )
                logger.info("Created new ADK session", extra={"session_id": session_id, "user_id": user_id})

                # ── HISTORY INJECTION (Restart Recovery) ──
                # On server restart, InMemorySessionService loses all context.
                # Re-inject the last 30 Firestore messages as ADK Events so the
                # agent can continue mid-conversation (e.g., knows the room analysis
                # for generate_render) without asking the user to repeat themselves.
                try:
                    repo = get_conversation_repository()
                    history = await repo.get_context(session_id, limit=30)
                    if history:
                        events_to_inject = []
                        for idx, msg in enumerate(history):
                            role = msg.get("role", "user")
                            text = msg.get("content", "").strip()
                            if not text:
                                continue
                            hist_event = Event(
                                invocation_id=f"history_restore_{int(time.time() * 1000)}_{idx}",
                                author=role,
                                content=types.Content(
                                    role=role,
                                    parts=[types.Part(text=text)],
                                ),
                                actions=EventActions(),
                            )
                            events_to_inject.append(hist_event)
                        # Parallel injection: ~10x faster than sequential await loop
                        if events_to_inject:
                            await asyncio.gather(*(
                                session_service.append_event(session, evt)
                                for evt in events_to_inject
                            ))
                        logger.info(
                            f"[ADK] Injected {len(events_to_inject)} history events into restored session",
                            extra={"session_id": session_id},
                        )
                except Exception as hist_err:
                    # Non-fatal: agent starts fresh if history injection fails
                    logger.warning(f"[ADK] History injection failed (session starts fresh): {hist_err}")

            full_response = ""
            accumulated_tool_calls = []
            # Map tool_name → call_id so we can correlate function_response
            # with the correct call_id (ADK may not preserve call_id on responses)
            pending_tool_calls: dict[str, str] = {}
            try:
                # Pass user message directly via new_message parameter (ADK 1.x API)
                if not content_parts:
                    # ADK requires at least one part for a new_message to be valid
                    content_parts = [types.Part(text="[No content]")]
                    
                actual_message = types.Content(role="user", parts=content_parts)
                logger.info(f"[ADK] Starting run_async. Session: {session_id}, Parts: {len(content_parts)}")

                try:
                    # 180s hard timeout (3 minutes) — image generation and agent logic can be slow.
                    # This ensures a clean error message reaches the client if it truly hangs.
                    async with asyncio.timeout(180):
                        logger.info(f"[ADK] Calling run_async with new_message: {actual_message is not None}, Parts: {len(actual_message.parts) if actual_message else 0}")
                        
                        # Guard: If for some reason actual_message is STILL invalid, ADK will fail here correctly.
                        async for event in self.runner.run_async(
                            session_id=session_id,
                            user_id=user_id,
                            new_message=actual_message
                        ):
                            logger.debug(f"[ADK] Event: {getattr(event, 'event_type', 'content')}")
                            # ── Handle Interrupts (HITL) ──
                            if hasattr(event, "event_type") and event.event_type == "interrupt":
                                payload = {
                                    "type": "interrupt",
                                    "payload": getattr(event, "payload", {})
                                }
                                async for chunk in stream_data(payload):
                                    yield chunk
                                continue

                            # ── Handle Content (Text & Tools) ──
                            if event.content and event.content.parts:
                                has_text = any(hasattr(p, 'text') and p.text for p in event.content.parts)
                                has_fc = any(hasattr(p, 'function_call') and p.function_call for p in event.content.parts)
                                has_fr = any(hasattr(p, 'function_response') and p.function_response for p in event.content.parts)

                                # ── Tool Calls ──
                                # Internal ADK routing tools (transfer_to_agent) must NOT be
                                # streamed to the AI SDK client — they have no matching result
                                # call_id, which corrupts the SDK's internal tool-call state
                                # and causes the UI to hang waiting for a result that never comes.
                                INTERNAL_ADK_TOOLS = {"transfer_to_agent"}

                                if has_fc:
                                    for part in event.content.parts:
                                        if hasattr(part, 'function_call') and part.function_call:
                                            fc = part.function_call

                                            # Skip internal ADK tools entirely
                                            if fc.name in INTERNAL_ADK_TOOLS:
                                                logger.debug(f"[ADK] Suppressing internal tool call: {fc.name}")
                                                continue

                                            call_id = getattr(fc, 'call_id', None) or getattr(fc, 'id', None) or str(uuid.uuid4())

                                            # Track call_id so tool results can be correlated
                                            pending_tool_calls[fc.name] = call_id

                                            status_msg = f"Syd sta usando {fc.name}..."
                                            if fc.name == "generate_render":
                                                status_msg = "Syd sta generando il tuo rendering (potrebbe volerci un momento)..."
                                            elif fc.name == "pricing_engine_tool":
                                                status_msg = "Syd sta calcolando i costi..."

                                            async for chunk in stream_status(status_msg):
                                                yield chunk
                                            async for chunk in stream_tool_call(call_id, fc.name, fc.args or {}):
                                                yield chunk

                                            accumulated_tool_calls.append({
                                                "id": call_id,
                                                "name": fc.name,
                                                "args": fc.args or {},
                                                "function": {
                                                    "name": fc.name,
                                                    "arguments": fc.args or {}
                                                }
                                            })

                                # ── Tool Results ──
                                if has_fr:
                                    for part in event.content.parts:
                                        if hasattr(part, 'function_response') and part.function_response:
                                            fr = part.function_response

                                            # Skip internal ADK tool results (no client-side call to match)
                                            if getattr(fr, 'name', None) in INTERNAL_ADK_TOOLS:
                                                logger.debug(f"[ADK] Suppressing internal tool result: {fr.name}")
                                                continue

                                            # Resolve call_id: try ADK attribute first, then our tracked mapping
                                            call_id = (
                                                getattr(fr, 'call_id', None)
                                                or getattr(fr, 'id', None)
                                                or pending_tool_calls.pop(getattr(fr, 'name', ''), None)
                                                or 'unknown'
                                            )
                                            # Ensure response is JSON-serializable (ADK may return protobuf MapComposite)
                                            raw_response = fr.response
                                            if hasattr(raw_response, '__iter__') and not isinstance(raw_response, (dict, list, str)):
                                                raw_response = dict(raw_response)

                                            logger.info(
                                                f"[ADK] Tool result: name={getattr(fr, 'name', '?')}, "
                                                f"call_id={call_id}, response_type={type(raw_response).__name__}"
                                            )
                                            async for chunk in stream_tool_result(call_id, raw_response):
                                                yield chunk
                                                
                                            # ── Persist Tool Result to Firestore ──
                                            try:
                                                import json
                                                from datetime import datetime, timezone
                                                repo = get_conversation_repository()
                                                content_str = json.dumps(raw_response) if isinstance(raw_response, dict) else str(raw_response)
                                                await repo.save_message(
                                                    session_id=session_id,
                                                    role="tool",
                                                    content=content_str,
                                                    tool_call_id=call_id,
                                                    timestamp=datetime.now(timezone.utc)
                                                )
                                                logger.info(f"[Repo] Saved tool result for call_id {call_id}")
                                            except Exception as e:
                                                logger.error(f"Failed to persist tool result: {e}")

                                logger.info(
                                    "ADK Event received",
                                    extra={
                                        "author": getattr(event, "author", "unknown"),
                                        "has_text": has_text,
                                        "has_fc": has_fc,
                                        "has_fr": has_fr,
                                    }
                                )

                                # ── Text Responses ──
                                if has_text:
                                    for part in event.content.parts:
                                        if hasattr(part, 'text') and part.text:
                                            filtered = await filter_agent_output(part.text)
                                            full_response += filtered
                                            async for chunk in stream_text(filtered):
                                                yield chunk
                            else:
                                logger.debug("ADK event has no content or parts")

                except asyncio.TimeoutError:
                    logger.error(f"[ADK] run_async timed out after 55s for session {session_id}")
                    async for chunk in stream_error("Syd ha impiegato troppo tempo a rispondere. Riprova tra poco."):
                        yield chunk

                # --- LOCAL PERSISTENCE BRIDGE (Save Assistant) ---
                if full_response or accumulated_tool_calls:
                    try:
                        from datetime import datetime, timezone
                        repo = get_conversation_repository()
                        assistant_timestamp = datetime.now(timezone.utc)
                        await repo.save_message(
                            session_id=session_id,
                            role="assistant",
                            content=full_response,
                            tool_calls=accumulated_tool_calls if accumulated_tool_calls else None,
                            timestamp=assistant_timestamp
                        )
                        logger.info(f"[Repo] Saved assistant message for session {session_id}")
                    except Exception as e:
                        logger.error(f"Failed to persist assistant message: {e}")
            except Exception:
                logger.exception("Inner ADK run_async error captured")
                async for chunk in stream_error("Errore durante la generazione della risposta AI."):
                    yield chunk
        except Exception:
            logger.exception("Outer ADKOrchestrator execution error.")
            async for chunk in stream_error("Impossibile connettersi all'assistente Sydney."):
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
        except Exception:
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
