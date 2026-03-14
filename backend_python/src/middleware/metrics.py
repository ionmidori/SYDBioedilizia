"""
Metrics Middleware for Performance Monitoring (Raw ASGI)

Tracks request metrics and logs them in JSON format for observability.
Integrates with the existing Request ID system for request correlation.

⚠️  CRITICAL: Uses raw ASGI protocol, NOT @app.middleware("http").
The function-based middleware internally uses BaseHTTPMiddleware which
buffers streaming response bodies into memory before returning, breaking
StreamingResponse for /chat/stream.
See: https://www.starlette.io/middleware/#limitations
"""

import time
from starlette.types import ASGIApp, Receive, Scope, Send
from src.core.context import get_request_id
from src.core.logger import get_logger

logger = get_logger(__name__)


class MetricsMiddleware:
    """
    Raw ASGI middleware that tracks request duration and logs metrics.

    Unlike the previous function-based middleware (@app.middleware("http")),
    this does NOT buffer the response body. Duration is measured from request
    start to the first response body chunk being sent (time-to-first-byte),
    which is more meaningful for streaming endpoints anyway.
    """
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start_time = time.time()
        status_code = 200
        first_body_sent = False

        async def send_with_metrics(message):
            nonlocal status_code, first_body_sent

            if message["type"] == "http.response.start":
                status_code = message.get("status", 200)
                # Inject X-Response-Time header
                duration_ms = round((time.time() - start_time) * 1000, 2)
                headers = list(message.get("headers", []))
                headers.append(
                    (b"x-response-time", f"{duration_ms}ms".encode())
                )
                message = {**message, "headers": headers}

            if message["type"] == "http.response.body" and not first_body_sent:
                first_body_sent = True
                duration_ms = round((time.time() - start_time) * 1000, 2)
                path = scope.get("path", "")
                method = scope.get("method", "")
                client = scope.get("client")
                client_host = client[0] if client else "unknown"

                logger.info(
                    "request_completed",
                    extra={
                        "method": method,
                        "path": path,
                        "status_code": status_code,
                        "duration_ms": duration_ms,
                        "request_id": get_request_id(),
                        "client_host": client_host,
                    }
                )

            await send(message)

        await self.app(scope, receive, send_with_metrics)

