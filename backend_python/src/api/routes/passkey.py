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
from src.auth.jwt_handler import get_current_user_id
from src.db.firebase_client import get_firestore_client
from src.core.config import settings
import base64
import logging
import time
from typing import Optional, Dict, Any
from urllib.parse import urlparse

from fido2.webauthn import (
    PublicKeyCredentialRpEntity,
    PublicKeyCredentialUserEntity,
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    AuthenticatorAttachment,
    AttestedCredentialData,
)
from fido2.server import Fido2Server
from fido2.utils import websafe_decode, websafe_encode

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/passkey", tags=["auth"])

# No more webauthn_json_mapping.enabled = True in fido2 2.x

# In-memory challenge store
# Format: { "challenge_string": { "user_id": str | None, "expires_at": float, "state": dict } }
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
    rp_id = settings.RP_ID
    if rp_id:
        return rp_id

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

    if not candidate and x_forwarded_host:
        candidate = x_forwarded_host.split(":")[0]

    if not candidate and host:
        candidate = host.split(":")[0]

    if candidate and candidate in _ALLOWED_RP_IDS:
        return candidate

    import re
    if candidate and re.match(r"^(sydbioedilizia|website-renovation).*\.vercel\.app$", candidate):
        logger.info(f"[Passkey] Allowed dynamic RP_ID: {candidate}")
        return candidate

    if settings.ENV == "development":
        return "localhost"

    logger.warning(f"[Passkey] Rejected RP_ID candidate: '{candidate}' (Origin: {origin}, Host: {host}, X-Fwd: {x_forwarded_host})")
    raise HTTPException(
        status_code=400,
        detail=f"Domain not authorized for Biometrics ({candidate})"
    )


def _get_fido2_server(rp_id: str) -> Fido2Server:
    """Get a Fido2Server instance for the given RP ID."""
    # Assuming standard origin based on RP ID. For production, you might want to strictly
    # enforce https for non-localhost.
    origin = f"https://{rp_id}" if rp_id != "localhost" else f"http://{rp_id}:3000"
    
    # In Vercel previews, the origin is the exact preview URL
    # So we should be flexible or explicitly pass it from the request if possible,
    # but for Fido2Server initialization, setting verify_origin correctly is key.
    # Often, using a custom verify_origin function is safer if dynamic origins are used.
    
    rp = PublicKeyCredentialRpEntity(id=rp_id, name="SYD - AI Renovation Assistant")
    return Fido2Server(rp)


class PasskeyRegistrationRequest(BaseModel):
    user_id: str = Field(..., description="Firebase User ID")

class PasskeyAuthenticationRequest(BaseModel):
    user_id: Optional[str] = None


def _cleanup_challenges():
    """Remove expired challenges."""
    now = time.time()
    expired = [k for k, v in _challenge_store.items() if v["expires_at"] < now]
    for k in expired:
        del _challenge_store[k]


