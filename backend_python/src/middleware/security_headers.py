from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Prevent MIME-sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Clickjacking protection
        response.headers["X-Frame-Options"] = "DENY"

        # XSS Protection (Legacy browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # HSTS (Force HTTPS) - 1 year + preload
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )

        # Content Security Policy (API-focused: strict defaults)
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; "
            "img-src 'self' data: https://firebasestorage.googleapis.com https://storage.googleapis.com; "
            "script-src 'self'; "
            "style-src 'self'; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )

        # Permissions Policy (restrict unnecessary browser features)
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), "
            "payment=(), usb=(), magnetometer=(), gyroscope=()"
        )

        # Referrer Policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Prevent caching of API responses with auth data
        if request.url.path != "/health":
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"

        return response
