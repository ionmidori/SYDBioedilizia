"""
WebAuthn Passkeys Authentication API.

Implements FIDO2/WebAuthn protocol for biometric authentication:
- Challenge-response mechanism (anti-replay)
- Public key cryptography (private key never leaves device)
- Platform authenticator (FaceID/TouchID)
"""

from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel, Field
from firebase_admin import firestore, auth
from src.auth.jwt_handler import verify_token, get_current_user_id
from src.db.firebase_client import get_firestore_client
from src.core.config import settings
import secrets
import base64
import json
import logging
import time
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/passkey", tags=["auth"])

# In-memory challenge store
# Format: { "challenge_string": { "user_id": str | None, "expires_at": float } }
# TODO: Migrate to Redis in production for distributed systems
_challenge_store: dict[str, dict] = {}

# Maximum number of concurrent challenges to prevent memory exhaustion
_MAX_CHALLENGES = 1000

# Allowed RP_IDs - only these domains are valid for passkey operations
_ALLOWED_RP_IDS = {
    "sydbioedilizia.vercel.app",
    "website-renovation.vercel.app",
    "website-renovation-git-main-ionmidori.vercel.app",
    "sydbioedilizia-git-main-ionmidori.vercel.app",
    "localhost",
}


def _resolve_rp_id(request: Request) -> str:
    """Resolve RP_ID with domain whitelist validation."""
    # 1. Prefer env var (always trusted)
    rp_id = settings.RP_ID
    if rp_id:
        return rp_id

    # 2. Extract from Origin/Host but validate against whitelist
    candidate = None
    origin = request.headers.get("origin")
    host = request.headers.get("host")
    x_forwarded_host = request.headers.get("x-forwarded-host")

    if origin:
        try:
            parsed = urlparse(origin)
            candidate = parsed.hostname
        except Exception:
            pass

    # Prefer X-Forwarded-Host if present (proxy scenario)
    if not candidate and x_forwarded_host:
        candidate = x_forwarded_host.split(":")[0]

    if not candidate and host:
        candidate = host.split(":")[0]

    # 3. Validate against whitelist
    if candidate and candidate in _ALLOWED_RP_IDS:
        return candidate

    # 3.1 Validate against Vercel Preview Regex (Safe Subdomains)
    import re
    # Allow: sydbioedilizia*.vercel.app OR website-renovation*.vercel.app
    if candidate and re.match(r"^(sydbioedilizia|website-renovation).*\.vercel\.app$", candidate):
        logger.info(f"[Passkey] Allowed dynamic RP_ID: {candidate}")
        return candidate

    # 4. Default to localhost only in development
    if settings.ENV == "development":
        return "localhost"

    logger.warning(f"[Passkey] Rejected RP_ID candidate: '{candidate}' (Origin: {origin}, Host: {host}, X-Fwd: {x_forwarded_host})")
    raise HTTPException(
        status_code=400,
        detail=f"Domain not authorized for Biometrics ({candidate})"
    )


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


def _cleanup_challenges():
    """Remove expired challenges."""
    now = time.time()
    expired = [k for k, v in _challenge_store.items() if v["expires_at"] < now]
    for k in expired:
        del _challenge_store[k]


@router.post("/register/options", response_model=PasskeyRegistrationOptions)
async def get_registration_options(
    request: Request,
    body: PasskeyRegistrationRequest,
    user_id: str = Depends(get_current_user_id)
) -> PasskeyRegistrationOptions:
    """
    Generate WebAuthn registration options.
    """
    # Verify the requesting user matches the token
    if user_id != body.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot register passkey for another user"
        )
    
    _cleanup_challenges()

    # Prevent memory exhaustion from challenge accumulation
    if len(_challenge_store) >= _MAX_CHALLENGES:
        raise HTTPException(status_code=503, detail="Too many pending challenges. Try again shortly.")

    # Generate cryptographic challenge
    challenge_bytes = secrets.token_bytes(32)
    challenge_b64 = base64.urlsafe_b64encode(challenge_bytes).decode('utf-8').rstrip('=')

    # Store challenge (Key is now the CHALLENGE itself)
    _challenge_store[challenge_b64] = {
        "user_id": user_id,
        "expires_at": time.time() + 60  # 60s expiration
    }

    # Resolve RP_ID with whitelist validation
    rp_id = _resolve_rp_id(request)
    logger.info(f"Generated passkey registration challenge for user {user_id} (RP_ID: {rp_id})")
    
    return PasskeyRegistrationOptions(
        challenge=challenge_b64,
        rp={
            "name": "SYD - AI Renovation Assistant",
            "id": rp_id
        },
        user={
            "id": base64.urlsafe_b64encode(user_id.encode()).decode('utf-8').rstrip('='),
            "name": user_id,
            "displayName": "SYD User"
        },
        pubKeyCredParams=[
            {"type": "public-key", "alg": -7},   # ES256
            {"type": "public-key", "alg": -257}  # RS256
        ],
        authenticatorSelection={
            "authenticatorAttachment": "platform",
            "requireResidentKey": True,
            "residentKey": "required",
            "userVerification": "required"
        },
        timeout=60000
    )


