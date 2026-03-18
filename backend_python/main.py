from dotenv import load_dotenv
load_dotenv(".env")  # Load .env into os.environ before any other imports (required by google-adk, google-genai)

from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request, Security, BackgroundTasks
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, field_validator, model_validator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from src.core.rate_limit import limiter
from src.auth.jwt_handler import verify_token, security
from src.schemas.internal import UserSession
from src.core.logger import setup_logging, get_logger
from src.core.config import settings
from src.services.base_orchestrator import BaseOrchestrator
from src.services.orchestrator_factory import get_orchestrator
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

    # ── OpenTelemetry Tracing ──────────────────────────────────────────────────
    from src.core.tracing import init_tracing, shutdown_tracing
    init_tracing()

    # Eager-init: warm up ADKOrchestrator (Vertex AI + Runner) during startup
    # so the first /chat/stream request doesn't pay the ~1-2s cold-start penalty.
    # Runs in threadpool to avoid blocking the event loop during startup.
    from src.services.orchestrator_factory import warm_up_orchestrator
    try:
        from starlette.concurrency import run_in_threadpool
        await run_in_threadpool(warm_up_orchestrator)
        logger.info("ADKOrchestrator warm-up complete.")
    except Exception as e:
        logger.warning(f"ADKOrchestrator warm-up failed (will retry lazily): {e}")
    yield
    # ── Graceful Shutdown ──────────────────────────────────────────────────────
    # Cloud Run sends SIGTERM and waits up to 40s (--timeout-graceful-shutdown).
    # uvicorn drains active SSE connections; we clean up owned gRPC resources here.
    logger.warning("SYD Brain API shutdown initiated — draining connections...")
    shutdown_tracing()
    try:
        import src.db.firebase_client as _fb
        client = _fb._async_db_client
        if client is not None:
            await client.close()
            logger.info("Async Firestore gRPC channel closed.")
    except Exception as _e:
        logger.warning(f"Non-fatal error during shutdown cleanup: {_e}")
    logger.info("SYD Brain API shutdown complete.")

app = FastAPI(title="SYD Brain", version="2.9.21", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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

# 🆔 Request ID Middleware (Raw ASGI — no BaseHTTPMiddleware buffering)
# ⚠️  Uses raw ASGI protocol to avoid buffering StreamingResponse for /chat/stream
from starlette.types import ASGIApp as _ASGIApp, Receive as _Receive, Scope as _Scope, Send as _Send

class RequestIDMiddleware:
    """
    Raw ASGI middleware that generates a unique Request ID for every HTTP request.
    Injects it into contextvars for structured logging and into response headers.
    """
    def __init__(self, app: _ASGIApp):
        self.app = app

    async def __call__(self, scope: _Scope, receive: _Receive, send: _Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = str(uuid.uuid4())
        set_request_id(request_id)

        async def send_with_request_id(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode()))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_request_id)

app.add_middleware(RequestIDMiddleware)

# 📊 Metrics Middleware (Raw ASGI — no BaseHTTPMiddleware buffering)
from src.middleware.metrics import MetricsMiddleware
app.add_middleware(MetricsMiddleware)


