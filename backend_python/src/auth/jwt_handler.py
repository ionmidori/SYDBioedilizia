import asyncio
import hashlib
import logging
import time
from typing import Any

from fastapi import Request, Security
from fastapi.security import HTTPBearer
from firebase_admin import auth
from src.core.exceptions import AuthError
from src.db.firebase_client import init_firebase
from src.schemas.internal import UserSession

logger = logging.getLogger(__name__)

# Allow optional auth for Dev/Debug scripts (auto_error=False)
security = HTTPBearer(auto_error=False)

# ── Verified-token cache ─────────────────────────────────────────────────────
# `verify_id_token(check_revoked=True)` is a network call to Firebase Auth on
# every request, and the SDK call is synchronous. A token that verified clean is
# cached (by SHA-256, never the raw token) for AUTH_TOKEN_CACHE_SECONDS, capped
# at the token's own expiry. Trade-off: a token revoked server-side stays usable
# for at most that window on this instance. 0 disables the cache.
_MAX_CACHED_TOKENS = 4096
_verified_tokens: dict[str, tuple[float, dict[str, Any]]] = {}


def clear_verified_token_cache() -> None:
    _verified_tokens.clear()


async def _verify_id_token_cached(token: str, cache_seconds: float) -> dict[str, Any]:
    key = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = time.monotonic()
    cached = _verified_tokens.get(key)
    if cached is not None and cached[0] > now:
        return cached[1]
    # Synchronous SDK call (revocation check = HTTP request): off the event loop.
    decoded: dict[str, Any] = await asyncio.to_thread(
        auth.verify_id_token, token, check_revoked=True, clock_skew_seconds=60
    )
    ttl = min(cache_seconds, float(decoded.get("exp", 0)) - time.time())
    if ttl > 0:
        if len(_verified_tokens) >= _MAX_CACHED_TOKENS:
            _verified_tokens.pop(next(iter(_verified_tokens)))  # oldest entry
        _verified_tokens[key] = (now + ttl, decoded)
    return decoded


