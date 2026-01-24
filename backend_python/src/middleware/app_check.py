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

logger = logging.getLogger(__name__)

# Feature flag - Set to "true" in production after monitoring phase
ENABLE_APP_CHECK = os.getenv("ENABLE_APP_CHECK", "false").lower() == "true"


async def validate_app_check_token(request: Request) -> Optional[dict]:
    """
    Validate App Check token from request headers.
    
    Args:
        request: FastAPI Request object
        
    Returns:
        Decoded token payload if valid, None if validation disabled
        
    Raises:
        HTTPException: If token is invalid or missing (when enforcement is enabled)
    """
    # Skip validation if feature flag is disabled
    if not ENABLE_APP_CHECK:
        logger.debug("[App Check] Validation disabled via ENABLE_APP_CHECK flag")
        return None
    
    # Extract token from header
    app_check_token = request.headers.get("X-Firebase-AppCheck")
    
    if not app_check_token:
        logger.warning(f"[App Check] Missing token from {request.client.host}")
        raise HTTPException(
            status_code=401,
            detail="Missing App Check token"
        )
    
    try:
        # Ensure Firebase is initialized
        init_firebase()
        
        # Verify token via Firebase Admin SDK
        decoded_token = app_check.verify_token(app_check_token)
        
        logger.info(f"[App Check] ✅ Valid token from {request.client.host}")
        return decoded_token
        
    except app_check.TokenVerificationError as e:
        logger.warning(f"[App Check] Invalid token: {str(e)[:100]}")
        raise HTTPException(
            status_code=403,
            detail="Invalid App Check token"
        )
    except Exception as e:
        # Graceful degradation: log error but don't block request
        # This prevents Firebase outages from breaking the app
        logger.error(f"[App Check] Verification error (non-fatal): {str(e)}")
        
        # In strict mode, you might want to raise here instead
        # For now, we allow the request to proceed during Firebase issues
        return None


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
