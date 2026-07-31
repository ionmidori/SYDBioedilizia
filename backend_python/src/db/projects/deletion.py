"""
Soft/hard deletion of Projects and associated data (Firestore + Storage).
"""
import logging
from datetime import timedelta

from src.db.firebase_client import get_async_firestore_client, get_storage_client
from src.db.projects.constants import PROJECTS_COLLECTION
from src.utils.datetime_utils import utc_now
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)


async def _delete_storage_blobs(bucket, prefix: str) -> int:
    """
    Delete all blobs under a storage prefix without blocking the event loop.

    S5 FIX: Uses run_in_threadpool to wrap the synchronous GCS SDK calls
    (list_blobs, delete_blobs) which would otherwise block the FastAPI
    event loop during project deletion.

    Args:
        bucket: GCS bucket instance
        prefix: Storage path prefix to delete

    Returns:
        Number of blobs deleted
    """
    blobs = await run_in_threadpool(lambda: list(bucket.list_blobs(prefix=prefix)))
    if blobs:
        await run_in_threadpool(bucket.delete_blobs, blobs)
    return len(blobs)


async def soft_delete_project(session_id: str, user_id: str) -> bool:
    """
    Soft-delete a project by setting is_deleted=True and deleted_at timestamp.

    The project is hidden from list queries immediately but the underlying data
    (messages, files, storage) is preserved for the 30-day GDPR retention window.
    Hard purge is handled by a scheduled Cloud Function after the retention period.
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
        expire_at = now + timedelta(days=30)  # Firestore TTL auto-purges after retention
        await doc_ref.update({
            "is_deleted": True,
            "deleted_at": now,
            "updatedAt": now,
            "expireAt": expire_at,
        })

        # Mirror soft-delete on the frontend 'projects' collection
        frontend_ref = db.collection("projects").document(session_id)
        frontend_doc = await frontend_ref.get()
        if frontend_doc.exists:
            await frontend_ref.update({
                "is_deleted": True,
                "deleted_at": now,
                "expireAt": expire_at,
            })

        logger.info(f"[Projects] Soft-deleted project {session_id} for user {user_id}")
        return True

    except Exception as e:
        logger.error(f"[Projects] Error soft-deleting project {session_id}: {e}", exc_info=True)
        return False


async def delete_project(session_id: str, user_id: str) -> bool:
    """
    Hard-delete a project and all its associated data (messages, files, storage blobs).
    Reserved for admin purge after the GDPR retention window.
    """
    try:
        db = get_async_firestore_client()

        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        doc = await doc_ref.get()

        if not doc.exists:
            logger.warning(f"[Projects] Cannot delete non-existent project {session_id}")
            return False

        # Ownership check
        if (doc.to_dict() or {}).get("userId") != user_id:
            logger.warning(f"[Projects] User {user_id} not authorized to delete {session_id}")
            return False

        # 1. Clean up Firestore Subcollections (Deep Delete)
        # A. Backend 'sessions' collection
        subcollections = ["messages", "files"]
        for subcol_name in subcollections:
            subcol_ref = doc_ref.collection(subcol_name)
            await _delete_collection_batch(db, subcol_ref)

        # B. Frontend 'projects' collection
        frontend_project_ref = db.collection("projects").document(session_id)
        await _delete_collection_batch(db, frontend_project_ref.collection("files"))
        await frontend_project_ref.delete()

        # 2. Delete Firebase Storage Blobs (S5 FIX: non-blocking)
        try:
            bucket = get_storage_client()

            storage_prefixes = [
                f"user-uploads/{session_id}/",   # Backend Generator
                f"projects/{session_id}/uploads/",  # Frontend Uploader
                f"renders/{session_id}/",           # Backend Renders
                f"documents/{session_id}/",         # Backend Documents
            ]

            for prefix in storage_prefixes:
                await _delete_storage_blobs(bucket, prefix)

            logger.info(f"[Projects] Deep delete: Storage cleaned for {session_id}")

        except Exception as storage_e:  # noqa: BLE001 — any storage failure aborts the purge
            # FAIL CLOSED. This is the GDPR hard purge: reporting success while blobs
            # survive on GCS would mark the erasure as complete and stop anyone retrying.
            # We deliberately leave the project document in place so the purge stays
            # discoverable and re-runnable (every step above is idempotent).
            logger.error(
                f"[Projects] Storage cleanup FAILED for {session_id}, aborting purge: {storage_e}",
                exc_info=True,
            )
            return False

        # 3. Delete Project Document (Backend)
        await doc_ref.delete()

        logger.info(f"[Projects] DEEP DELETE completed for {session_id}")
        return True

    except Exception as e:
        logger.error(f"[Projects] Error deleting project {session_id}: {str(e)}", exc_info=True)
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
