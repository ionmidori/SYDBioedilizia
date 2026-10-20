"""
Users API Router.

Provides REST endpoints for user management:
- Get user preferences
- Update user preferences
- Delete account (GDPR Art. 17 Right to Erasure)
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from src.auth.jwt_handler import verify_token
from src.core.exceptions import ErasureIncompleteError
from src.db import users as users_db
from src.models.user import UserPreferences, UserPreferencesUpdate
from src.schemas.internal import UserSession
from src.services.erasure.models import ErasureMode, ErasureStatus
from src.services.erasure.service import get_user_erasure_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("/preferences", response_model=UserPreferences)
async def get_preferences(
    user_session: UserSession = Depends(verify_token)
) -> UserPreferences:
    """
    Get user preferences.
    """
    try:
        user_id = user_session.uid
        preferences = await users_db.get_user_preferences(user_id)
        return preferences
    except Exception as e:
        logger.error(f"[API] Error in get_preferences: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Impossibile caricare le preferenze"
        ) from e

@router.patch("/preferences", response_model=dict)
async def update_preferences(
    updates: UserPreferencesUpdate,
    user_session: UserSession = Depends(verify_token)
) -> dict:
    """
    Update user preferences.
    """
    user_id = user_session.uid

    success = await users_db.update_user_preferences(user_id, updates)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Impossibile aggiornare le preferenze"
        )

    return {"success": True}


@router.delete("/me", status_code=204)
async def erase_my_account(
    user_session: UserSession = Depends(verify_token),
) -> Response:
    """
    GDPR Art. 17 "Right to Erasure" (src/services/erasure).

    Permanently and irreversibly deletes the authenticated user's personal data:
    profile, passkeys, projects and chats (with files, feedback and Storage
    objects), quotes, leads, batches, reviews, quotas, pending emails and the
    Firebase Auth account. Quotes already sent to the client are kept under
    legal hold (src/services/erasure/legal_hold.py).

    - 204: erased. The client MUST sign the user out (the token is revoked).
    - 503 GDPR_ERASURE_PENDING: started (the account is already disabled) but a
      step failed; the scheduled lifecycle job completes it.
    - 409 GDPR_ERASURE_IN_PROGRESS: a request is already being processed.
    """
    uid = user_session.uid
    logger.info(f"[GDPR] Erasure request received for uid={uid}")
    report = await get_user_erasure_service().erase(uid, ErasureMode.ACCOUNT_DELETION, requested_by="self")
    if report.status is not ErasureStatus.COMPLETED:
        raise ErasureIncompleteError()
    return Response(status_code=204)
