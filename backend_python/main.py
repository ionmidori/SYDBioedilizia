from dotenv import load_dotenv
load_dotenv()  # ✅ Load .env file BEFORE other imports

from fastapi import FastAPI, Header, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from src.auth.jwt_handler import verify_token
from src.utils.stream_protocol import stream_text
from src.utils.context import set_current_user_id, set_current_media_metadata  # ✅ Context for quota & metadata
from src.db.messages import save_message, get_conversation_context, ensure_session  # 🔥 DB persistence
from src.graph.agent import get_agent_graph
from src.graph.state import AgentState
from langchain_core.messages import HumanMessage, AIMessage
import asyncio
import logging
from logging.handlers import RotatingFileHandler
import os

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🔥 FILE LOGGING CONFIGURATION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_file = os.path.join(os.path.dirname(__file__), "server_debug.log")
file_handler = RotatingFileHandler(
    log_file,
    maxBytes=5 * 1024 * 1024,  # 5 MB
    backupCount=3,
    encoding='utf-8'
)
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(logging.Formatter(
    '%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
))

# Configure root logger
logging.basicConfig(
    level=logging.INFO,
    handlers=[
        file_handler,
        logging.StreamHandler()  # Keep console output
    ]
)

logger = logging.getLogger(__name__)

app = FastAPI(title="SYD Brain", version="0.4.0")

# 🔒 CORS Middleware (Vercel Timeout Bypass)
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://website-renovation.vercel.app",
        "https://website-renovation-git-main-ionmidori.vercel.app",
        "https://sydbioedilizia.vercel.app",
        "https://sydbioedilizia-git-main-ionmidori.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔒 App Check Middleware
from src.middleware.app_check import validate_app_check_token
from fastapi.responses import JSONResponse

@app.middleware("http")
async def app_check_middleware(request: Request, call_next):
    """
    Global middleware to enforce Firebase App Check.
    Skips validation for:
    - OPTIONS (CORS preflight)
    - Health checks
    - Documentation
    - Public assets
    """
    # Allow CORS preflight always
    if request.method == "OPTIONS":
        return await call_next(request)
        
    # Public endpoints whitelist
    public_paths = ["/health", "/docs", "/openapi.json", "/favicon.ico"]
    if request.url.path in public_paths:
        return await call_next(request)

    try:
        # Validate token (if enforcement enabled)
        await validate_app_check_token(request)
    except HTTPException as e:
        # Middleware cannot raise HTTPException directly, must return JSONResponse
        return JSONResponse(
            status_code=e.status_code,
            content={"detail": e.detail}
        )

    return await call_next(request)

@app.on_event("startup")
async def startup_event():
    """Minimal startup - just log. All heavy init is lazy-loaded on first request."""
    logger.info("SYD Brain API starting on port 8080...")
    # NOTE: Firebase validation and Agent Graph initialization happen lazily on first request
    # This ensures the container binds to port 8080 immediately for Cloud Run health checks

# Register upload router
from src.api.upload import router as upload_router
app.include_router(upload_router)



# Register passkey router
from src.api.passkey import router as passkey_router
app.include_router(passkey_router)

# Register projects router (Dashboard)
from src.api.projects_router import router as projects_router
app.include_router(projects_router)

# Register metadata update router
from src.api.update_metadata import router as metadata_router
app.include_router(metadata_router)




class LeadSubmissionRequest(BaseModel):
    name: str
    email: str
    phone: str | None = None
    quote_summary: str
    session_id: str

@app.post("/api/submit-lead")
async def submit_lead_endpoint(request: LeadSubmissionRequest, user_payload: dict = Depends(verify_token)):
    """
    Direct endpoint for the Lead Generation Form widget.
    Bypasses the agent to save data directly to DB.
    """
    from src.tools.submit_lead import submit_lead_wrapper
    
    user_id = user_payload.get("uid", "anonymous")
    
    result = await submit_lead_wrapper(
        name=request.name,
        email=request.email,
        phone=request.phone,
        project_details=request.quote_summary, # Map summary to details
        uid=user_id,
        session_id=request.session_id
    )
    
    return {"status": "success", "message": result}

class ChatRequest(BaseModel):
    messages: list[dict]
    session_id: str = Field(..., alias="sessionId")
    # ✅ Support both images and videos
    media_urls: list[str] | None = Field(None, alias="mediaUrls") 
    image_urls: list[str] | None = Field(None, alias="imageUrls")  # Backward compatibility
    media_types: list[str] | None = Field(None, alias="mediaTypes")  # Optional MIME type hints
    media_metadata: dict[str, dict] | None = Field(None, alias="mediaMetadata") # New: Trim Ranges
    # 🎬 NEW: Native Video Support (File API URIs)
    video_file_uris: list[str] | None = Field(None, alias="videoFileUris")  # File API URIs from /upload endpoint
    
    model_config = {"populate_by_name": True}
    
    def __init__(self, **data):
        # Backward compatibility: if imageUrls provided, use it as mediaUrls
        if "imageUrls" in data or "image_urls" in data:
            image_urls = data.get("imageUrls") or data.get("image_urls")
            if image_urls and not data.get("mediaUrls") and not data.get("media_urls"):
                data["mediaUrls"] = image_urls
        super().__init__(**data)

