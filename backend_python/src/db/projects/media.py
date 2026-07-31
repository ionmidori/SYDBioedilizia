"""
Project cover-image synchronization from uploaded/rendered files.
"""
import logging

from src.db.firebase_client import get_async_firestore_client
from src.db.projects.constants import PROJECTS_COLLECTION
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)


async def sync_project_cover(session_id: str) -> bool:
    """
    Scans the project's 'files' container to determine the best cover.

    Priority:
    1. Latest Render (Before/After) - if 'source_image_id' present
    2. Latest Render (Single)
    3. First uploaded Photo
    4. First uploaded Video

    Args:
        session_id: Project ID.

    Returns:
        True if the cover was updated.
    """
    try:
        db = get_async_firestore_client()
        files_ref = db.collection('projects').document(session_id).collection('files')

        # Get all files (we expect small number < 100 for now)
        # Sort by uploadedAt descending to find latest easily
        # Note: In async client, order_by needs await logic or stream
        docs = files_ref.order_by('uploadedAt', direction='DESCENDING').stream()

        files = []
        async for doc in docs:
            files.append(doc.to_dict())

        if not files:
            return False

        new_thumbnail = None
        new_original = None

        # 1. Look for renders (Latest first)
        renders = [f for f in files if f.get('type') == 'render']
        if renders:
            latest_render = renders[0]
            new_thumbnail = latest_render.get('url')

            # Check for source image id in metadata
            meta = latest_render.get('metadata') or {}
            source_id = meta.get('source_image_id')
            if source_id:
                # Ideally source_id IS the URL if we set it that way.
                # Let's verify if it's a URL or ID. In generate_render we set it as source_image_url.
                if source_id.startswith('http'):
                    new_original = source_id
                else:
                    # Find the file with that ID/Name? For now assume it's URL.
                    pass

        # 2. If no renders, look for Photos (Oldest/First first? Or Latest?)
        # User said "create project and upload photo -> cover". Usually "First" uploaded is cover?
        # Or "Latest" uploaded?
        # User said: "se c'è una foto... applicala... se ce ne sono più, ne scegli una".
        # Let's pick the *First* uploaded photo to keep it stable, or *Latest* if we want dynamic?
        # User said: "project cover udpates after... uploaded". Implies the NEW one becomes cover?
        # Let's stick with LATEST for now as it feels more responsive.
        if not new_thumbnail:
            images = [f for f in files if f.get('type') == 'image']
            if images:
                # Files are sorted DESC (Latest first)
                new_thumbnail = images[0].get('url')

        # 3. If no images, look for Video
        if not new_thumbnail:
            videos = [f for f in files if f.get('type') == 'video']
            if videos:
                # Use a specific thumbnail field or fallback
                new_thumbnail = videos[0].get('thumbnailUrl')

        if not new_thumbnail:
            return False

        # Update Project
        # Retrieve current project to check if update needed
        project_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        project_doc = await project_ref.get()
        if not project_doc.exists:
             return False

        current_data = project_doc.to_dict() or {}

        # Only update if different
        if (current_data.get('thumbnailUrl') != new_thumbnail or
            current_data.get('originalImageUrl') != new_original):

            update_payload = {
                "thumbnailUrl": new_thumbnail,
                "originalImageUrl": new_original, # Can be None, which deletes it (FieldValue.delete())? No, None just sets null.
                "updatedAt": utc_now()
            }

            # Use dot notation or FieldValue.delete() if we want to remove fields? for now set null is fine (Pydantic allows optional)

            # Update Session
            await project_ref.update(update_payload)

            # Update 'projects' collection (public view)
            # Only thumbnail is needed there? Original image url for hover? We added it to Pydantic/Frontend types.
            # But 'projects' collection schema might be loose.
            public_ref = db.collection('projects').document(session_id)
            await public_ref.set({
                 "thumbnailUrl": new_thumbnail,
                 "originalImageUrl": new_original,
                 "updatedAt": utc_now()
            }, merge=True)

            logger.info(f"[Projects] 🖼️ Smart Cover: Updated {session_id} -> {new_thumbnail}")
            return True

        return False
    except Exception as e:
        logger.error(f"[Projects] Error syncing cover for {session_id}: {str(e)}", exc_info=True)
        return False
