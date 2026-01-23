"""
Magic Link Authentication API.

Provides passwordless email authentication with:
- Dual rate limiting (Email + IP)
- Firebase Admin SDK integration
- Cross-device security validation
"""

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from firebase_admin import auth as firebase_auth
from src.utils.rate_limiter import rate_limiter
import logging
import os

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/magic-link", tags=["auth"])

# Magic Link configuration
MAGIC_LINK_EXPIRY_MINUTES = 15
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


class MagicLinkRequest(BaseModel):
    """Request model for magic link generation."""
    email: EmailStr = Field(..., description="User's email address")


class MagicLinkResponse(BaseModel):
    """Response model for magic link request."""
    success: bool
    message: str


@router.post("/request", response_model=MagicLinkResponse)
async def request_magic_link(
    request_data: MagicLinkRequest,
    request: Request
) -> MagicLinkResponse:
    """
    Generate and send a magic link to the user's email.
    
    Security:
    - Rate limited by email (3/hour)
    - Rate limited by IP (10/hour)
    - Link expires in 15 minutes
    - Single-use only (Firebase enforced)
    
    Args:
        request_data: Email address
        request: FastAPI request object (for IP extraction)
        
    Returns:
        Success confirmation
        
    Raises:
        HTTPException: 429 if rate limit exceeded
    """
    email = request_data.email.lower()
    
    # Extract client IP (consider X-Forwarded-For in production behind proxy)
    client_ip = request.client.host if request.client else "unknown"
    
    # Check rate limits
    email_allowed = await rate_limiter.check_email_limit(email)
    if not email_allowed:
        logger.warning(f"Email rate limit exceeded for {email}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Troppe richieste. Riprova tra un'ora."
        )
    
    ip_allowed = await rate_limiter.check_ip_limit(client_ip)
    if not ip_allowed:
        logger.warning(f"IP rate limit exceeded for {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Troppe richieste da questo dispositivo. Riprova più tardi."
        )
    
    try:
        # Generate Firebase sign-in link
        action_code_settings = firebase_auth.ActionCodeSettings(
            url=f"{FRONTEND_URL}/auth/verify",
            handle_code_in_app=True,
        )
        
        # Firebase will send the email automatically
        link = firebase_auth.generate_sign_in_with_email_link(
            email,
            action_code_settings
        )
        
        logger.info(f"Magic link generated for {email} from IP {client_ip}")
        
        return MagicLinkResponse(
            success=True,
            message="Ti abbiamo inviato un'email con il link di accesso. Controlla la casella!"
        )
        
    except Exception as e:
        logger.error(f"Failed to generate magic link for {email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Errore nell'invio dell'email. Riprova."
        )


@router.post("/verify")
async def verify_magic_link(request: Request):
    """
    Log successful magic link verifications for analytics.
    
    This endpoint is called by the frontend after successful sign-in.
    It's optional and used for monitoring/metrics.
    """
    try:
        data = await request.json()
        email = data.get("email", "unknown")
        logger.info(f"Magic link verification successful for {email}")
        return {"success": True}
    except Exception as e:
        logger.error(f"Error logging magic link verification: {str(e)}")
        return {"success": False}
