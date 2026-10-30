"""
Write operations for Projects: the documents of a new chat, construction details, files.
"""
import logging
from datetime import datetime
from typing import Any

from src.db.firebase_client import get_async_firestore_client
from src.db.projects.constants import FILE_ROOM_FIELD, FILES_PARENT_COLLECTION, PROJECTS_COLLECTION
from src.models.project import ProjectDetails, ProjectStatus
from src.utils.datetime_utils import utc_now
from src.utils.download import storage_path_from_url

logger = logging.getLogger(__name__)


def project_projection(session_id: str, owner_id: str, title: str, now: datetime) -> dict[str, Any]:
    """Public projection `projects/{id}` of a project (same shape as the chat
    path in conversation_repository.ensure_session)."""
    return {
        "id": session_id,
        "name": title,
        "userId": owner_id,
        "createdAt": now,
        "updatedAt": now,
        "status": "active",
    }


def new_session_document(session_id: str, owner_id: str, title: str, now: datetime) -> dict[str, Any]:
    """`sessions/{id}` of a chat created by the backend outside a chat turn (the
    user's chat): written together with `project_projection`.

    S1 FIX: explicit null initialization for ALL fields.
    """
    return {
        "sessionId": session_id,
        "userId": owner_id,
        "title": title,
        "status": ProjectStatus.DRAFT.value,
        "thumbnailUrl": None,
        "originalImageUrl": None,
        "constructionDetails": None,
        "messageCount": 0,
        "is_deleted": False,
        "createdAt": now,
        "updatedAt": now,
    }


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


def is_dashboard_upload_path(session_id: str, path: str) -> bool:
    """A file the client uploaded from the dashboard into this project (useFileUpload).

    The path comes from the client; the gallery signs URLs from it and tools
    read by it, so it may never point into another project.
    """
    return path.startswith(f"projects/{session_id}/uploads/") and ".." not in path.split("/")


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

        # Prepare the document data (same shape as the chat uploads: the path
        # in metadata.storage_path, the room in a top-level roomId)
        doc_data: dict[str, Any] = {
            "url": file_metadata.get("url"),
            "name": file_metadata.get("name"),
            "type": file_metadata.get("type"),
            "size": file_metadata.get("size"),
            "uploadedAt": utc_now(),
            "uploadedBy": user_id,
            "projectId": session_id,
            "metadata": {"source": "dashboard_upload"},
        }
        # Explicit or read from the client's URL: kept only if it is this project's upload.
        storage_path = file_metadata.get("storage_path") or storage_path_from_url(file_metadata.get("url"))
        if storage_path and is_dashboard_upload_path(session_id, storage_path):
            doc_data["metadata"]["storage_path"] = storage_path
        elif storage_path:
            logger.warning(f"[Projects] Ignored storage path outside project {session_id} uploads")
        if file_metadata.get("room_id"):
            doc_data[FILE_ROOM_FIELD] = file_metadata["room_id"]

        # Save to the 'files' subcollection of the projection, with every other file
        files_ref = (
            db.collection(FILES_PARENT_COLLECTION).document(session_id).collection("files").document(file_id)
        )
        await files_ref.set(doc_data)

        # Also update the project's updatedAt timestamp
        await doc_ref.update({"updatedAt": utc_now()})

        logger.info(f"[Projects] Saved file metadata {file_id} for project {session_id}")
        return True

    except Exception as e:
        logger.error(f"[Projects] Error saving file metadata for {session_id}: {str(e)}", exc_info=True)
        return False
