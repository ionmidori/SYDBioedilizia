"""
Deletion of Projects: the user's soft delete (the bin).

The hard purge is not here: the retention job (src/services/retention) erases a
binned project completely — Firestore trees and Storage, keeping a quote that
reached the client under legal hold — 30 days after `deleted_at`.
"""
import logging

from src.db.firebase_client import get_async_firestore_client
from src.db.projects.constants import PROJECTS_COLLECTION
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)


async def soft_delete_project(session_id: str, user_id: str) -> bool:
    """
    Soft-delete a project by setting is_deleted=True and the deleted_at timestamp.

    The project is hidden from list queries immediately; the data (messages,
    files, storage) stays for the 30-day bin period, after which the retention
    job erases it.
    """
    try:
        db = get_async_firestore_client()
        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        doc = await doc_ref.get()

        if not doc.exists:
            logger.warning(f"[Projects] Cannot soft-delete non-existent project {session_id}")
            return False

        if (doc.to_dict() or {}).get("userId") != user_id:
            logger.warning(f"[Projects] User {user_id} not authorized to delete {session_id}")
            return False

        now = utc_now()
        await doc_ref.update({
            "is_deleted": True,
            "deleted_at": now,
            "updatedAt": now,
        })

        # Mirror soft-delete on the frontend 'projects' collection
        frontend_ref = db.collection("projects").document(session_id)
        frontend_doc = await frontend_ref.get()
        if frontend_doc.exists:
            await frontend_ref.update({
                "is_deleted": True,
                "deleted_at": now,
            })

        logger.info(f"[Projects] Soft-deleted project {session_id} for user {user_id}")
        return True

    except Exception as e:
        logger.error(f"[Projects] Error soft-deleting project {session_id}: {e}", exc_info=True)
        return False


async def _delete_collection_batch(db, coll_ref, batch_size=50):
    """
    Helper to delete a collection in batches.
    """
    # Use list() to consume stream immediately
    docs = [d async for d in coll_ref.limit(batch_size).stream()]

    if not docs:
        return 0

    batch = db.batch()
    for doc in docs:
        batch.delete(doc.reference)
    await batch.commit()

    deleted = len(docs)

    if deleted >= batch_size:
        return deleted + await _delete_collection_batch(db, coll_ref, batch_size)
    return deleted
