"""
Users API Router.

Provides REST endpoints for user management:
- Get user preferences
- Update user preferences
- Delete account (GDPR Art. 17 Right to Erasure)
"""
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import Response
import logging

from src.auth.jwt_handler import verify_token
from src.core.exceptions import AppException
from src.schemas.internal import UserSession
from src.db import users as users_db
from src.models.user import UserPreferences, UserPreferencesUpdate

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
        )

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
    GDPR Art. 17 "Right to Erasure".

    Permanently and irreversibly deletes all personal data for the authenticated user:
    - Firestore: chat sessions + messages, projects + files, leads, user profile
    - Firebase Auth: authentication account (JWT becomes invalid after this call)

    The client MUST sign the user out immediately upon receiving 204.
    """
    uid = user_session.uid
    logger.info(f"[GDPR] Erasure request received for uid={uid}")

    try:
        summary = await users_db.delete_user_data(uid)
        logger.info(f"[GDPR] Erasure complete for uid={uid}: {summary}")
        return Response(status_code=204)
    except Exception as e:
        logger.error(f"[GDPR] Erasure failed for uid={uid}: {e}", exc_info=True)
        raise AppException(
            message="Account deletion failed. Please contact support.",
            error_code="GDPR_ERASURE_FAILED",
            status_code=500,
        )
