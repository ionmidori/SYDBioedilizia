import logging

from src.tools.project_storage import ProjectAccessError, assert_project_owner, iter_project_blobs

logger = logging.getLogger(__name__)

def list_project_files(session_id: str, user_id: str, category: str | None = None, limit: int = 20) -> str:
    """
    Lists the files available in the current project (images, documents, videos).

    Use this tool to check what assets are available before answering questions about the project.
    You MUST verify the file list if the user asks about specific plans, photos, or quotes.

    Args:
        session_id: The project ID context (verified session).
        user_id: The verified caller (ADK tool_context.user_id).
        category: Optional filter. 'image', 'video', 'document' (pdfs), 'plan' (planimetries).
        limit: Max number of files to return (default 20).

    Returns:
        A formatted string list of filenames with their types and URLs.
    """
    logger.info("📂 [Tool] list_project_files requested")

    try:
        # 1. SECURITY CHECK: the verified caller must own the project.
        try:
            assert_project_owner(session_id, user_id)
        except ProjectAccessError as e:
            return f"Error: {e}."

        # 2. LIST FILES from every storage prefix of the project (uploads, renders, PDFs)
        file_list = []

        count = 0
        for blob in iter_project_blobs(session_id):
            # Filter by category if requested
            content_type = blob.content_type or ""
            filename = blob.name.split("/")[-1]

            # Simple category detection
            is_match = True
            if category:
                if category == 'image' and not content_type.startswith('image/'):
                    is_match = False
                elif category == 'video' and not content_type.startswith('video/'):
                    is_match = False
                elif category == 'document' and not content_type.startswith('application/pdf'):
                    is_match = False
                # Smart tag check (requires metadata which we assume might be there or filename convention)
                elif category == 'plan':
                    # Fallback check for filenames containing 'plan' or 'piantina'
                    if 'plan' not in filename.lower() and 'piantina' not in filename.lower():
                        is_match = False


            if is_match:
                # Read metadata from Firebase Storage
                metadata = blob.metadata or {}
                room_tag = (metadata.get('room') or '').strip()
                status_tag = (metadata.get('status') or '').strip()

                # Build tag prefix for smart display
                tags = []
                if room_tag:
                    tags.append(room_tag)
                if status_tag:
                    tags.append(status_tag)

                tag_prefix = f"[{' | '.join(tags)}] " if tags else ""

                # Format: [room | status] filename (type)
                file_list.append(f"- {tag_prefix}{filename} ({content_type})")
                count += 1
                if count >= limit:
                    break

        if not file_list:
            if category:
                return f"No files found in category '{category}'."
            return "No files found in this project."

        return "\n".join(file_list)

    except Exception as e:  # noqa: BLE001
        logger.error(f"❌ [Tool] Error listing files: {str(e)}")
        return "System Error: Unable to list files."
