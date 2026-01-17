import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

app = FastAPI(title="SYD Brain 🧠", version="0.1.0")

class ChatRequest(BaseModel):
    messages: list[dict]
    session_id: str

@app.get("/health")
def health_check():
    """Health check endpoint for Cloud Run."""
    return {"status": "ok", "service": "syd-brain"}

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Mock endpoint for chat streaming (Phase 1 placeholder)."""
    return {"message": "Endpoint not implemented yet", "input": request}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
