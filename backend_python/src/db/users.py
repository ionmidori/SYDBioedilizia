"""
Firestore operations for Users.
"""
import asyncio
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


async def delete_user_data(uid: str) -> dict[str, int | str]:
    """
    GDPR Art. 17 "Right to Erasure" — permanently delete all PII for a user.

    Deletes (in order):
      1. Chat sessions + messages subcollections  (collection: sessions)
      2. Projects + files subcollections          (collection: projects)
      3. Leads                                    (collection: leads)
      4. User profile + preferences               (collection: users)
      5. Firebase Auth account                    (Auth SDK)

    Returns a summary dict with counts of deleted documents per collection.
    Raises on unrecoverable errors; Auth deletion failure is non-fatal (logged as warning).
    """
    db = get_async_firestore_client()
    summary: dict[str, int | str] = {}

    # ── 1. Chat sessions ──────────────────────────────────────────────────────
    deleted_sessions = 0
    async for session_doc in db.collection("sessions").where("userId", "==", uid).stream():
        async for msg_doc in session_doc.reference.collection("messages").stream():
            await msg_doc.reference.delete()
        await session_doc.reference.delete()
        deleted_sessions += 1
    summary["sessions"] = deleted_sessions

    # ── 2. Projects ───────────────────────────────────────────────────────────
    deleted_projects = 0
    async for project_doc in db.collection("projects").where("userId", "==", uid).stream():
        async for file_doc in project_doc.reference.collection("files").stream():
            await file_doc.reference.delete()
        await project_doc.reference.delete()
        deleted_projects += 1
    summary["projects"] = deleted_projects

    # ── 3. Leads ──────────────────────────────────────────────────────────────
    deleted_leads = 0
    async for lead_doc in db.collection("leads").where("uid", "==", uid).stream():
        await lead_doc.reference.delete()
        deleted_leads += 1
    summary["leads"] = deleted_leads

    # ── 4. User profile + preferences ─────────────────────────────────────────
    user_ref = db.collection("users").document(uid)
    await user_ref.collection("preferences").document("general").delete()
    await user_ref.delete()
    summary["user_profile"] = 1

    # ── 5. Firebase Auth account (sync SDK → executor) ────────────────────────
    def _delete_auth_account() -> None:
        import firebase_admin.auth as fb_auth
        fb_auth.delete_user(uid)

    try:
        await asyncio.get_event_loop().run_in_executor(None, _delete_auth_account)
        summary["auth_account"] = "deleted"
    except Exception as e:
        # Non-fatal: Firestore data is already gone; log for manual follow-up
        logger.warning(f"[GDPR] Auth account deletion failed for uid={uid}: {e}")
        summary["auth_account"] = "error"

    return summary
