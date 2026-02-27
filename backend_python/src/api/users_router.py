"""
Users API Router.

Provides REST endpoints for user management:
- Get user preferences
- Update user preferences
"""
from fastapi import APIRouter, HTTPException, Depends, status
import logging

from src.auth.jwt_handler import verify_token
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