# 🛡️ Global Exception Handlers
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    """Handles known application errors."""
    logger.error(f"AppException: {exc.message} ({exc.error_code})")
    headers = {}
    # RFC 6585: Include Retry-After header on 429 responses
    if exc.status_code == 429 and exc.detail and exc.detail.get("reset_at"):
        from datetime import datetime
        try:
            reset_at = datetime.fromisoformat(exc.detail["reset_at"])
            delta = (reset_at - datetime.now(reset_at.tzinfo)).total_seconds()
            headers["Retry-After"] = str(max(1, int(delta)))
        except (ValueError, TypeError):
            headers["Retry-After"] = "60"
    return JSONResponse(
        status_code=exc.status_code,
        content=APIErrorResponse(
            error_code=exc.error_code,
            message=exc.message,
            detail=exc.detail
        ).model_dump(),
        headers=headers or None,
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handles Pydantic 422 validation errors, normalizing them to our APIErrorResponse format.

    PII Protection: Strip user-submitted input values from error details.
    Only expose field location (loc), error type, and message — never the raw input.
    """
    # Sanitize: remove 'input' and 'ctx' fields that may contain user PII
    sanitized_errors = [
        {"loc": e.get("loc"), "type": e.get("type"), "msg": e.get("msg")}
        for e in exc.errors()[:5]  # Cap at 5 errors to prevent payload inflation
    ]
    logger.warning(f"[Validation] Request validation failed: {sanitized_errors}")
    return JSONResponse(
        status_code=422,
        content=APIErrorResponse(
            error_code="VALIDATION_ERROR",
            message="Request validation failed.",
            detail={"errors": sanitized_errors},
        ).model_dump()
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handles unexpected crashes inside route handlers."""
    logger.error(f"🔥 Global Exception (route handler): {exc}", exc_info=True)
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

# 🔥 Global Error Catcher Middleware
# ─── THIS MUST BE REGISTERED LAST (via add_middleware) ───────────────────────
# Starlette uses LIFO ordering for add_middleware(), so the LAST registered
# middleware executes FIRST in the request chain.
# This gives us a true try/except around the ENTIRE application, catching
# exceptions that even escape @app.exception_handler (i.e., from other middlewares).
#
# ⚠️  CRITICAL: Uses raw ASGI protocol, NOT BaseHTTPMiddleware.
# BaseHTTPMiddleware buffers streaming response bodies into memory before
# forwarding, which breaks StreamingResponse for /chat/stream.
# See: https://www.starlette.io/middleware/#limitations
from starlette.types import ASGIApp, Receive, Scope, Send

class GlobalErrorCatcherMiddleware:
    """
    Outermost safety net for the entire application (raw ASGI).

    Catches any unhandled exception from ALL layers (middlewares, routes, etc.)
    and returns a standardized APIErrorResponse JSON, preventing Starlette's
    generic plain-text '500 Internal Server Error' from ever reaching the client.

    Uses raw ASGI __call__ instead of BaseHTTPMiddleware.dispatch() to avoid
    buffering StreamingResponse bodies (which would break /chat/stream SSE).

    CRITICAL: Must be added via app.add_middleware() AFTER all others.
    """
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        try:
            await self.app(scope, receive, send)
        except Exception as exc:
            logger.error(
                f"🚨 [GlobalErrorCatcher] Unhandled exception escaped middleware stack: "
                f"{type(exc).__name__}: {exc}",
                exc_info=True
            )
            # Build a minimal JSON error response via raw ASGI
            import json as _json
            error_body = _json.dumps(
                APIErrorResponse(
                    error_code="INTERNAL_SERVER_ERROR",
                    message="An unexpected internal error occurred. Our team has been alerted.",
                ).model_dump()
            ).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 500,
                "headers": [
                    [b"content-type", b"application/json"],
                    [b"content-length", str(len(error_body)).encode()],
                ],
            })
            await send({
                "type": "http.response.body",
                "body": error_body,
            })

app.add_middleware(GlobalErrorCatcherMiddleware)
# ─────────────────────────────────────────────────────────────────────────────

# 🔁 Idempotency Middleware (non-streaming POST endpoints only)
# Replays cached responses for duplicate requests bearing the same Idempotency-Key.
# Registered AFTER GlobalErrorCatcherMiddleware (LIFO = executes before it)
# so duplicate replays skip all downstream processing including auth and rate limiting.
from src.middleware.idempotency import IdempotencyMiddleware
app.add_middleware(IdempotencyMiddleware)

# 🔒 App Check Middleware (Raw ASGI — no BaseHTTPMiddleware buffering)
# ⚠️  Uses raw ASGI protocol to avoid buffering StreamingResponse for /chat/stream
from src.middleware.app_check import validate_app_check_token
from src.core.exceptions import AppCheckError

class AppCheckMiddleware:
    """
    Raw ASGI middleware: Firebase App Check validation.

    Uses raw ASGI __call__ instead of @app.middleware("http") / BaseHTTPMiddleware
    to avoid buffering StreamingResponse bodies (which breaks /chat/stream).
    """
    _PUBLIC_PATHS = frozenset({"/health", "/ready", "/favicon.ico"})
    _DEV_PATHS = frozenset({"/docs", "/openapi.json"})

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Allow CORS preflight always
        if scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return

        # Public endpoints whitelist
        path = scope.get("path", "")
        allowed = self._PUBLIC_PATHS | (self._DEV_PATHS if settings.ENV == "development" else frozenset())
        if path in allowed:
            await self.app(scope, receive, send)
            return

        try:
            request = Request(scope, receive)
            await validate_app_check_token(request)
        except (AppCheckError, AppException) as e:
            import json as _json
            error_body = _json.dumps(
                APIErrorResponse(
                    error_code=e.error_code,
                    message=e.message,
                    detail=e.detail,
                ).model_dump()
            ).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": e.status_code,
                "headers": [
                    [b"content-type", b"application/json"],
                    [b"content-length", str(len(error_body)).encode()],
                ],
            })
            await send({
                "type": "http.response.body",
                "body": error_body,
            })
            return

        await self.app(scope, receive, send)

