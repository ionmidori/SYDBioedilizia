"""
Firestore operations for Users.
"""
import logging
from src.db.firebase_client import get_async_firestore_client
from src.models.user import UserPreferences, UserPreferencesUpdate

logger = logging.getLogger(__name__)

async def get_user_preferences(user_id: str) -> UserPreferences:
    try:
        db = get_async_firestore_client()
        doc_ref = db.collection("users").document(user_id).collection("preferences").document("general")
        doc = await doc_ref.get()
        
        if doc.exists:
            data = doc.to_dict()
            return UserPreferences(**data)
            
        return UserPreferences()
    except Exception as e:
        logger.error(f"[UsersDB] Error getting preferences for user {user_id}: {str(e)}", exc_info=True)
        return UserPreferences()

async def update_user_preferences(user_id: str, updates: UserPreferencesUpdate) -> bool:
    try:
        db = get_async_firestore_client()
        doc_ref = db.collection("users").document(user_id).collection("preferences").document("general")
        
        update_data = {}
        if updates.notifications is not None:
            update_data["notifications"] = updates.notifications.model_dump()
        if updates.ui is not None:
            update_data["ui"] = updates.ui.model_dump()
            
        if update_data:
            # We use set with merge=True to handle cases where the document does not exist yet
            await doc_ref.set(update_data, merge=True)
            
        return True
    except Exception as e:
        logger.error(f"[UsersDB] Error updating preferences for user {user_id}: {str(e)}", exc_info=True)
        return False
