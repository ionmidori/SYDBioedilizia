import logging
from typing import Dict, Any
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth
from src.db.firebase_client import init_firebase

logger = logging.getLogger(__name__)

# Allow optional auth for Dev/Debug scripts (auto_error=False)
security = HTTPBearer(auto_error=False)

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> Dict[str, Any]:
    """
    Validates the Firebase ID Token.
    
    Verifies the token signature and expiration using Firebase Admin SDK.
    Also checks if the token has been revoked (check_revoked=True).
    """
    import os
    
    # ⚡ DEV MODE BYPASS
    if not credentials:
        if os.getenv("ENV") != "production":
            logger.warning("⚠️ Auth Bypass: No token provided in DEV mode. Using 'debug-user'.")
            return {"uid": "debug-user", "email": "debug@local", "bypass": True}
        else:
            raise HTTPException(status_code=401, detail="Authentication credentials required")

    token = credentials.credentials
    
    try:
        # Ensure Firebase is initialized
        init_firebase()
        
        # Verify the ID token
        # check_revoked=True enforces that the user is still active (handles bans/logout)
        decoded_token = auth.verify_id_token(token, check_revoked=True, clock_skew_seconds=60)
        
        return decoded_token
        
    except auth.RevokedIdTokenError:
        logger.warning("Revoked Firebase ID token provided")
        raise HTTPException(status_code=401, detail="Token revoked")
    except auth.ExpiredIdTokenError:
        logger.warning("Expired Firebase ID token provided")
        raise HTTPException(status_code=401, detail="Token expired")
    except auth.InvalidIdTokenError as e:
        logger.warning(f"Invalid Firebase ID token: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        raise HTTPException(status_code=401, detail="Authentication failed")

def get_current_user(payload: Dict[str, Any] = Security(verify_token)) -> str:
    """Helper to extract user email from validated token."""
    return payload.get("email", "unknown")

def get_current_user_id(payload: Dict[str, Any] = Security(verify_token)) -> str:
    """Helper to extract user ID from validated token."""
    return payload.get("uid")