app.add_middleware(AppCheckMiddleware)

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

# Register reports router (gallery + dashboard stats)
from src.api.reports import router as reports_router
app.include_router(reports_router)

# Register metadata update router
from src.api.update_metadata import router as metadata_router
app.include_router(metadata_router)
# Register quote HITL router (skill: langgraph-hitl-patterns)
from src.api.routes.quote_routes import router as quote_router
app.include_router(quote_router)

# Register multi-room routes (room CRUD + analysis + aggregation)
from src.api.routes.room_routes import router as room_router
app.include_router(room_router)

# Register batch submission routes (multi-project quote batches)
from src.api.routes.batch_routes import router as batch_router
app.include_router(batch_router)

# Register users router
from src.api.users_router import router as users_router
app.include_router(users_router)

# Register feedback router (self-correction loop — evaluating-adk-agents skill)
from src.api.feedback import feedback_router
app.include_router(feedback_router)

# 🧪 TEST AUTOMATION ROUTER (Only in development)
if settings.ENV == "development":
    from src.api.test_router import router as test_router
    app.include_router(test_router)




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
@limiter.limit("5/minute")
async def submit_lead_endpoint(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    body: LeadSubmissionRequest,
    user_session: UserSession = Depends(verify_token),
):
    """
    Direct endpoint for the Lead Generation Form widget.
    Bypasses the agent to save data directly to DB.
    """
    from src.tools.submit_lead import submit_lead_wrapper
    
    user_id = user_session.uid
    
    result = await submit_lead_wrapper(
        name=body.name,
        email=body.email,
        phone=body.phone,
        project_details=body.quote_summary,
        uid=user_id,
        session_id=body.session_id
    )
    
    return {"status": "success", "message": result}

class ChatMessage(BaseModel):
    role: str = Field(..., pattern=r'^(user|assistant|system|tool)$')
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
    # is_authenticated removed: auth state is derived exclusively from the verified JWT
    # via Depends(verify_token) → user_session.is_authenticated. Accepting it from the body
    # was redundant and opened a spoofing vector (client-controlled field bypassing JWT).
    
    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}
    user_session: UserSession | None = Field(None, exclude=True) # Injected by Depends(verify_token)

    @model_validator(mode="before")
    @classmethod
    def _backfill_media_urls(cls, data: dict) -> dict:
        """Backward compatibility: promote imageUrls → mediaUrls when mediaUrls absent."""
        image_urls = data.get("imageUrls") or data.get("image_urls")
        if image_urls and not data.get("mediaUrls") and not data.get("media_urls"):
            data["mediaUrls"] = image_urls
        return data

@app.get("/health")
@app.get("/api/health")
def health_check():
    """Liveness probe — lightweight, no I/O. Cloud Run uses this to restart stuck containers."""
    return {"status": "ok", "service": "syd-brain"}


@app.get("/ready")
@app.get("/api/ready")
async def readiness_check():
    """
    Readiness probe for Cloud Run.
    Verifies Firestore connectivity with a 5-second timeout.
    Returns 200 OK when ready to serve traffic, 503 Service Unavailable otherwise.
    """
    import asyncio as _asyncio

    checks: dict[str, str] = {}

    def _ping_firestore():
        from src.db.firebase_client import get_firestore_client
        db = get_firestore_client()
        # Lightweight ping: fetch at most 1 doc from a sentinel collection
        list(db.collection("_health_probe").limit(1).stream())

    try:
        loop = _asyncio.get_event_loop()
        await _asyncio.wait_for(
            loop.run_in_executor(None, _ping_firestore),
            timeout=5.0,
        )
        checks["firestore"] = "ok"
    except _asyncio.TimeoutError:
        logger.warning("[/ready] Firestore ping timed out (>5s)")
        checks["firestore"] = "timeout"
    except Exception as _e:
        logger.warning(f"[/ready] Firestore check failed: {type(_e).__name__}")
        checks["firestore"] = "error"

    all_ok = all(v == "ok" for v in checks.values())
    return JSONResponse(
        status_code=200 if all_ok else 503,
        content={"status": "ready" if all_ok else "not_ready", "checks": checks},
    )


