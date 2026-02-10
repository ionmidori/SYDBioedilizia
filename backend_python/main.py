from fastapi import FastAPI, Header, HTTPException, Depends, Request, Security
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from src.auth.jwt_handler import verify_token, security 
from src.schemas.internal import UserSession 
from src.core.logger import setup_logging, get_logger
from src.services.agent_orchestrator import AgentOrchestrator, get_orchestrator
import uuid
from src.core.context import set_request_id
from src.core.schemas import APIErrorResponse
from src.core.exceptions import AppException

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🔥 LOGGING & APP SETUP
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
setup_logging()
logger = get_logger(__name__)

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

# 🆔 Request ID Middleware (Tracing)
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """
    Generates a unique Request ID for every call.
    Injects it into contextvars for logging and into headers for the client.
    """
    request_id = str(uuid.uuid4())
    set_request_id(request_id)
    
    response = await call_next(request)
    
    response.headers["X-Request-ID"] = request_id
    return response

# 📊 Metrics Middleware (Performance Monitoring)
from src.middleware.metrics import metrics_middleware
app.middleware("http")(metrics_middleware)

# 🛡️ Global Exception Handlers
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    """Handles known application errors."""
    logger.error(f"AppException: {exc.message} ({exc.error_code})")
    return JSONResponse(
        status_code=exc.status_code,
        content=APIErrorResponse(
            error_code=exc.error_code,
            message=exc.message,
            detail=exc.detail
        ).model_dump()
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handles unexpected crashes."""
    logger.error(f"🔥 Global Exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content=APIErrorResponse(
            error_code="INTERNAL_SERVER_ERROR",
            message="An internal server error occurred."
        ).model_dump()
    )

# 🛡️ Security Headers Middleware (HSTS, CSP, XSS)
from src.middleware.security_headers import SecurityHeadersMiddleware
app.add_middleware(SecurityHeadersMiddleware)

# 🔒 App Check Middleware
from src.middleware.app_check import validate_app_check_token
from fastapi.responses import JSONResponse

@app.middleware("http")
async def app_check_middleware(request: Request, call_next):
    """
    Global middleware to enforce Firebase App Check.
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
    except AppException as e:
        return JSONResponse(
            status_code=e.status_code,
            content=APIErrorResponse(
                error_code=e.error_code,
                message=e.message,
                detail=e.detail
            ).model_dump()
        )

    return await call_next(request)

@app.on_event("startup")
async def startup_event():
    """Minimal startup - just log."""
    logger.info("SYD Brain API starting on port 8080...")
    # NOTE: Firebase validation and Agent Graph initialization happen lazily on first request
    # This ensures the container binds to port 8080 immediately for Cloud Run health checks

# Register Routers
from src.api.upload import router as upload_router
app.include_router(upload_router)

# Register chat history router
from src.api.chat_history import router as chat_history_router
app.include_router(chat_history_router)

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
async def submit_lead_endpoint(request: LeadSubmissionRequest, user_session: UserSession = Depends(verify_token)):
    """
    Direct endpoint for the Lead Generation Form widget.
    Bypasses the agent to save data directly to DB.
    """
    from src.tools.submit_lead import submit_lead_wrapper
    
    user_id = user_session.uid
    
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
    
    # 🌍 CONTEXT AWARENESS (Renovation-Next)
    project_id: str | None = Field(None, alias="projectId")
    is_authenticated: bool = Field(False) # Matches JSON directly
    
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

async def chat_stream_generator(
    request: ChatRequest, 
    credentials: HTTPAuthorizationCredentials | None,
    orchestrator: AgentOrchestrator
):
    """
    Delegates streaming to the AgentOrchestrator.
    """
    async for chunk in orchestrator.stream_chat(request, credentials):
        yield chunk

@app.post("/chat/stream")
async def chat_stream(
    request: ChatRequest, 
    credentials: HTTPAuthorizationCredentials | None = Security(security),
    orchestrator: AgentOrchestrator = Depends(get_orchestrator)
):
    """
    Streaming chat endpoint - Secured by Internal JWT.
    Auth verification is delegated to Orchestrator for Zero Latency.
    """
    logger.info(f"📥 Received Request: {len(request.messages)} messages, Session: {request.session_id}")
    
    return StreamingResponse(
        chat_stream_generator(request, credentials, orchestrator),
        media_type="text/plain; charset=utf-8",
        headers={"Connection": "close", "X-Vercel-AI-Data-Stream": "v1"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
