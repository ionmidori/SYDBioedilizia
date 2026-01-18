from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from src.auth.jwt_handler import verify_token
from src.utils.stream_protocol import stream_text
from src.graph.agent import agent_graph
from src.graph.state import AgentState
from langchain_core.messages import HumanMessage
import asyncio

app = FastAPI(title="SYD Brain 🧠", version="0.1.0")

class ChatRequest(BaseModel):
    messages: list[dict]
    session_id: str = Field(..., alias="sessionId")
    
    model_config = {"populate_by_name": True}

@app.get("/health")
def health_check():
    """Health check endpoint for Cloud Run."""
    return {"status": "ok", "service": "syd-brain"}

async def chat_stream_generator(request: ChatRequest, user_email: str):
    """Real AI agent streaming using LangGraph."""
    
    # Convert messages to LangChain format
    lc_messages = []
    for msg in request.messages:
        if msg.get("role") == "user":
            content = msg.get("content", "").strip()
            if content:  # Only add non-empty messages
                lc_messages.append(HumanMessage(content=content))
    
    # Ensure at least one message exists
    if not lc_messages:
        lc_messages.append(HumanMessage(content="Ciao"))
    
    # Prepare agent state
    state: AgentState = {
        "messages": lc_messages,
        "session_id": request.session_id
    }
    
    # Invoke agent
    result = agent_graph.invoke(state)
    
    # Extract response
    if result and "messages" in result:
        last_message = result["messages"][-1]
        response_text = last_message.content
        
        # Stream word by word
        for word in response_text.split():
            async for chunk in stream_text(word + " "):
                yield chunk
            await asyncio.sleep(0.05)

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest, user_payload: dict = Depends(verify_token)):
    """Streaming chat endpoint - Secured by Internal JWT."""
    user_email = user_payload.get("email", "unknown")
    
    return StreamingResponse(
        chat_stream_generator(request, user_email),
        media_type="text/plain; charset=utf-8",
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
