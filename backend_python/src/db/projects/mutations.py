"""
Write operations (create/update/claim) for Projects.
"""
import logging
import uuid
from typing import Any

from src.db.firebase_client import get_async_firestore_client
from src.db.projects.constants import PROJECTS_COLLECTION
from src.models.project import ProjectCreate, ProjectDetails, ProjectStatus, ProjectUpdate
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)


async def create_project(user_id: str, data: ProjectCreate) -> str:
    """
    Create a new project (session) for a user.

    Args:
        user_id: Firebase UID of the owner.
        data: Project creation request.

    Returns:
        The new session_id (document ID).
    """
    try:
        db = get_async_firestore_client()

        # Generate unique session ID
        session_id = str(uuid.uuid4())

        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)

        # S1 FIX: Explicit null initialization for ALL fields
        # is_deleted is explicitly set to False so the composite index filter
        # in count_user_projects works correctly without a fallback.
        await doc_ref.set({
            "sessionId": session_id,
            "userId": user_id,
            "title": data.title,
            "status": ProjectStatus.DRAFT.value,
            "thumbnailUrl": None,
            "originalImageUrl": None,
            "constructionDetails": None,
            "messageCount": 0,
            "is_deleted": False,
            "createdAt": utc_now(),
            "updatedAt": utc_now(),
        })

        logger.info(f"[Projects] Created project {session_id} for user {user_id}")
        return session_id

    except Exception as e:
        logger.error(f"[Projects] Error creating project: {str(e)}", exc_info=True)
        raise Exception(f"Failed to create project: {str(e)}") from e


async def update_project(session_id: str, user_id: str, data: ProjectUpdate) -> bool:
    """
    Update project metadata (title, status, thumbnail).

    Args:
        session_id: Project ID.
        user_id: UID for ownership verification.
        data: Fields to update.

    Returns:
        True if updated, False if not found or unauthorized.
    """
    try:
        db = get_async_firestore_client()

        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        doc = await doc_ref.get()

        if not doc.exists:
            return False

        # Ownership check
        if (doc.to_dict() or {}).get("userId") != user_id:
            logger.warning(f"[Projects] User {user_id} not authorized to update {session_id}")
            return False

        # Build update dict (only non-None fields). Annotated dict[str, Any] so
        # the initial datetime value doesn't narrow the inferred value type and
        # reject the str/enum fields assigned below.
        update_data: dict[str, Any] = {"updatedAt": utc_now()}

        if data.title is not None:
            update_data["title"] = data.title
        if data.status is not None:
            update_data["status"] = data.status.value
        if data.thumbnail_url is not None:
            update_data["thumbnailUrl"] = data.thumbnail_url
        if data.original_image_url is not None:
            update_data["originalImageUrl"] = data.original_image_url

        # Update both collections
        batch = db.batch()
        batch.update(doc_ref, update_data)

        # Sync to 'projects' collection if title changed
        if "title" in update_data:
            project_ref = db.collection("projects").document(session_id)
            # We use set with merge to ensure it exists or update it
            batch.set(project_ref, {"name": update_data["title"], "updatedAt": utc_now()}, merge=True)

        await batch.commit()

        logger.info(f"[Projects] Updated project {session_id} (and synced name)")
        return True

    except Exception as e:
        logger.error(f"[Projects] Error updating project {session_id}: {str(e)}", exc_info=True)
        return False


