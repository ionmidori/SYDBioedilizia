"""
Firebase App Check Middleware

Validates App Check tokens from client requests to prevent bot abuse.
Uses feature flag (ENABLE_APP_CHECK) for safe rollback.

Security Features:
- Validates tokens via Firebase Admin SDK
- Blocks requests without valid tokens (when enabled)
- Logs telemetry for monitoring
- Graceful degradation if Firebase is unreachable
"""

import logging
import re

from fastapi import Request
from firebase_admin import app_check
from firebase_admin.exceptions import FirebaseError
from src.auth.jwt_handler import _verify_id_token_cached
from src.core.config import settings
from src.core.exceptions import AppCheckError
from src.db.firebase_client import init_firebase

logger = logging.getLogger(__name__)

# Feature flag - Set to "true" in production after monitoring phase
ENABLE_APP_CHECK = settings.ENABLE_APP_CHECK


# Client-area reads a signed-in user may make WITHOUT an App Check token.
# Safari on iPhone never produced one (reCAPTCHA failing on the device), so
# every dashboard call was answered 403 "Missing App Check token". Only the
# user's own read-only data (each route still checks ownership) plus the claim
# of their guest project; chat, renders, uploads and writes stay strict.
_AUTH_FALLBACK_ROUTES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("GET", re.compile(r"/api/projects")),
    ("GET", re.compile(r"/api/projects/[^/]+")),
    ("GET", re.compile(r"/api/reports/(dashboard|gallery)")),
    ("GET", re.compile(r"/api/quote/user/[^/]+")),
    ("POST", re.compile(r"/api/projects/[^/]+/claim")),
)


def _is_auth_fallback_route(method: str, path: str) -> bool:
    return any(method == m and pattern.fullmatch(path) for m, pattern in _AUTH_FALLBACK_ROUTES)


async def _registered_uid(request: Request) -> str | None:
    """uid of a verified, non-anonymous Firebase user, or None."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    try:
        init_firebase()
        decoded = await _verify_id_token_cached(
            auth_header.removeprefix("Bearer "), settings.AUTH_TOKEN_CACHE_SECONDS
        )
    except (ValueError, FirebaseError) as e:  # invalid/expired/revoked: no fallback
        logger.warning(f"[App Check] Fallback ID token rejected: {type(e).__name__}")
        return None
    expected_aud = settings.GOOGLE_CLOUD_PROJECT or settings.FIREBASE_PROJECT_ID
    if expected_aud and decoded.get("aud") != expected_aud:
        return None
    if decoded.get("firebase", {}).get("sign_in_provider") == "anonymous":
        return None
    return decoded.get("uid")


async def validate_app_check_token(request: Request) -> dict | None:
    """
    Validate App Check token from request headers.

    In Monitoring Mode (ENABLE_APP_CHECK=False), it logs the result but never blocks.
    In Strict Mode (ENABLE_APP_CHECK=True), it raises AppCheckError for invalid/missing tokens.
    """
    app_check_token = request.headers.get("X-Firebase-AppCheck")
    # request.client is Optional (None for some ASGI/test transports); resolve once.
    client_host = request.client.host if request.client else "unknown"

    # Telemetry logic (Runs always if token is present)
    decoded_token = None
    if app_check_token:
        try:
            init_firebase()
            decoded_token = app_check.verify_token(app_check_token)
            logger.info(f"[App Check] ✅ Valid token from {client_host}")
        except Exception as e:  # noqa: BLE001
            # Handles: InvalidTokenError, ExpiredSignatureError, InvalidAudienceError, etc.
            # None of these are fatal in monitoring mode — they just mean decoded_token remains None.
            logger.warning(f"[App Check] ⚠️ Token verification failed from {client_host}: {type(e).__name__}: {str(e)[:100]}")

    # Enforcement Logic
    if ENABLE_APP_CHECK:
        if not app_check_token:
            if _is_auth_fallback_route(request.method, request.url.path):
                uid = await _registered_uid(request)
                if uid:
                    logger.warning(
                        "[App Check] Missing token, allowed for signed-in user",
                        extra={"event": "app_check_auth_fallback", "uid": uid,
                               "path": request.url.path,
                               "user_agent": request.headers.get("User-Agent", "")[:200]},
                    )
                    return None
            # X-AppCheck-Error: why the browser has no token (SDK error code,
            # set by web_client/lib/api-client.ts) — the diagnosis on iPhone.
            logger.warning(
                f"[App Check] [STRICT] Missing token from {client_host}",
                extra={"event": "app_check_missing",
                       "client_error": request.headers.get("X-AppCheck-Error", "")[:80],
                       "user_agent": request.headers.get("User-Agent", "")[:200]},
            )
            raise AppCheckError("Missing App Check token", detail={"reason": "missing_header"})

        if not decoded_token:
            # If we reach here and ENABLE_APP_CHECK is true, it means the token was invalid or verification crashed
            logger.error(f"[App Check] [STRICT] Blocking request from {client_host} - Invalid token")
            raise AppCheckError("Invalid App Check token", detail={"reason": "verification_failed"})

    return decoded_token


def get_app_check_status() -> dict:
    """
    Get current App Check configuration status.
    Used for health checks and debugging.

    Returns:
        Dict with enforcement status and configuration
    """
    return {
        "enabled": ENABLE_APP_CHECK,
        "enforcement_mode": "strict" if ENABLE_APP_CHECK else "monitoring",
        "header_name": "X-Firebase-AppCheck"
    }
