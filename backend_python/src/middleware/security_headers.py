"""
Security Headers Middleware (Raw ASGI)

Injects security headers (HSTS, CSP, X-Frame-Options, etc.) into all HTTP responses.

⚠️  CRITICAL: Uses raw ASGI protocol, NOT BaseHTTPMiddleware.
BaseHTTPMiddleware buffers streaming response bodies into memory before
forwarding, which breaks StreamingResponse for /chat/stream.
See: https://www.starlette.io/middleware/#limitations
"""
from starlette.types import ASGIApp, Receive, Scope, Send


# Pre-encoded header pairs for zero-alloc injection
_SECURITY_HEADERS: list[tuple[bytes, bytes]] = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"x-xss-protection", b"1; mode=block"),
    (b"strict-transport-security", b"max-age=31536000; includeSubDomains; preload"),
    (b"content-security-policy", (
        "default-src 'none'; "
        "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.googleusercontent.com; "
        "script-src 'self'; "
        "style-src 'self'; "
        "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self';"
    ).encode()),
    (b"permissions-policy", (
        "camera=(), microphone=(), geolocation=(), "
        "payment=(), usb=(), magnetometer=(), gyroscope=()"
    ).encode()),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
]

_CACHE_HEADERS: list[tuple[bytes, bytes]] = [
    (b"cache-control", b"no-store, no-cache, must-revalidate"),
    (b"pragma", b"no-cache"),
]


class SecurityHeadersMiddleware:
    """
    Raw ASGI middleware that injects security headers into every HTTP response.

    Unlike the previous BaseHTTPMiddleware implementation, this does NOT buffer
    the response body — it intercepts only the `http.response.start` message
    to append headers, then passes all body chunks through untouched.
    """
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        is_health = path == "/health"

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(_SECURITY_HEADERS)
                if not is_health:
                    headers.extend(_CACHE_HEADERS)
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)

