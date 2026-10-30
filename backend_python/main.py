from dotenv import load_dotenv

load_dotenv(".env")  # Load .env into os.environ before any other imports (required by google-adk, google-genai)

import asyncio
import time
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any, cast

from fastapi import BackgroundTasks, Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from google.api_core.exceptions import GoogleAPICallError
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from src.auth.jwt_handler import verify_token
from src.core.chat_timing import start_turn
from src.core.config import settings
from src.core.context import set_request_id
from src.core.exceptions import AppException, ChatMerged, PermissionDenied
from src.core.logger import get_logger, setup_logging
from src.core.models import validate_configured_models
from src.core.rate_limit import charge_extra, limiter
from src.core.schemas import APIErrorResponse
from src.core.warmup import WarmupStep, run_warmup
from src.db.firebase_client import get_async_firestore_client, init_firebase
from src.repositories.room_repository import get_room_repository
from src.schemas.internal import UserSession
from src.schemas.room import ROOM_ID_PATTERN
from src.services.base_orchestrator import BaseOrchestrator
from src.services.model_armor.model_armor_client import get_model_armor_service
from src.services.orchestrator_factory import get_orchestrator, warm_up_orchestrator
from src.services.pricing_service import PricingService
from src.services.user_chat.service import require_user_chat
from starlette.datastructures import State

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🔥 LOGGING & APP SETUP
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
setup_logging()
logger = get_logger(__name__)


def _warm_model_armor() -> None:
    service = get_model_armor_service()
    if service is not None:
        service.warm_up()