async def claim_project(session_id: str, new_user_id: str) -> bool:
    """
    Transfer ownership of a guest project to a registered user (Deep Claim).

    Args:
        session_id: Project ID (currently owned by guest_*).
        new_user_id: Firebase UID of the newly registered user.

    Returns:
        True if claimed successfully.
    """
    try:
        db = get_async_firestore_client()

        # 1. Verify Project (Source of Truth: sessions collection)
        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        doc = await doc_ref.get()

        if not doc.exists:
            logger.warning(f"[Projects] Cannot claim non-existent project {session_id}")
            return False

        current_data = doc.to_dict() or {}
        current_owner = current_data.get("userId") or ""

        # Idempotent: already owned by this user → success (no-op)
        if current_owner == new_user_id:
            logger.info(f"[Projects] Project {session_id} already owned by {new_user_id}, skipping claim")
            return True

        # Only allow claiming if current owner is a guest
        if not current_owner.startswith("guest_"):
            logger.warning(f"[Projects] Project {session_id} is already owned by {current_owner}")
            return False

        # 2. Prepare Atomic Batch
        batch = db.batch()
        now = utc_now()

        # A. Update Session (Backend)
        batch.update(doc_ref, {
            "userId": new_user_id,
            "updatedAt": now,
        })

        # B. Update Project (Public Projection)
        public_ref = db.collection("projects").document(session_id)
        # Check if it exists before update, or use set(merge=True)
        batch.set(public_ref, {
            "userId": new_user_id,
            "updatedAt": now,
        }, merge=True)

        # 3. Deep Update: Files Metadata
        # We also need to update 'uploadedBy' in subcollections for strict delete rules
        files_subcol = public_ref.collection("files")
        async for file_doc in files_subcol.stream():
            batch.update(file_doc.reference, {
                "uploadedBy": new_user_id,
                "updatedAt": now
            })

        # 4. Commit Transition
        await batch.commit()

        logger.info(f"[Projects] DEEP CLAIM completed for project {session_id}. Owner: {new_user_id}")
        return True

    except Exception as e:
        logger.error(f"[Projects] Error during deep claim for {session_id}: {str(e)}", exc_info=True)
        return False


async def update_project_details(session_id: str, user_id: str, details: ProjectDetails) -> bool:
    """
    Update construction site details for a project.

    This stores comprehensive project information that serves as the
    Single Source of Truth for AI context generation.

    Args:
        session_id: Project ID.
        user_id: UID for ownership verification.
        details: Construction site details to store.

    Returns:
        True if updated, False if not found or unauthorized.
    """
    try:
        db = get_async_firestore_client()

        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        doc = await doc_ref.get()

        if not doc.exists:
            logger.warning(f"[Projects] Cannot update details for non-existent project {session_id}")
            return False

        # Ownership check
        if (doc.to_dict() or {}).get("userId") != user_id:
            logger.warning(f"[Projects] User {user_id} not authorized to update details for {session_id}")
            return False

        # Convert Pydantic model to dict for Firestore
        details_dict = {
            "id": details.id,
            "footage_sqm": details.footage_sqm,
            "property_type": details.property_type,
            "address": {
                "street": details.address.street,
                "city": details.address.city,
                "zip": details.address.zip,
            },
            "budget_cap": details.budget_cap,
            "technical_notes": details.technical_notes,
            "renovation_constraints": details.renovation_constraints,
        }

        await doc_ref.update({
            "constructionDetails": details_dict,
            "updatedAt": utc_now(),
        })

        logger.info(f"[Projects] Updated construction details for project {session_id}")
        return True

    except Exception as e:
        logger.error(f"[Projects] Error updating project details {session_id}: {str(e)}", exc_info=True)
        return False


async def save_project_file_metadata(session_id: str, user_id: str, file_metadata: dict) -> bool:
    """
    Save metadata for an uploaded file to the project's 'files' subcollection.

    Args:
        session_id: Project ID.
        user_id: UID for ownership verification.
        file_metadata: Dictionary containing file details (url, name, type, size, etc.).

    Returns:
        True if saved successfully, False if project not found or unauthorized.
    """
    try:
        db = get_async_firestore_client()

        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        doc = await doc_ref.get()

        if not doc.exists:
            logger.warning(f"[Projects] Cannot save file metadata for non-existent project {session_id}")
            return False

        # Ownership check
        if (doc.to_dict() or {}).get("userId") != user_id:
            logger.warning(f"[Projects] User {user_id} not authorized to save file to {session_id}")
            return False

        file_id = file_metadata.get("file_id")
        if not file_id:
            logger.error("[Projects] file_id is required in file_metadata")
            return False

        # Prepare the document data
        doc_data = {
            "url": file_metadata.get("url"),
            "name": file_metadata.get("name"),
            "type": file_metadata.get("type"),
            "size": file_metadata.get("size"),
            "uploadedAt": utc_now(),
            "uploadedBy": user_id,
            "projectId": session_id
        }

        # Save to the 'files' subcollection
        files_ref = doc_ref.collection("files").document(file_id)
        await files_ref.set(doc_data)

        # Also update the project's updatedAt timestamp
        await doc_ref.update({"updatedAt": utc_now()})

        logger.info(f"[Projects] Saved file metadata {file_id} for project {session_id}")
        return True

    except Exception as e:
        logger.error(f"[Projects] Error saving file metadata for {session_id}: {str(e)}", exc_info=True)
        return False
