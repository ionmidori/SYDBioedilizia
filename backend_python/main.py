from dotenv import load_dotenv
load_dotenv()  # ✅ Load .env file BEFORE other imports

from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from src.auth.jwt_handler import verify_token
from src.utils.stream_protocol import stream_text
from src.utils.context import set_current_user_id  # ✅ Context for quota tracking
from src.db.messages import save_message, get_conversation_context, ensure_session  # 🔥 DB persistence
from src.graph.agent import agent_graph
from src.graph.state import AgentState
from langchain_core.messages import HumanMessage, AIMessage
import asyncio
import logging
from logging.handlers import RotatingFileHandler
import os

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🔥 FILE LOGGING CONFIGURATION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_file = os.path.join(os.path.dirname(__file__), "server.log")
file_handler = RotatingFileHandler(
    log_file,
    maxBytes=5 * 1024 * 1024,  # 5 MB
    backupCount=3
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

app = FastAPI(title="SYD Brain 🧠", version="0.1.0")

@app.on_event("startup")
async def startup_event():
    """Validate Firebase configuration on startup."""
    from src.db.firebase_client import validate_firebase_config
    try:
        validate_firebase_config()
    except RuntimeError as e:
        import sys
        print(f"\n{'='*60}\n{e}\n{'='*60}\n")
        sys.exit(1)


class ChatRequest(BaseModel):
    messages: list[dict]
    session_id: str = Field(..., alias="sessionId")
    # ✅ Support both images and videos
    media_urls: list[str] | None = Field(None, alias="mediaUrls") 
    image_urls: list[str] | None = Field(None, alias="imageUrls")  # Backward compatibility
    media_types: list[str] | None = Field(None, alias="mediaTypes")  # Optional MIME type hints
    
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
        
        # ✅ Set context for tools to access user_id
        set_current_user_id(user_id)
        
        # 🔥 ENSURE SESSION EXISTS
        await ensure_session(request.session_id)
        
        # 🔥 LOAD CONVERSATION HISTORY from Firestore
        conversation_history = await get_conversation_context(request.session_id, limit=10)
        print(f"📜 Loaded {len(conversation_history)} messages from DB")
        
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
        
        if media_urls:
            for idx, url in enumerate(media_urls):
                # Determine media type (prefer explicit media_types, fallback to guessing from URL)
                mime_type = media_types[idx] if idx < len(media_types) else None
                if not mime_type:
                    # Guess mime type from URL extension
                    if any(url.lower().endswith(ext) for ext in ['.mp4', '.webm', '.mov', '.avi']):
                        media_label = "Video allegato"
                    else:
                        media_label = "Immagine allegata"
                elif mime_type.startswith('video/'):
                    media_label = "Video allegato"
                else:
                    media_label = "Immagine allegata"
                    
                user_content += f"\n\n[{media_label}: {url}]"
        
        # 🔥 SAVE USER MESSAGE to DB
        await save_message(request.session_id, "user", user_content)
        print(f"💾 Saved user message to DB")
        
        # Convert messages to LangChain format
        lc_messages = []
        
        for i, msg in enumerate(request.messages):
            role = msg.get("role")
            content = _parse_content(msg.get("content", ""))
            
            if role == "user":
                # 🔥 MULTIMODAL SUPPORT: If this is the last message and we have media
                if i == len(request.messages) - 1 and media_urls:
                    print(f"👁️ Injecting {len(media_urls)} media files into prompt")
                    multimodal_content = [{"type": "text", "text": content}]
                    for idx, url in enumerate(media_urls):
                        # Determine if image or video
                        mime_type = media_types[idx] if idx < len(media_types) else None
                        if mime_type and mime_type.startswith('video/'):
                            # For videos, just include as text reference for now
                            # (LangChain video support may vary by model)
                            multimodal_content[0]["text"] += f"\n\n[Video: {url}]"
                        else:
                            # Standard image handling
                            multimodal_content.append({
                                "type": "image_url", 
                                "image_url": {"url": url}
                            })
                    lc_messages.append(HumanMessage(content=multimodal_content))
                else:
                    # Standard text message
                    lc_messages.append(HumanMessage(content=content))
            elif role == "assistant":
                # 🔥 Fix: Handle tool calls in assistant messages
                tool_calls = msg.get("tool_calls")
                if tool_calls:
                    lc_messages.append(AIMessage(content=content or "", tool_calls=tool_calls))
                else:
                    lc_messages.append(AIMessage(content=content))
            
            elif role == "tool":
                # 🔥 Fix: Handle tool results - ensure tool_call_id is never None
                tool_call_id = msg.get("tool_call_id") or msg.get("name") or f"tool-{i}"
                lc_messages.append(ToolMessage(
                    content=content,
                    tool_call_id=tool_call_id
                ))

        
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
        
        async for event in agent_graph.astream(state):
            # LangGraph emits events as {node_name: {...}}
            # We need to extract messages and tool calls
            print(f"🔄 Event received: {event.keys()}")
            
            for node_name, node_output in event.items():
                print(f"📍 Checking NODE: {node_name}")
                if "messages" not in node_output:
                    print("   Creation: No messages found")
                    continue
                
                # Get the last message from this node
                messages = node_output["messages"]
                if not messages:
                    continue
                
                last_msg = messages[-1]
                
                # ──────────────────────────────────────────────────
                # CASE 1: AI Message with Tool Calls
                # ──────────────────────────────────────────────────
                if isinstance(last_msg, AIMessage) and hasattr(last_msg, 'tool_calls') and last_msg.tool_calls:
                    tool_calls = last_msg.tool_calls
                    
                    # 🔥 SAVE AIMessage with Tool Calls to DB
                    serialized_tool_calls = [
                        {"id": tc["id"], "name": tc["name"], "args": tc["args"]}
                        for tc in tool_calls
                    ]
                    await save_message(request.session_id, "assistant", last_msg.content or "", tool_calls=serialized_tool_calls)
                    print(f"💾 Saved assistant tool call message ({len(tool_calls)} calls)")

                    for tool_call in tool_calls:
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
                    
                    # 🔥 ACCUMULATE for DB
                    accumulated_response += text_content
                    
                    # Stream text word by word for smooth UX
                    if text_content:
                        for word in text_content.split():
                            async for chunk in stream_text(word + " "):
                                yield chunk
                            await asyncio.sleep(0.05)  # Natural typing effect
        
        # 🔥 SAVE ASSISTANT RESPONSE to DB after streaming completes
        if accumulated_response:
            await save_message(request.session_id, "assistant", accumulated_response)
            print(f"💾 Saved assistant response to DB ({len(accumulated_response)} chars)")
    
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ STREAM ERROR: {str(e)}\n{error_trace}")  # Debug log
        # Emit error event (3:)
        async for chunk in stream_error(str(e)):
            yield chunk

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest, user_payload: dict = Depends(verify_token)):
    """Streaming chat endpoint - Secured by Internal JWT."""
    print(f"📥 Received Request: {len(request.messages)} messages, Session: {request.session_id}")
    
    return StreamingResponse(
        chat_stream_generator(request, user_payload),  # ✅ Pass full payload
        media_type="text/plain; charset=utf-8",
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
