import json
import logging
from datetime import timedelta

from src.tools.project_storage import ProjectAccessError, assert_project_owner, iter_project_blobs

logger = logging.getLogger(__name__)

def show_project_gallery(
    session_id: str, user_id: str, room: str | None = None, status: str | None = None
) -> str:
    """
    Displays a visual gallery of project photos and renderings in the chat.
    Use this tool when the user asks to see photos, renderings, or specific rooms.

    Args:
        session_id: The project ID context (verified session).
        user_id: The verified caller (ADK tool_context.user_id).
        room: Optional filter for a specific room (e.g., 'cucina', 'bagno', 'soggiorno').
        status: Optional filter for file status (e.g., 'approvato', 'bozza').

    Returns:
        A JSON string containing a list of image objects with URLs and metadata.
    """
    logger.info(f"🖼️ [Tool] show_project_gallery requested (Room: {room}, Status: {status})")

    try:
        # 1. SECURITY CHECK: the verified caller must own the project.
        try:
            assert_project_owner(session_id, user_id)
        except ProjectAccessError as e:
            return f"Error: {e}."

        # 2. LIST IMAGES from every storage prefix of the project (uploads, renders)
        gallery_items = []

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

            gallery_items.append({
                "url": url,
                "name": blob.name.split("/")[-1],
                "metadata": metadata,
                "type": content_type
            })

            # Limit to 12 items for UI safety
            if len(gallery_items) >= 12:
                break

        if not gallery_items:
            msg = "No images found"
            if room:
                msg += f" for room '{room}'"
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
