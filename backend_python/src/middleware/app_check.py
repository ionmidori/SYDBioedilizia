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

import os
import logging
from typing import Optional
from fastapi import Request, HTTPException
from firebase_admin import app_check
from src.db.firebase_client import init_firebase

from src.core.config import settings

logger = logging.getLogger(__name__)

# Feature flag - Set to "true" in production after monitoring phase
ENABLE_APP_CHECK = settings.ENABLE_APP_CHECK


from src.core.exceptions import AppCheckError

async def validate_app_check_token(request: Request) -> Optional[dict]:
    """
    Validate App Check token from request headers.
    
    In Monitoring Mode (ENABLE_APP_CHECK=False), it logs the result but never blocks.
    In Strict Mode (ENABLE_APP_CHECK=True), it raises AppCheckError for invalid/missing tokens.
    """
    app_check_token = request.headers.get("X-Firebase-AppCheck")
    
    # Telemetry logic (Runs always if token is present)
    decoded_token = None
    if app_check_token:
        try:
            init_firebase()
            decoded_token = app_check.verify_token(app_check_token)
            logger.info(f"[App Check] ✅ Valid token from {request.client.host}")
        except app_check.TokenVerificationError as e:
            logger.warning(f"[App Check] ⚠️ Invalid token from {request.client.host}: {str(e)[:100]}")
        except Exception as e:
            logger.error(f"[App Check] Verification error (non-fatal): {str(e)}")

    # Enforcement Logic
    if ENABLE_APP_CHECK:
        if not app_check_token:
            logger.warning(f"[App Check] [STRICT] Missing token from {request.client.host}")
            raise AppCheckError("Missing App Check token", detail={"reason": "missing_header"})
        
        if not decoded_token:
            # If we reach here and ENABLE_APP_CHECK is true, it means the token was invalid or verification crashed
            logger.error(f"[App Check] [STRICT] Blocking request from {request.client.host} - Invalid token")
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