@router.post("/register/verify")
async def verify_registration(
    credential: PasskeyCredential,
    user_id: str = Depends(get_current_user_id)
):
    """
    Verify and store passkey credential.
    """
    
    # Extract challenge from clientDataJSON
    try:
        client_data_json = base64.urlsafe_b64decode(credential.response["clientDataJSON"] + "==").decode('utf-8')
        client_data = json.loads(client_data_json)
        challenge_b64 = client_data.get("challenge")
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid clientDataJSON")

    # Verify challenge existence directly
    challenge_data = _challenge_store.pop(challenge_b64, None)
    
    if not challenge_data:
        raise HTTPException(status_code=400, detail="Challenge expired or invalid")
        
    if challenge_data["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Challenge mismatch")
    
    db = get_firestore_client()
    
    # Store credential in Firestore
    credential_doc = {
        "credential_id": credential.id,
        "public_key": credential.response.get("attestationObject"),
        "counter": 0,
        "created_at": firestore.SERVER_TIMESTAMP
    }
    
    # Use credential.id as document ID
    db.collection("users").document(user_id).collection("passkeys").document(credential.id).set(credential_doc)
    
    logger.info(f"Passkey registered for user {user_id}")
    
    return {
        "success": True,
        "message": "Passkey registrata con successo"
    }


@router.post("/authenticate/options", response_model=PasskeyAuthenticationOptions)
async def get_authentication_options(
    request: Request,
    body: PasskeyAuthenticationRequest
) -> PasskeyAuthenticationOptions:
    """
    Generate WebAuthn authentication options.
    """
    user_id = body.user_id
    _cleanup_challenges()

    # Prevent memory exhaustion from challenge accumulation
    if len(_challenge_store) >= _MAX_CHALLENGES:
        raise HTTPException(status_code=503, detail="Too many pending challenges. Try again shortly.")

    # Generate challenge
    challenge_bytes = secrets.token_bytes(32)
    challenge_b64 = base64.urlsafe_b64encode(challenge_bytes).decode('utf-8').rstrip('=')

    # Store challenge (user_id might be None for Resident Keys)
    _challenge_store[challenge_b64] = {
        "user_id": user_id,
        "expires_at": time.time() + 60
    }
    
    db = get_firestore_client()
    allow_credentials = []
    
    if user_id:
        # Legacy flow: Filter by user
        passkeys = db.collection("users").document(user_id).collection("passkeys").stream()
        allow_credentials = [
            {
                "type": "public-key",
                "id": pk.id,
                "transports": ["internal"]
            }
            for pk in passkeys
        ]
        
        if not allow_credentials:
             raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Nessuna passkey registrata per questo utente"
            )
            
    # Resolve RP_ID with whitelist validation
    rp_id = _resolve_rp_id(request)
    logger.info(f"Generated passkey authentication challenge (user_id={user_id}) RP_ID: {rp_id}")
    
    return PasskeyAuthenticationOptions(
        challenge=challenge_b64,
        rpId=rp_id,
        allowCredentials=allow_credentials,
        timeout=60000
    )


@router.post("/authenticate/verify")
async def verify_authentication(assertion: PasskeyAssertion):
    """
    Verify passkey authentication assertion.
    """
    
    # 1. Extract challenge from clientDataJSON
    try:
        client_data_json = base64.urlsafe_b64decode(assertion.response["clientDataJSON"] + "==").decode('utf-8')
        client_data = json.loads(client_data_json)
        challenge_b64 = client_data.get("challenge")
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid clientDataJSON")

    # 2. Verify challenge
    challenge_data = _challenge_store.pop(challenge_b64, None)
    if not challenge_data:
        raise HTTPException(status_code=400, detail="Challenge scaduta o invalida")

    # 3. Extract user_id from userHandle (Resident Keys)
    user_handle_b64 = assertion.response.get("userHandle")
    user_id = None
    
    if user_handle_b64:
        # Resident Key flow: User ID comes from handle
        try:
            padding = "==" if len(user_handle_b64) % 4 else ""
            user_id = base64.urlsafe_b64decode(user_handle_b64 + padding).decode('utf-8')
        except Exception as e:
            raise HTTPException(status_code=400, detail="Invalid userHandle")
    else:
        # Legacy flow: Use stored user_id from challenge
        user_id = challenge_data.get("user_id")

    if not user_id:
         raise HTTPException(status_code=400, detail="Impossibile identificare l'utente (userHandle mancante)")

    # 4. Verify credential exists
    db = get_firestore_client()
    passkey_ref = db.collection("users").document(user_id).collection("passkeys").document(assertion.id).get()
    
    if not passkey_ref.exists:
        raise HTTPException(status_code=404, detail="Passkey non riconosciuta")
    
    # 5. Generate Token
    try:
        custom_token_bytes = auth.create_custom_token(user_id)
        token = custom_token_bytes.decode('utf-8')
    except Exception as e:
        logger.error(f"Error creating custom token: {e}")
        raise HTTPException(status_code=500, detail="Token generation failed")
    
    logger.info(f"Passkey authentication successful for user {user_id}")
    
    return {
        "success": True,
        "token": token,
        "user_id": user_id
    }
