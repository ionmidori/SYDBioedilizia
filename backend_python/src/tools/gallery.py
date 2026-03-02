import json
from datetime import timedelta
from typing import Optional
import firebase_admin
from firebase_admin import storage, firestore
from src.utils.context import get_current_user_id
import logging

logger = logging.getLogger(__name__)

def show_project_gallery(session_id: str, room: Optional[str] = None, status: Optional[str] = None) -> str:
    """
    Displays a visual gallery of project photos and renderings in the chat.
    Use this tool when the user asks to see photos, renderings, or specific rooms.
    
    Args:
        session_id: The project ID context.
        room: Optional filter for a specific room (e.g., 'cucina', 'bagno', 'soggiorno').
        status: Optional filter for file status (e.g., 'approvato', 'bozza').
    
    Returns:
        A JSON string containing a list of image objects with URLs and metadata.
    """
    user_id = get_current_user_id()
    logger.info(f"🖼️ [Tool] show_project_gallery requested for {session_id} (Room: {room}, Status: {status}) by {user_id}")
    
    if not user_id:
        return "Error: User not authenticated."

    try:
        # 1. SECURITY CHECK: Verify Ownership via Firestore
        db = firestore.client()
        project_ref = db.collection("projects").document(session_id)
        project_snap = project_ref.get()
        
        if not project_snap.exists:
            return "Error: Project not found."
            
        project_data = project_snap.to_dict()
        owner_id = project_data.get("user_id") or project_data.get("uid")
        
        if owner_id != user_id:
            logger.warning(f"⛔ [Tool] Access Denied: User {user_id} tried to access {session_id}")
            return "Error: Access Denied."

        # 2. LIST IMAGES from Storage
        bucket = storage.bucket()
        prefix = f"projects/{session_id}/"
        
        blobs = bucket.list_blobs(prefix=prefix)
        gallery_items = []
        
        for blob in blobs:
            if blob.name.endswith("/"): continue
            
            content_type = blob.content_type or ""
            if not content_type.startswith('image/'): continue
            
            # Fetch Metadata
            metadata = blob.metadata or {}
            
            # Filter by room if requested
            if room:
                room_meta = metadata.get('room', '').lower()
                if room.lower() not in room_meta and room.lower() not in blob.name.lower():
                    continue
                    
            # Filter by status if requested
            if status:
                status_meta = metadata.get('status', '').lower()
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
            if room: msg += f" for room '{room}'"
            return msg

        # Return structured JSON for the frontend GalleryCard component
        return json.dumps({
            "type": "gallery",
            "projectId": session_id,
            "items": gallery_items
        })

    except Exception as e:
        logger.error(f"❌ [Tool] Gallery Error: {str(e)}")
        return f"Error loading gallery: {str(e)}"
