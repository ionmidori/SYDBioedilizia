import os
import jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Dict, Any
from dotenv import load_dotenv

load_dotenv()

INTERNAL_JWT_SECRET = os.getenv("INTERNAL_JWT_SECRET")
security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> Dict[str, Any]:
    """
    Validates the Internal JWT shared with Next.js.
    Rejects requests with invalid or expired tokens.
    """
    if not INTERNAL_JWT_SECRET:
        raise HTTPException(status_code=500, detail="INTERNAL_JWT_SECRET not configured")

    token = credentials.credentials
    try:
        payload = jwt.decode(token, INTERNAL_JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_user(payload: Dict[str, Any] = Security(verify_token)) -> str:
    """Helper to extract user email from validated token."""
    return payload.get("email", "unknown")
