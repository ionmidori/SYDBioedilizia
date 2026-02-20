from contextlib import asynccontextmanager
from fastapi import FastAPI, Header, HTTPException, Depends, Request, Security
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator
from src.auth.jwt_handler import verify_token, security
from src.schemas.internal import UserSession
from src.core.logger import setup_logging, get_logger
from src.core.config import settings
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

@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Application lifespan: startup and shutdown logic."""
    logger.info("SYD Brain API starting on port 8080...")
    # NOTE: Firebase validation and Agent Graph initialization happen lazily on first request
    # This ensures the container binds to port 8080 immediately for Cloud Run health checks
    yield
    logger.info("SYD Brain API shutting down.")

app = FastAPI(title="SYD Brain", version="0.4.0", lifespan=lifespan)

# 🔒 CORS Middleware (Hardened)
from fastapi.middleware.cors import CORSMiddleware

_production_origins = [
    "https://website-renovation.vercel.app",
    "https://website-renovation-git-main-ionmidori.vercel.app",
    "https://sydbioedilizia.vercel.app",
    "https://sydbioedilizia-git-main-ionmidori.vercel.app",
]
_allowed_origins = (
    _production_origins + ["http://localhost:3000", "http://127.0.0.1:3000"]
    if settings.ENV == "development"
    else _production_origins
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Firebase-AppCheck", "X-Request-ID"],
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
        
    # Public endpoints whitelist (docs only in development)
    public_paths = ["/health", "/favicon.ico"]
    if settings.ENV == "development":
        public_paths.extend(["/docs", "/openapi.json"])
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

# Register reports router
from src.api.reports import router as reports_router
app.include_router(reports_router)


# Register metadata update router
from src.api.update_metadata import router as metadata_router
app.include_router(metadata_router)
# Register quote HITL router (skill: langgraph-hitl-patterns)
from src.api.routes.quote_routes import router as quote_router
app.include_router(quote_router)




class LeadSubmissionRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., max_length=320)
    phone: str | None = Field(None, max_length=30)
    quote_summary: str = Field(..., min_length=1, max_length=5000)
    session_id: str = Field(..., min_length=1, max_length=128, pattern=r'^[a-zA-Z0-9_-]+$')

    @field_validator('email')
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        import re
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
            raise ValueError('Invalid email format')
        return v.lower().strip()

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

class ChatMessage(BaseModel):
    role: str = Field(..., pattern=r'^(user|assistant|system)$')
    content: str | list = Field(...)

    @field_validator('content')
    @classmethod
    def validate_content_size(cls, v):
        if isinstance(v, str) and len(v) > 50000:
            raise ValueError('Message content exceeds maximum length (50000 chars)')
        if isinstance(v, list) and len(v) > 20:
            raise ValueError('Message content exceeds maximum parts (20)')
        return v


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., max_length=100)
    session_id: str = Field(..., alias="sessionId", min_length=1, max_length=128, pattern=r'^[a-zA-Z0-9_-]+$')
    # ✅ Support both images and videos
    media_urls: list[str] | None = Field(None, alias="mediaUrls") 
    image_urls: list[str] | None = Field(None, alias="imageUrls")  # Backward compatibility
    media_types: list[str] | None = Field(None, alias="mediaTypes")  # Optional MIME type hints
    media_metadata: dict[str, dict] | None = Field(None, alias="mediaMetadata") # New: Trim Ranges
    # 🎬 NEW: Native Video Support (File API URIs)
    video_file_uris: list[str] | None = Field(None, alias="videoFileUris")  # File API URIs from /upload endpoint
    
    # 🌍 CONTEXT AWARENESS (Renovation-Next)
    project_id: str | None = Field(None, alias="projectId", max_length=128, pattern=r'^[a-zA-Z0-9_-]+$')
    is_authenticated: bool = Field(False) # Matches JSON directly
    
    model_config = {"populate_by_name": True}

    @model_validator(mode="before")
    @classmethod
    def _backfill_media_urls(cls, data: dict) -> dict:
        """Backward compatibility: promote imageUrls → mediaUrls when mediaUrls absent."""
        image_urls = data.get("imageUrls") or data.get("image_urls")
        if image_urls and not data.get("mediaUrls") and not data.get("media_urls"):
            data["mediaUrls"] = image_urls
        return data

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
    logger.info(
        "Chat stream request received.",
        extra={"message_count": len(request.messages), "session_id": request.session_id},
    )
    
    return StreamingResponse(
        chat_stream_generator(request, credentials, orchestrator),
        media_type="text/plain; charset=utf-8",
        headers={"Connection": "close", "X-Vercel-AI-Data-Stream": "v1"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