@app.get("/health")
def health_check():
    """Health check endpoint for Cloud Run."""
    return {"status": "ok", "service": "syd-brain"}

async def chat_stream_generator(request: ChatRequest, user_payload: dict):
    """
    Real AI agent streaming using LangGraph native events.
    
    Streams Vercel Data Stream Protocol events:
    - 0: Text chunks
    - 9: Tool calls
    - a: Tool results
    - 3: Errors
    """
    from src.utils.stream_protocol import (
        stream_text,
        stream_tool_call,
        stream_tool_result,
        stream_error
    )
    from langchain_core.messages import AIMessage, ToolMessage
    
    
    try:
        # ✅ Extract user_id from JWT for quota tracking
        user_id = user_payload.get("uid", "default")
        
        # ⚡ Send immediate keep-alive to wake up client stream
        yield '0:""\n'
        
        
        # ✅ Set context for tools to access user_id AND media metadata
        set_current_user_id(user_id)
        if request.media_metadata:
             set_current_media_metadata(request.media_metadata)
        
        # 🔥 ENSURE SESSION EXISTS
        await ensure_session(request.session_id)
        
        # 🔥 LOAD CONVERSATION HISTORY from Firestore
        conversation_history = await get_conversation_context(request.session_id, limit=10)
        logger.info(f"📜 Loaded {len(conversation_history)} messages from DB")
        
        # 🔥 GET LATEST USER MESSAGE from request
        latest_user_message = request.messages[-1] if request.messages else {"role": "user", "content": "Ciao"}
        
        # Helper to extract text from Vercel multimodal format
        def _parse_content(raw):
            if isinstance(raw, str):
                return raw.strip()
            elif isinstance(raw, list):
                # Extract text parts from list [{"type": "text", "text": "..."}]
                return "\n".join([
                    item.get("text", "") 
                    for item in raw 
                    if isinstance(item, dict) and item.get("type") == "text"
                ]).strip()
            return str(raw).strip()

        user_content = _parse_content(latest_user_message.get("content", ""))
        
        # ✅ INJECT MEDIA MARKERS if present (images or videos)
        media_urls = request.media_urls or request.image_urls  # Backward compatibility
        media_types = request.media_types or []
        
        # 🔥 STRUCTURED MEDIA HANDLING (Phase 2)
        from src.models.chat import MediaAttachment
        attachments_data = []
        
        # 1. Handle HTTP URLs (Legacy + Standard)
        if media_urls:
            for idx, url in enumerate(media_urls):
                # Determine media type
                mime_type = media_types[idx] if idx < len(media_types) else None
                guessed_type = "image"
                
                if not mime_type:
                    if any(url.lower().endswith(ext) for ext in ['.mp4', '.webm', '.mov', '.avi']):
                         guessed_type = "video"
                         mime_type = "video/mp4" # Basic fallback
                    else:
                         mime_type = "image/jpeg"
                elif mime_type.startswith('video/'):
                     guessed_type = "video"
                
                # Add to structured list
                attachment = MediaAttachment(
                    url=url,
                    media_type=guessed_type,
                    mime_type=mime_type
                )
                attachments_data.append(attachment.to_firestore())

                # Legacy String Marker (Keep for Safety during transition)
                media_label = "Video allegato" if guessed_type == "video" else "Immagine allegata"
                user_content += f"\n\n[{media_label}: {url}]"

        # 2. Handle File API Video URIs (Native Video)
        if request.video_file_uris:
            for video_uri in request.video_file_uris:
                attachment = MediaAttachment(
                    url=video_uri, # Use URI as URL for internal reference
                    media_type='video',
                    mime_type='video/mp4', # Assumed for Gemini File API
                    file_uri=video_uri
                )
                # attachments_data.append(attachment.to_firestore())
                # Wait, video_file_uris are usually just internal handles. 
                # Ideally we want the public URL too if available. 
                # But for now, let's store the URI so the Agent knows a video exists.
                attachments_data.append(attachment.to_firestore())
                
                # Marker for Agent (Legacy)
                user_content += f"\n\n[Video allegato: {video_uri}]"
        
        # 🔥 SAVE USER MESSAGE to DB (Structured)
        await save_message(
            request.session_id, 
            "user", 
            user_content,
            attachments=attachments_data
        )
        logger.info(f"💾 Saved user message to DB (with {len(attachments_data)} attachments)")
        
        # Convert messages to LangChain format
        # Convert messages to LangChain format - USING DB HISTORY + CURRENT MESSAGE
        # This ensures we consistently see [Immagine: URL] markers saved in DB
        lc_messages = []
        
        # 1. Add History from DB
        for msg in conversation_history:
            role = msg.get("role")
            content = msg.get("content", "")
            attachments = msg.get("attachments", [])
            
            if role == "user":
                if attachments:
                    # Convert to Multimodal HumanMessage
                    multimodal_blocks = [{"type": "text", "text": content}]
                    for att in attachments:
                        if att.get("media_type") == "image":
                            multimodal_blocks.append({
                                "type": "image_url",
                                "image_url": {"url": att["url"]}
                            })
                        elif att.get("media_type") == "video" and att.get("file_uri"):
                             # Native Video via File API
                             multimodal_blocks.append({
                                "type": "file_data",
                                "file_data": {"file_uri": att["file_uri"]}
                             })
                        # Note: Legacy URLs for videos in text will be handled by text content
                            
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
                lc_messages.append(ToolMessage(
                    content=content,
                    tool_call_id=msg.get("tool_call_id", "unknown")
                ))

        # 2. Add Current User Message (Multimodal)
        # 🎬 Handle both traditional media_urls AND File API video URIs
        has_media = bool(media_urls or request.video_file_uris)
        
        if has_media:
            multimodal_content = [{"type": "text", "text": user_content}]
            
            # Handle traditional media URLs (images, legacy video markers)
            if media_urls:
                logger.info(f"👁️ Injecting {len(media_urls)} media files into prompt")
                for idx, url in enumerate(media_urls):
                    mime_type = media_types[idx] if media_types and idx < len(media_types) else None
                    if mime_type and mime_type.startswith('video/'):
                        # Video handled as text marker (already in user_content)
                        pass
                    else:
                        multimodal_content.append({
                            "type": "image_url", 
                            "image_url": {"url": url}
                        })
            
            # 🎬 Handle File API Video URIs (Native Video)
            if request.video_file_uris:
                logger.info(f"🎬 Injecting {len(request.video_file_uris)} File API video(s) for native processing")
                for video_uri in request.video_file_uris:
                    # Inject as native video part for Gemini
                    # Format: {"type": "file_data", "file_data": {"file_uri": "..."} }
                    multimodal_content.append({
                        "type": "file_data",
                        "file_data": {
                            "file_uri": video_uri
                        }
                    })
                    logger.info(f"🎬 Added native video: {video_uri}")
            
            lc_messages.append(HumanMessage(content=multimodal_content))
        else:
            lc_messages.append(HumanMessage(content=user_content))

        
        # Prepare agent state with user_id for quota tracking
        state: AgentState = {
            "messages": lc_messages,
            "session_id": request.session_id,
            "user_id": user_id  # ✅ Added for quota propagation
        }
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 🔥 REAL-TIME STREAMING: Native LangGraph Events
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        # 🔥 ACCUMULATE ASSISTANT RESPONSE for DB persistence
        accumulated_response = ""
        
        # Lazy load agent graph (singleton)
        from src.graph.agent import get_agent_graph
        agent_graph = get_agent_graph()
        
        async for event in agent_graph.astream(state):
            # LangGraph emits events as {node_name: {...}}
            # We need to extract messages and tool calls
            logger.info(f"Event received: {list(event.keys())}")
            
            for node_name, node_output in event.items():
                try:
                    logger.info(f"Checking NODE: {node_name}")
                    logger.info(f"   Node output keys: {list(node_output.keys())}")
                    
                    if "messages" not in node_output:
                        logger.info("   No 'messages' key found")
                        continue
                    
                    # Get the last message from this node
                    messages = node_output["messages"]
                    logger.info(f"   Type of messages: {type(messages)}")
                    logger.info(f"   Found {len(messages)} messages")
                    
                    if not messages:
                        logger.info("   Messages list is empty")
                        continue
                    
                    last_msg = messages[-1]
                    logger.info(f"   Last message type: {type(last_msg).__name__}")
                    logger.info(f"   RAW CONTENT: {repr(last_msg.content)}")
                    logger.info(f"   HAS TOOL_CALLS? {hasattr(last_msg, 'tool_calls')}")
                    if hasattr(last_msg, 'tool_calls'):
                        logger.info(f"   TOOL_CALLS: {last_msg.tool_calls}")
                    logger.info(f"   ADDITIONAL_KWARGS: {last_msg.additional_kwargs}")
                    
                    if hasattr(last_msg, 'response_metadata'):
                        logger.info(f"   METADATA: {last_msg.response_metadata}")

                    # ──────────────────────────────────────────────────
                    # CASE 1: AI Message with Tool Calls
                    # ──────────────────────────────────────────────────
                    if isinstance(last_msg, AIMessage) and hasattr(last_msg, 'tool_calls') and last_msg.tool_calls:
                        tool_calls = last_msg.tool_calls
                        logger.info(f"DETECTED TOOL CALLS: {len(tool_calls)}")
                        
                        # 🔥 SAVE AIMessage with Tool Calls to DB
                        serialized_tool_calls = [
                            {"id": tc["id"], "name": tc["name"], "args": tc["args"]}
                            for tc in tool_calls
                        ]
                        await save_message(request.session_id, "assistant", last_msg.content or "", tool_calls=serialized_tool_calls)
                        logger.info(f"Saved assistant tool call message ({len(tool_calls)} calls)")

                        for tool_call in tool_calls:
                            logger.info(f"STREAMING TOOL CALL: {tool_call.get('name')}")
                            # Emit tool call event (9:)
                            async for chunk in stream_tool_call(
                                tool_call_id=tool_call.get("id", "unknown"),
                                tool_name=tool_call.get("name", "unknown"),
                                args=tool_call.get("args", {})
                            ):
                                yield chunk
                    
                    # ──────────────────────────────────────────────────
                    # CASE 2: Tool Result Message
                    # ──────────────────────────────────────────────────
                    if isinstance(last_msg, ToolMessage):
                        logger.info(f"DETECTED TOOL RESULT: {last_msg.tool_call_id}")
                        # 🔥 SAVE ToolMessage to DB
                        await save_message(request.session_id, "tool", last_msg.content, tool_call_id=last_msg.tool_call_id)
                        print(f"💾 Saved tool result message")

                        # Emit tool result event (a:)
                        async for chunk in stream_tool_result(
                            tool_call_id=last_msg.tool_call_id,
                            result=last_msg.content
                        ):
                            yield chunk
                    
                    # ──────────────────────────────────────────────────
                    # CASE 3: AI Message with Text Content
                    # ──────────────────────────────────────────────────
                    if isinstance(last_msg, AIMessage) and last_msg.content:
                        # Robust content extraction (handle List vs String)
                        raw = last_msg.content
                        text_content = ""
                        if isinstance(raw, str):
                            text_content = raw
                        elif isinstance(raw, list):
                            # Extract text from complex content blocks
                            text_content = "\n".join([
                                p if isinstance(p, str) else p.get("text", "") 
                                for p in raw 
                                if isinstance(p, str) or p.get("type") == "text"
                            ])
                        
                        logger.info(f"AI TEXT RESPONSE: {text_content[:100]}...")

                        # 🔥 ACCUMULATE for DB
                        accumulated_response += text_content
                        
                        # Stream text by chunks to preserve whitespace/markdown
                        if text_content:
                            chunk_size = 5  # Send 5 chars at a time for smooth but fast streaming
                            for i in range(0, len(text_content), chunk_size):
                                chunk = text_content[i:i+chunk_size]
                                async for stream_chunk in stream_text(chunk):
                                    yield stream_chunk
                                # Removed asyncio.sleep to maximize throughput

                except Exception as node_error:
                    logger.error(f"   Error processing node {node_name}: {node_error}")
                    import traceback
                    logger.error(traceback.format_exc())
                    continue
        
        # 🔥 SAVE ASSISTANT RESPONSE to DB after streaming completes
        if accumulated_response:
            await save_message(request.session_id, "assistant", accumulated_response)
            logger.info(f"💾 Saved assistant response to DB ({len(accumulated_response)} chars)")
            
    except Exception as e:
        import traceback
        import os
        error_trace = traceback.format_exc()
        logger.error(f"❌ STREAM ERROR: {str(e)}\n{error_trace}")
        
        # 🛡️ SECURITY: Sanitize errors in production
        env = os.getenv("ENV", "development")
        if env == "production":
            # Never leak internal details to clients
            safe_error_msg = "An internal processing error occurred. Please try again or contact support."
        else:
            # Development: Show full error for debugging
            safe_error_msg = str(e)
        
        # Emit sanitized error event (3:)
        async for chunk in stream_error(safe_error_msg):
            yield chunk

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest, user_payload: dict = Depends(verify_token)):
    """Streaming chat endpoint - Secured by Internal JWT."""
    print(f"📥 Received Request: {len(request.messages)} messages, Session: {request.session_id}")
    
    return StreamingResponse(
        chat_stream_generator(request, user_payload),  # ✅ Pass full payload
        media_type="text/plain; charset=utf-8",
        headers={"Connection": "close", "X-Vercel-AI-Data-Stream": "v1"} # ⚡ FORCE socket closure
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
