import json
import logging
from datetime import timedelta
from typing import Any

from src.tools.project_files_view import ProjectFilesView
from src.tools.project_storage import (
    ProjectAccessError,
    assert_project_owner,
    iter_project_blobs,
    signed_url,
)

logger = logging.getLogger(__name__)

# Limit for UI safety
_MAX_ITEMS = 12
_GALLERY_FILE_TYPES = ("image", "render")


def _room_items(view: ProjectFilesView) -> list[dict[str, Any]]:
    """Photos and renders of one room (`view.files`, newest first)."""
    items = []
    for doc in view.files:
        path = (doc.get("metadata") or {}).get("storage_path")
        if doc.get("type") not in _GALLERY_FILE_TYPES or not path:
            continue
        items.append({
            "id": doc["id"],
            "url": signed_url(path),
            "name": doc.get("name") or path.split("/")[-1],
            "metadata": doc.get("metadata") or {},
            "type": doc.get("mimeType") or "image/jpeg",
            "room": view.room_label(doc),
        })
        if len(items) >= _MAX_ITEMS:
            break
    return items


def show_project_gallery(
    session_id: str,
    user_id: str,
    room: str | None = None,
    status: str | None = None,
    *,
    view: ProjectFilesView | None = None,
) -> str:
    """
    Displays a visual gallery of project photos and renderings in the chat.
    Use this tool when the user asks to see photos, renderings, or specific rooms.

    Args:
        session_id: The project ID context (verified session).
        user_id: The verified caller (ADK tool_context.user_id).
        room: Optional filter on the legacy Storage `room` metadata (e.g. 'cucina').
        status: Optional filter for file status (e.g., 'approvato', 'bozza').
        view: The project's `files` documents and rooms: each item gets its file
            id and room; with `room_only` only that room's files are shown.

    Returns:
        A JSON string containing a list of image objects with URLs and metadata.
    """
    view = view or ProjectFilesView()
    logger.info(f"🖼️ [Tool] show_project_gallery requested (Room: {room}, Status: {status}, by room: {view.room_only})")

    try:
        # 1. SECURITY CHECK: the verified caller must own the project.
        try:
            assert_project_owner(session_id, user_id)
        except ProjectAccessError as e:
            return f"Error: {e}."

        if view.room_only:
            gallery_items = _room_items(view)
        else:
            # 2. LIST IMAGES from every storage prefix of the project (uploads, renders)
            gallery_items = []
            docs = view.by_storage_path()

            for blob in iter_project_blobs(session_id):
                content_type = blob.content_type or ""
                if not content_type.startswith('image/'):
                    continue

                # Fetch Metadata
                metadata = blob.metadata or {}

                # Filter by room if requested
                if room:
                    room_meta = (metadata.get('room') or '').lower()
                    if room.lower() not in room_meta and room.lower() not in blob.name.lower():
                        continue

                # Filter by status if requested
                if status:
                    status_meta = (metadata.get('status') or '').lower()
                    if status.lower() not in status_meta:
                        continue

                # Generate Signed URL (1 hour)
                url = blob.generate_signed_url(expiration=timedelta(hours=1), version='v4')

                doc = docs.get(blob.name)
                gallery_items.append({
                    "id": doc["id"] if doc else None,
                    "url": url,
                    "name": blob.name.split("/")[-1],
                    "metadata": metadata,
                    "type": content_type,
                    "room": view.room_label(doc),
                })

                if len(gallery_items) >= _MAX_ITEMS:
                    break

        if not gallery_items:
            msg = "No images found"
            if room:
                msg += f" for room '{room}'"
            if view.room_only:
                msg += " for this room"
            return msg

        # Return structured JSON for the frontend GalleryCard component
        return json.dumps({
            "type": "gallery",
            "projectId": session_id,
            "items": gallery_items
        })

    except Exception as e:  # noqa: BLE001
        logger.error(f"❌ [Tool] Gallery Error: {str(e)}")
        return "Error loading gallery."
