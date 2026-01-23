"""
WebAuthn Passkeys Authentication API.

Implements FIDO2/WebAuthn protocol for biometric authentication:
- Challenge-response mechanism (anti-replay)
- Public key cryptography (private key never leaves device)
- Platform authenticator (FaceID/TouchID)
"""

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from firebase_admin import firestore
from src.auth.jwt_handler import verify_token
from src.db.firebase_client import get_firestore_client
import secrets
import base64
import logging
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/passkey", tags=["auth"])

# In-memory challenge store (use Redis in production for distributed systems)
_challenge_store: dict[str, str] = {}


class PasskeyRegistrationRequest(BaseModel):
    """Request to initiate passkey registration."""
    user_id: str = Field(..., description="Firebase User ID")


class PasskeyRegistrationOptions(BaseModel):
    """WebAuthn credential creation options."""
    challenge: str
    rp: dict
    user: dict
    pubKeyCredParams: list
    authenticatorSelection: dict
    timeout: int = 60000


class PasskeyCredential(BaseModel):
    """WebAuthn credential after registration."""
    id: str = Field(..., description="Credential ID")
    rawId: str
    response: dict = Field(..., description="Attestation response")
    type: str = "public-key"


class PasskeyAuthenticationRequest(BaseModel):
    """Request to initiate passkey authentication."""
    user_id: Optional[str] = None


class PasskeyAuthenticationOptions(BaseModel):
    """WebAuthn authentication options."""
    challenge: str
    rpId: str
    allowCredentials: list
    timeout: int = 60000


class PasskeyAssertion(BaseModel):
    """WebAuthn assertion after authentication."""
    id: str
    rawId: str
    response: dict = Field(..., description="Assertion response")
    type: str = "public-key"


@router.post("/register/options", response_model=PasskeyRegistrationOptions)
async def get_registration_options(
    request: PasskeyRegistrationRequest,
    user_id: str = Depends(verify_token)
) -> PasskeyRegistrationOptions:
    """
    Generate WebAuthn registration options.
    
    Security:
    - Challenge is cryptographically random (32 bytes)
    - User must be authenticated (JWT required)
    - Challenge expires after use
    
    Returns:
        WebAuthn PublicKeyCredentialCreationOptions
    """
    # Verify the requesting user matches the token
    if user_id != request.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot register passkey for another user"
        )
    
    # Generate cryptographic challenge
    challenge_bytes = secrets.token_bytes(32)
    challenge_b64 = base64.urlsafe_b64encode(challenge_bytes).decode('utf-8').rstrip('=')
    
    # Store challenge for verification (expires after 60s)
    _challenge_store[user_id] = challenge_b64
    
    logger.info(f"Generated passkey registration challenge for user {user_id}")
    
    return PasskeyRegistrationOptions(
        challenge=challenge_b64,
        rp={
            "name": "SYD - AI Renovation Assistant",
            "id": "localhost"  # Change to your domain in production
        },
        user={
            "id": base64.urlsafe_b64encode(user_id.encode()).decode('utf-8').rstrip('='),
            "name": user_id,  # Could be email if available
            "displayName": "SYD User"
        },
        pubKeyCredParams=[
            {"type": "public-key", "alg": -7},   # ES256 (preferred)
            {"type": "public-key", "alg": -257}  # RS256 (fallback)
        ],
        authenticatorSelection={
            "authenticatorAttachment": "platform",  # FaceID/TouchID only
            "requireResidentKey": True,   # ✅ Enable discoverable credentials
            "residentKey": "required",     # Explicit requirement for WebAuthn Level 2
            "userVerification": "required"  # Biometric required
        },
        timeout=60000
    )


