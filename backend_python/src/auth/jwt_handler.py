import logging
from typing import Dict, Any
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth
from src.db.firebase_client import init_firebase

logger = logging.getLogger(__name__)

# Allow optional auth for Dev/Debug scripts (auto_error=False)
security = HTTPBearer(auto_error=False)

from src.schemas.internal import UserSession

from src.core.exceptions import AuthError

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> UserSession:
    """
    Validates the Firebase ID Token.
    Returns a strict UserSession object.
    
    Verifies the token signature and expiration using Firebase Admin SDK.
    Also checks if the token has been revoked (check_revoked=True).
    """
    from src.core.config import settings
    
    # S7 FIX: Restrict bypass to EXPLICIT development mode only
    if not credentials:
        if settings.ENV == "development":
            logger.warning("⚠️ Auth Bypass: No token provided in DEV mode. Using 'debug-user'.")
            return UserSession(
                uid="debug-user",
                email="debug@local",
                is_authenticated=True,
                is_debug_user=True,
                claims={"bypass": True}
            )
        else:
            raise AuthError("Authentication credentials required", detail={"reason": "missing_token"})

    token = credentials.credentials
    
    try:
        # Ensure Firebase is initialized
        init_firebase()
        
        # Verify the ID token
        # check_revoked=True enforces that the user is still active (handles bans/logout)
        decoded_token = auth.verify_id_token(token, check_revoked=True, clock_skew_seconds=60)
        
        return UserSession(
            uid=decoded_token.get("uid"),
            email=decoded_token.get("email"),
            is_authenticated=True,
            claims=decoded_token
        )
        
    except auth.RevokedIdTokenError:
        logger.warning("Revoked Firebase ID token provided")
        raise AuthError("Token revoked", detail={"reason": "revoked"})
    except auth.ExpiredIdTokenError:
        logger.warning("Expired Firebase ID token provided")
        raise AuthError("Token expired", detail={"reason": "expired"})
    except auth.InvalidIdTokenError as e:
        logger.warning(f"Invalid Firebase ID token: {str(e)}")
        raise AuthError("Invalid token", detail={"reason": str(e)})
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        raise AuthError("Authentication failed", detail={"reason": "unknown"})

def get_current_user(session: UserSession = Security(verify_token)) -> str:
    """Helper to extract user email from validated session."""
    return session.email or "unknown"

def get_current_user_id(session: UserSession = Security(verify_token)) -> str:
    """Helper to extract user ID from validated session."""
    return session.uid