async def background_warmup(state: State) -> None:
    """Initialize everything the first chat turn would otherwise pay for.

    The ADK runner, Firebase Admin, the async Firestore client and the Model
    Armor client cost ~1s each when lazy (measured in production on the first
    turn of a cold instance). Each step has a time limit (src/core/warmup.py).
    """
    started = time.perf_counter()
    problems: list[str] = []

    async def validate_models() -> None:
        # A retired model ID surfaces here, at deploy, instead of in a user's chat.
        problems.extend(await validate_configured_models())

    report = await run_warmup(
        parallel=[
            WarmupStep("models", validate_models),
            WarmupStep("adk_orchestrator", warm_up_orchestrator),
            WarmupStep("firebase_admin", init_firebase),
            WarmupStep("model_armor", _warm_model_armor),
        ],
        sequential=[
            # The async Firestore client binds its gRPC channel to the running event
            # loop, so it is created on the loop (cheap constructor), not in a thread.
            WarmupStep("firestore_async", get_async_firestore_client, in_thread=False, requires="firebase_admin"),
            # Prices edited in the admin console: load them before the first quote.
            WarmupStep("price_book", PricingService.ensure_fresh, in_thread=False),
        ],
        step_timeout_s=settings.WARMUP_STEP_TIMEOUT_SECONDS,
    )
    state.warmup_report = report
    # Models not verified in time: MODEL_VALIDATION_STRICT keeps the revision out of service.
    state.model_problems = ["model validation timed out"] if report["models"] == "timed_out" else problems
    logger.info(
        "ADKOrchestrator warm-up complete.",
        extra={"duration_ms": round((time.perf_counter() - started) * 1000, 1), "warmup_report": report},
    )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Application lifespan: startup and shutdown logic."""
    import asyncio
    logger.info("SYD Brain API starting on port 8080...")

    # ── OpenTelemetry Tracing ──────────────────────────────────────────────────
    from src.core.tracing import init_tracing, shutdown_tracing
    init_tracing()

    # ── Non-blocking warm-up ──────────────────────────────────────────────────
    # /health and non-chat endpoints answer immediately; /health/startup returns
    # 503 until the warm-up is done, so a Cloud Run startup probe on it keeps
    # traffic away from an instance that is not ready (the first /chat/stream
    # would otherwise block on the factory lock).
    #
    # Task reference stored on app.state per python-production-coding skill
    # ("No fire-and-forget: never use create_task without storing the reference").
    warmup_task = asyncio.create_task(background_warmup(_app.state))
    _app.state.warmup_task = warmup_task

    yield
    # ── Graceful Shutdown ──────────────────────────────────────────────────────
    # Cloud Run sends SIGTERM and waits up to 40s (--timeout-graceful-shutdown).
    # uvicorn drains active SSE connections; we clean up owned gRPC resources here.
    logger.warning("SYD Brain API shutdown initiated — draining connections...")
    if not warmup_task.done():
        warmup_task.cancel()
        logger.info("Cancelled in-progress ADKOrchestrator warm-up.")
    shutdown_tracing()
    try:
        import src.db.firebase_client as _fb
        client = _fb._async_db_client
        if client is not None:
            # AsyncClient.close() is synchronous (returns None); `await`-ing it
            # raised TypeError that the except below swallowed, so the gRPC
            # channel was never actually closed on shutdown.
            client.close()
            logger.info("Async Firestore gRPC channel closed.")
    except Exception as _e:  # noqa: BLE001
        logger.warning(f"Non-fatal error during shutdown cleanup: {_e}")
    logger.info("SYD Brain API shutdown complete.")

app = FastAPI(title="SYD Brain", version="2.9.21", lifespan=lifespan)
app.state.limiter = limiter
# slowapi's handler is typed (Request, RateLimitExceeded) -> Response; starlette's
# add_exception_handler wants (Request, Exception) -> Response. The narrower exc
# type is a stub incompatibility for this documented-correct registration.
app.add_exception_handler(RateLimitExceeded, cast(Any, _rate_limit_exceeded_handler))

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

# Registered in the "Middleware stack" block below (it must wrap App Check and
# the error catcher, so their 403/500 carry Access-Control-Allow-Origin).

# 🆔 Request ID Middleware (Raw ASGI — no BaseHTTPMiddleware buffering)
# ⚠️  Uses raw ASGI protocol to avoid buffering StreamingResponse for /chat/stream
from starlette.types import ASGIApp as _ASGIApp
from starlette.types import Receive as _Receive
from starlette.types import Scope as _Scope
from starlette.types import Send as _Send


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

# 📊 Metrics Middleware (Raw ASGI — no BaseHTTPMiddleware buffering)
from src.middleware.metrics import MetricsMiddleware


# 🛡️ Global Exception Handlers
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    """Handles known application errors."""
    logger.error(f"AppException: {exc.message} ({exc.error_code})")
    headers = {}
    # RFC 6585 / RFC 9110: Retry-After on 429 (quota) and 503 (quota store down)
    if exc.status_code in (429, 503) and exc.detail and exc.detail.get("reset_at"):
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
    """Last-resort 500 (Starlette's ServerErrorMiddleware, outside every layer).

    GlobalErrorCatcherMiddleware answers first for anything raised inside the
    stack, so this only runs if RequestID, SecurityHeaders or the catcher
    itself raise.
    """
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

# 🔥 Global Error Catcher Middleware
# A true try/except around App Check, Idempotency and the app, catching
# exceptions that escape @app.exception_handler (i.e. from other middlewares).
# Its position in the stack is set in the "Middleware stack" block below.
#
# ⚠️  CRITICAL: Uses raw ASGI protocol, NOT BaseHTTPMiddleware.
# BaseHTTPMiddleware buffers streaming response bodies into memory before
# forwarding, which breaks StreamingResponse for /chat/stream.
# See: https://www.starlette.io/middleware/#limitations
from starlette.types import ASGIApp, Receive, Scope, Send


class GlobalErrorCatcherMiddleware:
    """
    Safety net for the application (raw ASGI).

    Catches any unhandled exception from the layers it wraps (App Check,
    Idempotency, Metrics, CORS, routes) and returns a standardized
    APIErrorResponse JSON. Only RequestID and SecurityHeaders sit outside it,
    so its 500 carries X-Request-ID and the security headers and its
    request_id can be correlated with logs. (Without it Starlette's
    ServerErrorMiddleware would still answer in JSON through
    global_exception_handler, but from outside those layers.)

    Uses raw ASGI __call__ instead of BaseHTTPMiddleware.dispatch() to avoid
    buffering StreamingResponse bodies (which would break /chat/stream SSE).
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

# 🔁 Idempotency Middleware (non-streaming POST endpoints only)
# Replays cached responses for duplicate requests bearing the same Idempotency-Key,
# so duplicate replays skip all downstream processing including auth and rate limiting.
# 🔒 App Check Middleware (Raw ASGI — no BaseHTTPMiddleware buffering)
# ⚠️  Uses raw ASGI protocol to avoid buffering StreamingResponse for /chat/stream
from src.core.exceptions import AppCheckError
from src.middleware.app_check import validate_app_check_token
from src.middleware.idempotency import IdempotencyMiddleware


class AppCheckMiddleware:
    """
    Raw ASGI middleware: Firebase App Check validation.

    Uses raw ASGI __call__ instead of @app.middleware("http") / BaseHTTPMiddleware
    to avoid buffering StreamingResponse bodies (which breaks /chat/stream).
    """
    # "/api/health" is the same liveness probe as "/health": the frontend warmup
    # reaches it through the /api/py/* rewrite and was answered 403 on every visit.
    # "/health/startup" is the Cloud Run startup probe: it carries no App Check
    # token, and a 403 there would keep every new revision from ever starting.
    _PUBLIC_PATHS = frozenset({
        "/health", "/health/startup", "/api/health", "/ready", "/favicon.ico",
        "/internal/lifecycle/run",
        # Email platform (Phase 128): Cloud Tasks OIDC / Brevo bearer token.
        "/internal/email/sweep", "/webhooks/email/brevo",
    })
    # Same, for paths with an id segment (own OIDC authentication).
    _PUBLIC_PREFIXES = ("/internal/email/dispatch/",)
    _DEV_PATHS = frozenset({"/docs", "/openapi.json"})
    # Public read-only homepage content. The landing page fetches it without an
    # App Check token (loading reCAPTCHA first would delay the hero gallery), so
    # it was answered 403 and the page always fell back to stock content. Only
    # GET: POST /api/content/testimonials still needs App Check + a user token.
    _PUBLIC_GET_PATHS = frozenset({"/api/content/testimonials", "/api/content/portfolio"})

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
        if (
            path in allowed
            or path.startswith(self._PUBLIC_PREFIXES)
            or (scope.get("method") == "GET" and path in self._PUBLIC_GET_PATHS)
        ):
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

# ─── Middleware stack ─────────────────────────────────────────────────────────
# add_middleware() is LIFO: the LAST call becomes the OUTERMOST layer. All layers
# are registered here, innermost first, so the order is explicit.
# Request flow, outermost -> innermost:
#
#   RequestID -> SecurityHeaders -> CORS -> GlobalErrorCatcher -> AppCheck
#   -> Idempotency -> Metrics -> routes
#
# - RequestID outermost: every response — App Check 403s and catcher 500s
#   included — carries X-Request-ID, and the error envelope's request_id
#   (read from the same ContextVar) matches it.
# - SecurityHeaders next: security headers on every response, errors included.
# - CORS outside the catcher and App Check: their 403/500 carry
#   Access-Control-Allow-Origin, so a browser calling the backend directly can
#   read error_code/request_id instead of an opaque CORS error (#482). It
#   answers preflights itself, inside RequestID/SecurityHeaders.
# - GlobalErrorCatcher wraps AppCheck and Idempotency, so a crash there is
#   answered by it from INSIDE RequestID/SecurityHeaders (X-Request-ID, security
#   headers, correlatable request_id). Anything that escapes the catcher is
#   still answered in JSON by Starlette's ServerErrorMiddleware (the
#   @app.exception_handler(Exception) above), but without those.
# - AppCheck before Idempotency: a cached replay is never served to an
#   unverified client; App Check rejections are not counted by Metrics.
# Guarded by tests/unit/test_middleware_order.py and test_api_error_contract.py.
app.add_middleware(MetricsMiddleware)
app.add_middleware(IdempotencyMiddleware)
app.add_middleware(AppCheckMiddleware)
app.add_middleware(GlobalErrorCatcherMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Firebase-AppCheck", "X-AppCheck-Error", "X-Request-ID"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)
# ─────────────────────────────────────────────────────────────────────────────

# Register Routers
from src.api.routes.upload import router as upload_router

app.include_router(upload_router)

# Register chat history router
from src.api.routes.chat_history import router as chat_history_router

app.include_router(chat_history_router)

# Register passkey router
from src.api.routes.passkey import router as passkey_router

app.include_router(passkey_router)

# Register projects router (Dashboard)
from src.api.routes.projects_router import router as projects_router

app.include_router(projects_router)

# Register guest claim router (guest chats follow the guest into its account)
from src.api.routes.guest_claim import router as guest_claim_router

app.include_router(guest_claim_router)

# Register the signed-in user's router (the user's chat, Phase 139)
from src.api.routes.me import router as me_router

app.include_router(me_router)

# Register metadata update router
from src.api.routes.update_metadata import router as metadata_router

# Under /api: the browser reaches it through the Next rewrite /api/py/* -> /api/* (#482).
app.include_router(metadata_router, prefix="/api")
# Register quote HITL router (skill: langgraph-hitl-patterns)
from src.api.routes.quote_routes import router as quote_router

app.include_router(quote_router)

# Register users router
from src.api.routes.users_router import router as users_router

app.include_router(users_router)

# Register feedback router (self-correction loop — evaluating-adk-agents skill)
from src.api.routes.feedback import feedback_router

app.include_router(feedback_router)

# Register public content routes (testimonials, portfolio — replaces direct Firestore reads)
from src.api.routes.content_routes import router as content_router

app.include_router(content_router)

# Register admin storage router (Signed URLs for direct upload)
from src.api.routes.admin_storage import router as admin_storage_router

app.include_router(admin_storage_router)

# Register admin quote review API (Phase 128 — /api/admin, role=admin claim)
from src.api.routes.admin_quotes import router as admin_quotes_router

app.include_router(admin_quotes_router)

from src.api.routes.admin_price_book import router as admin_price_book_router

app.include_router(admin_price_book_router)

# Admin content: portfolio, testimonials, KPIs/GDPR (Phase 128 — Fase 6.1b)
from src.api.routes.admin_dashboard import router as admin_dashboard_router
from src.api.routes.admin_portfolio import router as admin_portfolio_router
from src.api.routes.admin_testimonials import router as admin_testimonials_router

app.include_router(admin_portfolio_router)
app.include_router(admin_testimonials_router)
app.include_router(admin_dashboard_router)

# Register email platform router (outbox sweep + provider webhooks)
from src.api.routes.email_routes import router as email_router

app.include_router(email_router)

# Register account lifecycle routes (GDPR inactivity pipeline — Cloud Scheduler only)
from src.api.routes.lifecycle_routes import router as lifecycle_router

app.include_router(lifecycle_router)


class ChatMessage(BaseModel):
    # Client-supplied AI SDK message id. Persisted as the Firestore document id
    # for the user message so the streamed (optimistic) bubble and its stored row
    # share one identity — avoids the post-turn id swap that causes UI flicker.
    id: str | None = Field(None, max_length=128)
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

    # 🏠 Room of the project this turn is about (Phase 138). Checked against the
    # project before use; an unknown room is dropped, never trusted.
    room_id: str | None = Field(None, alias="roomId", pattern=ROOM_ID_PATTERN)
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


@app.get("/health/startup")
def startup_check(request: Request):
    """Startup probe for Cloud Run: 200 only once the background warm-up is done.

    Cloud Run routes no traffic to an instance until its startup probe passes,
    so users never wait on a half-initialized instance.
    """
    state = request.app.state
    warmup_task = getattr(state, "warmup_task", None)
    if warmup_task is None or not warmup_task.done():
        return JSONResponse(status_code=503, content={"status": "warming_up"})
    # An unexpected warm-up error is a bug (expected failures are absorbed by
    # src/core/warmup.py): keep the revision out of service; the stack is logged.
    if warmup_task.cancelled() or warmup_task.exception() is not None:
        return JSONResponse(status_code=503, content={"status": "warmup_failed"})
    # MODEL_VALIDATION_STRICT: a configured model the API does not serve keeps
    # the new revision out of service (the previous revision keeps serving).
    if settings.MODEL_VALIDATION_STRICT and getattr(state, "model_problems", None):
        return JSONResponse(
            status_code=503,
            # Public endpoint: details (model IDs, API errors) stay in the logs.
            content={"status": "model_unavailable"},
        )
    return {"status": "started"}


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
    except TimeoutError:
        logger.warning("[/ready] Firestore ping timed out (>5s)")
        checks["firestore"] = "timeout"
    except Exception as _e:  # noqa: BLE001
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



async def _is_project_room(project_id: str, room_id: str) -> bool:
    """True if the room belongs to the project; a failed lookup leaves the turn untagged."""
    try:
        return await get_room_repository().get_room(project_id, room_id) is not None
    except (GoogleAPICallError, ValidationError) as e:
        logger.error(f"Failed to check the room of the turn: {type(e).__name__}")
        return False


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
    turn = start_turn(body.session_id, getattr(request.state, "t_arrival", None))
    turn.mark("handler")
    # 🛡️ Multimodal Rate Limiting Penalty (Token Bucket)
    # se la richiesta contiene immagini o video, consumiamo 4 token extra
    # per compensare l'alto costo computazionale di Gemini 2.5/3.0 Vision.
    has_media = bool(body.media_urls or body.video_file_uris)
    if has_media:
        # Il decorator ha già consumato 1 token. Consumiamone altri 4, sullo stesso
        # bucket dell'utente (security audit 2026-10-03, L9).
        try:
            charge_extra(request, f"{chat_stream.__module__}.{chat_stream.__name__}", cost=4)
        except RateLimitExceeded:
            logger.warning("Rate limit exceeded due to multimodal penalty.")
            raise
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Failed to apply multimodal rate limit penalty: {e}")
            # Non-blocking: we continue even if penalty fails to avoid crashing the whole stream

    logger.info(
        "Chat stream request received. Starting StreamingResponse.",
        extra={"message_count": len(body.messages), "session_id": body.session_id, "has_media": has_media},
    )

    # --- CHRONOLOGICAL ANCHOR: SAVE USER MESSAGE BEFORE GENERATOR ---
    # Session doc MUST exist with userId BEFORE streaming starts, otherwise
    # save_message (called by the orchestrator for assistant messages) creates
    # a session doc WITHOUT userId via set(merge=True), and Firestore security
    # rules permanently deny client reads (onSnapshot gets permission-denied).
    user_msg_text = ""
    user_msg_id = None
    if body.messages:
        last_content = body.messages[-1].content
        user_msg_text = last_content if isinstance(last_content, str) else str(last_content)
        # Reuse the client's AI SDK message id as the Firestore doc id (stable identity).
        user_msg_id = body.messages[-1].id

    from datetime import datetime, timedelta

    from src.repositories.conversation_repository import get_conversation_repository
    # Anchor timestamp: 100ms in the past guarantees user message sorts before assistant
    anchor_timestamp = datetime.now(UTC) - timedelta(milliseconds=100)

    # Extract attachments for persistence
    attachments = None
    media_urls = getattr(body, "media_urls", None)
    video_file_uris = getattr(body, "video_file_uris", None)

    if media_urls or video_file_uris:
        attachments = {
            "images": media_urls if media_urls else [],
            "videos": video_file_uris if video_file_uris else []
        }

    # CRITICAL: ensure_session MUST run synchronously before streaming.
    # This sets userId on the session doc so Firestore security rules allow
    # client-side onSnapshot reads. Without this, the orchestrator's
    # save_message creates the doc first (without userId) and ensure_session
    # in the background task sees doc.exists=True and skips setting userId.
    repo = get_conversation_repository()
    # Only a room of this project tags the turn (the orchestrator reads body.room_id).
    # Looked up alongside the checks below: no extra round-trip before the first token.
    room_check = asyncio.create_task(_is_project_room(body.session_id, body.room_id)) if body.room_id else None
    # 🛡️ A registered user writes only in their chat (Phase 139): any other id —
    # a stale tab, an id the client picked — is a 409 the client recovers from by
    # asking /api/me/chat again. Checked before ensure_session, which would create
    # a session for an unknown id; a failed read fails the turn (fail closed).
    # 🛡️ PermissionDenied (session owned by another user) propagates as a 403
    # BEFORE the stream starts — the orchestrator must never load a foreign history.
    # ChatMerged (Phase 139: the chat now lives in the user's chat) as a 409.
    try:
        if not user_session.is_guest:
            await require_user_chat(get_async_firestore_client(), user_session.uid, body.session_id)
    except BaseException:
        if room_check is not None:
            room_check.cancel()
        raise
    try:
        await repo.ensure_session(body.session_id, user_session.uid, is_guest=user_session.is_guest)
    except (PermissionDenied, ChatMerged):
        if room_check is not None:
            room_check.cancel()
        raise
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to ensure session before stream: {e}")
    if room_check is not None and not await room_check:
        logger.warning("Unknown room for this project: turn not tagged", extra={"session_id": body.session_id})
        body.room_id = None
    turn.mark("session_ready")

    async def _persist_user_message():
        """Background: persist user message to Firestore without blocking the stream."""
        try:
            await repo.save_message(
                session_id=body.session_id,
                role="user",
                content=user_msg_text or "",
                metadata={"user_id": user_session.uid, "source": "chat_stream_route"},
                attachments=attachments,
                timestamp=anchor_timestamp,
                room_id=body.room_id,
                message_id=user_msg_id,
                is_guest=user_session.is_guest,
            )
            logger.info(f"[Anchor] User message persisted for session {body.session_id}")
        except Exception as e:  # noqa: BLE001
            logger.error(f"Failed to pre-persist user message in route: {e}")

    background_tasks.add_task(_persist_user_message)

    # Directly pass the async iterator to StreamingResponse.
    # The orchestrator emits the AI SDK v6 UI Message Stream protocol (SSE),
    # which @ai-sdk/react parses via x-vercel-ai-ui-message-stream: v1.
    return StreamingResponse(
        orchestrator.stream_chat(body, user_session, background_tasks),
        media_type="text/event-stream; charset=utf-8",
        headers={
            # No "Connection: close": the Next.js proxy keeps its connection to
            # Cloud Run alive across turns (no TLS handshake per message).
            "x-vercel-ai-ui-message-stream": "v1",
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache"
        },
        background=background_tasks
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