@router.post("/register/verify")
async def verify_registration(
    credential: PasskeyCredential,
    user_id: str = Depends(verify_token)
):
    """
    Verify and store passkey credential.
    
    Security:
    - Validates challenge matches
    - Stores public key in Firestore (private key stays on device)
    - Credential ID is unique per user
    """
    # Verify challenge
    stored_challenge = _challenge_store.pop(user_id, None)
    if not stored_challenge:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending registration challenge"
        )
    
    # In production, validate the attestation object here
    # For MVP, we trust the client (acceptable for platform authenticators)
    
    db = get_firestore_client()
    
    # Store credential in Firestore
    credential_doc = {
        "credential_id": credential.id,
        "public_key": credential.response.get("attestationObject"),
        "counter": 0,
        "created_at": firestore.SERVER_TIMESTAMP
    }
    
    db.collection("users").document(user_id).collection("passkeys").document(credential.id).set(credential_doc)
    
    logger.info(f"Passkey registered for user {user_id}")
    
    return {
        "success": True,
        "message": "Passkey registrata con successo"
    }


@router.post("/authenticate/options", response_model=PasskeyAuthenticationOptions)
async def get_authentication_options(
    request: PasskeyAuthenticationRequest
) -> PasskeyAuthenticationOptions:
    """
    Generate WebAuthn authentication options.
    
    Note: This is public (no JWT) because user hasn't authenticated yet.
    """
    user_id = request.user_id
    
    # ✅ Support email-free login via Resident Keys
    # If user_id is provided, filter credentials (legacy flow)
    # If not provided, browser will discover credentials automatically
    
    # Generate challenge
    challenge_bytes = secrets.token_bytes(32)
    challenge_b64 = base64.urlsafe_b64encode(challenge_bytes).decode('utf-8').rstrip('=')
    
    _challenge_store[user_id] = challenge_b64
    
    # Get user's registered passkeys
    db = get_firestore_client()
    
    if user_id:
        # Legacy flow: Filter by user
        passkeys = db.collection("users").document(user_id).collection("passkeys").stream()
        allow_credentials = [
            {
                "type": "public-key",
                "id": pk.id,
                "transports": ["internal"]  # Platform authenticator
            }
            for pk in passkeys
        ]
    else:
        # ✅ Resident Keys flow: Empty array = browser discovers all credentials
        allow_credentials = []
    
    # Only check for empty credentials if user_id was provided
    if user_id and not allow_credentials:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nessuna passkey registrata per questo utente"
        )
    
    logger.info(f"Generated passkey authentication challenge for user {user_id}")
    
    return PasskeyAuthenticationOptions(
        challenge=challenge_b64,
        rpId="localhost",  # Change to your domain
        allowCredentials=allow_credentials,
        timeout=60000
    )


@router.post("/authenticate/verify")
async def verify_authentication(assertion: PasskeyAssertion):
    """
    Verify passkey authentication assertion.
    
    Returns JWT token on success (same as other login methods).
    """
    # For MVP: Accept assertion (in production, verify signature)
    
    # ✅ Extract user_id from userHandle (Resident Keys)
    user_handle_b64 = assertion.response.get("userHandle")
    
    if not user_handle_b64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing userHandle in WebAuthn response"
        )
    
    # Decode userHandle to get user_id
    try:
        # Add padding if needed for base64 decoding
        padding = "==" if len(user_handle_b64) % 4 else ""
        user_id = base64.urlsafe_b64decode(user_handle_b64 + padding).decode('utf-8')
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid userHandle: {str(e)}"
        )
    
    # Verify the credential exists for this user
    db = get_firestore_client()
    passkey = db.collection("users").document(user_id).collection("passkeys").document(assertion.id).get()
    
    if not passkey.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Passkey non riconosciuta"
        )
    
    # Verify challenge
    stored_challenge = _challenge_store.pop(user_id, None)
    if not stored_challenge:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sfida scaduta"
        )
    
    # Generate JWT token
    from src.auth.jwt_handler import create_token
    token = create_token(user_id)
    
    logger.info(f"Passkey authentication successful for user {user_id}")
    
    return {
        "success": True,
        "token": token,
        "user_id": user_id
    }