async def verify_token(req: Request) -> UserSession:
    """Verifies Firebase JWT and handles rate limiting.

    In development (ENV=development), skips token verification to avoid
    Firebase Admin SDK network calls that fail when credentials are not
    available (e.g. local dev with anonymous Firebase users).

    In production, always verifies the token via Firebase Admin SDK.
    """
    from src.core.config import settings
    if req is None:
        logger.error("[Auth] verify_token called with None Request object (likely from a misconfigured test or dependency)")
        raise AuthError(
            message="Internal authentication error: missing request context.",
            error_code="AUTH_INTERNAL_ERROR"
        )
    auth_header = req.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise AuthError(
            message="Authentication credentials are required and were not provided.",
            error_code="AUTH_MISSING"
        )

    token = auth_header.split("Bearer ")[1]

    # ─────────────────────────────────────────────────────────────────
    # 🛡️ DEVELOPMENT BYPASS — skip Firebase verification entirely.
    # Real Firebase anonymous tokens cannot be verified in local dev
    # because Firebase Admin SDK requires a full network round-trip to
    # Google's servers, which is fragile and unnecessary for dev testing.
    # The token is accepted as-is and decoded structurally if possible.
    # ─────────────────────────────────────────────────────────────────
    if settings.ENV == "development" and settings.ALLOW_AUTH_BYPASS:
        # Try to extract uid from the token payload (JWT middle section)
        uid = "dev-user"
        email = "dev@local"
        is_anonymous = True
        try:
            import base64
            import json as _json
            # JWT is 3 base64 parts separated by dots
            payload_b64 = token.split(".")[1]
            # Add padding if needed
            padding_needed = len(payload_b64) % 4
            if padding_needed:
                payload_b64 += "=" * (4 - padding_needed)

            # Use urlsafe_b64decode because JWTs use Base64URL encoding (- and _ instead of + and /)
            payload = _json.loads(base64.urlsafe_b64decode(payload_b64).decode("utf-8"))
            uid = payload.get("user_id") or payload.get("sub") or payload.get("uid") or "dev-user"
            email = payload.get("email") or "dev@local"
            provider = payload.get("firebase", {}).get("sign_in_provider", "anonymous")
            is_anonymous = (provider == "anonymous")
        except Exception:  # noqa: BLE001
            pass  # Non-standard token format (DUMMY_TOKEN etc.) — use defaults

        logger.warning(
            "Auth Bypass (DEV): Skipping Firebase token verification.",
            extra={"uid": uid, "is_anonymous": is_anonymous}
        )
        # Expose uid for identity-aware rate limiting (src/core/rate_limit.py).
        req.state.uid = uid
        return UserSession(
            uid=uid,
            email=email,
            is_authenticated=True,
            is_anonymous=is_anonymous,
            is_debug_user=True,
            claims={"bypass": True, "uid": uid}
        )

    # ─────────────────────────────────────────────────────────────────
    # 🔒 PRODUCTION — Full Firebase Admin SDK verification.
    # ─────────────────────────────────────────────────────────────────
    # req.client is Optional (None for some ASGI/test transports); resolve once.
    client_host = req.client.host if req.client else "unknown"
    try:
        # Ensure Firebase is initialized
        init_firebase()

        # Verify the ID token using the Firebase Admin SDK.
        # This performs asymmetric RSA signature verification using public keys
        # cached automatically by the SDK (rotated ~every 6 hours).
        # check_revoked=True (revocation list), with a short verified-token
        # cache: see _verify_id_token_cached.
        decoded_token = await _verify_id_token_cached(token, settings.AUTH_TOKEN_CACHE_SECONDS)

        # Extra Architecture Guard: Explicitly verify that the audience matches our Project ID.
        # Although verify_id_token does this, explicit verification prevents cross-project
        # token injection if multiple projects share an environment accidentally.
        expected_aud = settings.GOOGLE_CLOUD_PROJECT or settings.FIREBASE_PROJECT_ID
        if expected_aud and decoded_token.get("aud") != expected_aud:
            logger.error(f"JWT Audience mismatch. Expected: {expected_aud}, Got: {decoded_token.get('aud')}")
            raise AuthError("Invalid audience", detail={"reason": "project_mismatch"})

        session = UserSession(
            uid=decoded_token["uid"],  # always set by verify_id_token
            email=decoded_token.get("email"),
            is_authenticated=True,
            is_anonymous=(decoded_token.get("firebase", {}).get("sign_in_provider") == "anonymous"),
            claims=decoded_token
        )

        # Expose uid for identity-aware rate limiting (src/core/rate_limit.py).
        req.state.uid = session.uid

        # Track activity for non-anonymous users (debounced, fire-and-forget)
        if not session.is_anonymous and session.uid:
            from src.auth.activity_tracker import schedule_touch
            schedule_touch(session.uid)

        return session

    except auth.RevokedIdTokenError as e:
        logger.warning(f"Revoked Firebase ID token provided from {client_host}")
        raise AuthError("Token revoked", detail={"reason": "revoked"}) from e
    except auth.ExpiredIdTokenError as e:
        logger.warning(f"Expired Firebase ID token provided from {client_host}")
        raise AuthError("Token expired", detail={"reason": "expired"}) from e
    except auth.InvalidIdTokenError as e:
        logger.warning(f"Invalid Firebase ID token from {client_host}: {str(e)}")
        raise AuthError("Invalid token", detail={"reason": "Token validation failed"}) from e
    except Exception as e:
        if isinstance(e, AuthError):
            raise
        logger.error(f"Unexpected Authentication error: {str(e)}", exc_info=True)
        raise AuthError("Authentication failed", detail={"reason": "internal_error"}) from e

def get_current_user(session: UserSession = Security(verify_token)) -> str:
    """Helper to extract user email from validated session."""
    return session.email or "unknown"

def get_current_user_id(session: UserSession = Security(verify_token)) -> str:
    """Helper to extract user ID from validated session."""
    return session.uid
