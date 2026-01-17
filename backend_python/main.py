from fastapi import FastAPI, Header, HTTPException, Depends
from pydantic import BaseModel
from src.auth.jwt_handler import verify_token

app = FastAPI(title="SYD Brain 🧠", version="0.1.0")

class ChatRequest(BaseModel):
    messages: list[dict]
    session_id: str

@app.get("/health")
def health_check():
    """Health check endpoint for Cloud Run."""
    return {"status": "ok", "service": "syd-brain"}

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest, user_payload: dict = Depends(verify_token)):
    """Mock endpoint - Secured by Internal JWT."""
    return {"message": "You are authorized!", "user": user_payload.get("email"), "input": request}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