async def chat_stream_generator(
    request: ChatRequest,
    user_session: UserSession,
    orchestrator: BaseOrchestrator,
):
    """
    Delegates streaming to the AgentOrchestrator.
    """
    # Pass user_session.uid as credentials for backward compatibility if needed, 
    # but the orchestrator should ideally use request.user_session
    async for chunk in orchestrator.stream_chat(request, user_session):
        yield chunk



@app.post("/chat/stream")
@limiter.limit("30/minute")
async def chat_stream(
    request: Request,
    body: ChatRequest,
    background_tasks: BackgroundTasks,
    user_session: UserSession = Depends(verify_token),
    orchestrator: BaseOrchestrator = Depends(get_orchestrator)
):
    """
    Streaming chat endpoint - Secured by Internal JWT.
    Auth is enforced via Depends(verify_token).
    """
    body.user_session = user_session
    # 🛡️ Multimodal Rate Limiting Penalty (Token Bucket)
    # se la richiesta contiene immagini o video, consumiamo 4 token extra
    # per compensare l'alto costo computazionale di Gemini 2.5/3.0 Vision.
    has_media = bool(body.media_urls or body.video_file_uris)
    if has_media:
        from slowapi.util import get_remote_address
        from slowapi.errors import RateLimitExceeded
        
        # slowapi exposes the underlying limits.Limiter via list of limits
        # We manually consume extra tokens for this specific limit
        try:
            # Il decorator ha già consumato 1 token. Consumiamone altri 4.
            # Fix: Avoid KeyError if the route is not correctly registered in _route_limits
            # SlowAPI might use different keys depending on how the route was defined.
            route_limits = getattr(limiter, "_route_limits", {}).get(request.url.path, [])
            for limit in route_limits:
                if not limiter._limiter.hit(limit.limit, get_remote_address(request), cost=4):
                    raise RateLimitExceeded(limit)
        except RateLimitExceeded as e:
            logger.warning(f"Rate limit exceeded due to multimodal penalty for {get_remote_address(request)}")
            raise e
        except Exception as e:
            logger.warning(f"Failed to apply multimodal rate limit penalty: {e}")
            # Non-blocking: we continue even if penalty fails to avoid crashing the whole stream

    logger.info(
        "Chat stream request received. Starting StreamingResponse.",
        extra={"message_count": len(body.messages), "session_id": body.session_id, "has_media": has_media},
    )

    # --- CHRONOLOGICAL ANCHOR: SAVE USER MESSAGE BEFORE GENERATOR ---
    # We must ensure the user message is written to Firestore BEFORE the generator starts.
    # 🔥 FIXED: Use explicit Python timestamp (minus 100ms) to guarantee it's physically 
    # earlier than the assistant's response in the same request flow.
    user_msg_text = ""
    if body.messages:
        last_content = body.messages[-1].content
        user_msg_text = last_content if isinstance(last_content, str) else str(last_content)

    from datetime import datetime, timezone, timedelta
    from src.repositories.conversation_repository import get_conversation_repository
    # Anchor timestamp: 100ms in the past guarantees user message sorts before assistant
    anchor_timestamp = datetime.now(timezone.utc) - timedelta(milliseconds=100)
    
    # Extract attachments for persistence
    attachments = None
    media_urls = getattr(body, "media_urls", None)
    video_file_uris = getattr(body, "video_file_uris", None)

    if media_urls or video_file_uris:
        attachments = {
            "images": media_urls if media_urls else [],
            "videos": video_file_uris if video_file_uris else []
        }
            
    async def _persist_user_message():
        """Background: persist user message to Firestore without blocking the stream."""
        try:
            repo = get_conversation_repository()
            await repo.ensure_session(body.session_id, user_session.uid)
            await repo.save_message(
                session_id=body.session_id,
                role="user",
                content=user_msg_text or "",
                metadata={"user_id": user_session.uid, "source": "chat_stream_route"},
                attachments=attachments,
                timestamp=anchor_timestamp,
            )
            logger.info(f"[Anchor] User message persisted for session {body.session_id}")
        except Exception as e:
            logger.error(f"Failed to pre-persist user message in route: {e}")

    background_tasks.add_task(_persist_user_message)

    # Directly pass the async iterator to StreamingResponse
    return StreamingResponse(
        orchestrator.stream_chat(body, user_session, background_tasks),
        media_type="text/plain; charset=utf-8",
        headers={
            "Connection": "close", 
            "x-vercel-ai-data-stream": "v1", 
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache"
        },
        background=background_tasks
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