@router.post("/register/options")
async def get_registration_options(
    request: Request,
    body: PasskeyRegistrationRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Generate WebAuthn registration options using python-fido2."""
    if user_id != body.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot register passkey for another user")
    
    _cleanup_challenges()
    if len(_challenge_store) >= _MAX_CHALLENGES:
        raise HTTPException(status_code=503, detail="Too many pending challenges.")

    rp_id = _resolve_rp_id(request)
    server = _get_fido2_server(rp_id)

    # Get existing credentials to prevent re-registration
    db = get_firestore_client()
    existing_creds = []
    try:
        passkeys = db.collection("users").document(user_id).collection("passkeys").stream()
        for pk in passkeys:
            data = pk.to_dict()
            if data and "credential_data" in data:
                # Basic representation to exclude
                existing_creds.append({"id": websafe_decode(pk.id), "type": "public-key"})
    except Exception as e:
        logger.error(f"Error fetching existing credentials: {e}")

    user_entity = PublicKeyCredentialUserEntity(
        id=user_id.encode("utf-8"),
        name=user_id,
        display_name="SYD User"
    )

    auth_selection = AuthenticatorSelectionCriteria(
        authenticator_attachment=AuthenticatorAttachment.PLATFORM,
        require_resident_key=True,
        user_verification=UserVerificationRequirement.REQUIRED
    )

    options, state = server.register_begin(
        user=user_entity,
        credentials=existing_creds,
        user_verification=UserVerificationRequirement.REQUIRED,
        authenticator_attachment=AuthenticatorAttachment.PLATFORM,
    )

    # Convert state challenge to b64 string for keying
    # Ensure it's bytes for websafe_encode (fido2 2.x might return it as str in some contexts)
    challenge_val = state["challenge"]
    if isinstance(challenge_val, str):
        challenge_val = challenge_val.encode("utf-8")
    challenge_b64 = websafe_encode(challenge_val)
    
    _challenge_store[challenge_b64] = {
        "user_id": user_id,
        "state": state,
        "expires_at": time.time() + 60
    }

    logger.info(f"Generated passkey registration challenge for user {user_id} (RP_ID: {rp_id})")
    
    return dict(options)


@router.post("/register/verify")
async def verify_registration(
    request: Request,
    credential: dict,  # Receive generic dict to pass to fido2
    user_id: str = Depends(get_current_user_id)
):
    """Verify and store passkey credential using python-fido2."""
    try:
        client_data_json = base64.urlsafe_b64decode(credential["response"]["clientDataJSON"] + "==").decode('utf-8')
        import json
        client_data = json.loads(client_data_json)
        # clientDataJSON challenge is standard base64url without padding
        challenge_b64 = client_data.get("challenge").rstrip("=")
    except Exception as e:
        logger.error(f"Invalid clientDataJSON: {e}")
        raise HTTPException(status_code=400, detail="Invalid clientDataJSON")

    challenge_data = _challenge_store.pop(challenge_b64, None)
    if not challenge_data:
        raise HTTPException(status_code=400, detail="Challenge expired or invalid")
        
    if challenge_data["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Challenge mismatch")
    
    rp_id = _resolve_rp_id(request)
    server = _get_fido2_server(rp_id)
    
    try:
        auth_data = server.register_complete(
            challenge_data["state"],
            credential
        )
    except Exception as e:
        logger.error(f"Registration verification failed: {e}")
        raise HTTPException(status_code=400, detail=f"Registration failed: {str(e)}")

    db = get_firestore_client()
    
    # Store credential in Firestore
    cred_id_b64 = websafe_encode(auth_data.credential_data.credential_id)
    
    credential_doc = {
        "credential_id": cred_id_b64,
        "credential_data": auth_data.credential_data.to_dict(), 
        "sign_count": auth_data.credential_data.sign_count if hasattr(auth_data.credential_data, 'sign_count') else 0,
        "created_at": firestore.SERVER_TIMESTAMP
    }
    
    db.collection("users").document(user_id).collection("passkeys").document(cred_id_b64).set(credential_doc)
    logger.info(f"Passkey registered successfully for user {user_id}")
    
    return {
        "success": True,
        "message": "Passkey registrata con successo"
    }


@router.post("/authenticate/options")
async def get_authentication_options(
    request: Request,
    body: PasskeyAuthenticationRequest
):
    """Generate WebAuthn authentication options using python-fido2."""
    user_id = body.user_id
    _cleanup_challenges()

    if len(_challenge_store) >= _MAX_CHALLENGES:
        raise HTTPException(status_code=503, detail="Too many pending challenges.")

    rp_id = _resolve_rp_id(request)
    server = _get_fido2_server(rp_id)
    
    allow_credentials = []
    if user_id:
        db = get_firestore_client()
        passkeys = db.collection("users").document(user_id).collection("passkeys").stream()
        for pk in passkeys:
             allow_credentials.append({"id": websafe_decode(pk.id), "type": "public-key"})
        
        if not allow_credentials:
             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nessuna passkey registrata per questo utente")

    options, state = server.authenticate_begin(
        credentials=allow_credentials if allow_credentials else None,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    
    # Convert state challenge to b64 string for keying
    challenge_val = state["challenge"]
    if isinstance(challenge_val, str):
        challenge_val = challenge_val.encode("utf-8")
    challenge_b64 = websafe_encode(challenge_val)
    _challenge_store[challenge_b64] = {
        "user_id": user_id,
        "state": state,
        "expires_at": time.time() + 60
    }
    
    logger.info(f"Generated passkey authentication challenge (user_id={user_id}) RP_ID: {rp_id}")
    return dict(options)


@router.post("/authenticate/verify")
async def verify_authentication(
    request: Request,
    assertion: dict
):
    """Verify passkey authentication assertion using python-fido2."""
    try:
        client_data_json = base64.urlsafe_b64decode(assertion["response"]["clientDataJSON"] + "==").decode('utf-8')
        import json
        client_data = json.loads(client_data_json)
        challenge_b64 = client_data.get("challenge").rstrip("=")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid clientDataJSON")

    challenge_data = _challenge_store.pop(challenge_b64, None)
    if not challenge_data:
        raise HTTPException(status_code=400, detail="Challenge scaduta o invalida")

    # Determine user_id
    user_handle_b64 = assertion["response"].get("userHandle")
    user_id = None
    
    if user_handle_b64:
        try:
            padding = "==" if len(user_handle_b64) % 4 else ""
            user_id = base64.urlsafe_b64decode(user_handle_b64 + padding).decode('utf-8')
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid userHandle")
    else:
        user_id = challenge_data.get("user_id")

    if not user_id:
         raise HTTPException(status_code=400, detail="Impossibile identificare l'utente")

    db = get_firestore_client()
    passkey_ref = db.collection("users").document(user_id).collection("passkeys").document(assertion["id"]).get()
    
    if not passkey_ref.exists:
        raise HTTPException(status_code=404, detail="Passkey non riconosciuta")
        
    stored_cred_data = passkey_ref.to_dict().get("credential_data")
    if not stored_cred_data:
        raise HTTPException(status_code=500, detail="Credential data missing from DB")

    # In python-fido2 >= 1.0, credential_data stored natively maps back.
    # In 2.x, we use AttestedCredentialData.from_dict for the dict representation.
    try:
        # Reconstruct the AttestedCredentialData from the stored dict
        cred_obj = AttestedCredentialData.from_dict(stored_cred_data)
        
        # We need the credential wrapped in a class that provides .credential_data and .sign_count
        class StoredCredential:
            def __init__(self, cred_data, count):
                self.credential_data = cred_data
                self.sign_count = count
                
        stored_cred = StoredCredential(cred_obj, passkey_ref.to_dict().get("sign_count", 0))
    except Exception as e:
        logger.error(f"Failed to reconstruct credential: {e}")
        raise HTTPException(status_code=500, detail="Corrupted credential data")

    rp_id = _resolve_rp_id(request)
    server = _get_fido2_server(rp_id)
    
    try:
        server.authenticate_complete(
            challenge_data["state"],
            [stored_cred],
            assertion
        )
        
        # Update sign count to prevent cloning (anti-replay handled by challenge)
        # The library verifies sign_count if provided. We should update it if the assertion contains one.
        # auth_data = ... we'd extract the new signature counter if we inspect the assertion response,
        # but for now verifying signature is the primary security goal.
        
    except Exception as e:
        logger.error(f"Authentication verification failed: {e}")
        raise HTTPException(status_code=400, detail=f"Authentication failed: {str(e)}")

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


@router.get("/check")
async def check_has_passkeys(uid: str = Depends(get_current_user_id)):
    """Check if the authenticated user has any registered passkeys."""
    try:
        db = get_firestore_client()
        docs = list(db.collection("users").document(uid).collection("passkeys").limit(1).stream())
        return {"has_passkeys": len(docs) > 0}
    except Exception as e:
        logger.warning(f"[passkey/check] Firestore query failed for {uid}: {e}")
        return {"has_passkeys": False}
