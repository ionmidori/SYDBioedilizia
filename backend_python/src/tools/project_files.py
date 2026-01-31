from typing import List, Optional
from langchain_core.tools import tool
import firebase_admin
from firebase_admin import storage, firestore
from src.utils.context import get_current_user_id
import logging

logger = logging.getLogger(__name__)

@tool
def list_project_files(session_id: str, category: Optional[str] = None, limit: int = 20) -> str:
    """
    Lists the files available in the current project (images, documents, videos).
    
    Use this tool to check what assets are available before answering questions about the project.
    You MUST verify the file list if the user asks about specific plans, photos, or quotes.
    
    Args:
        session_id: The project ID context.
        category: Optional filter. 'image', 'video', 'document' (pdfs), 'plan' (planimetries).
        limit: Max number of files to return (default 20).
    
    Returns:
        A formatted string list of filenames with their types and URLs.
    """
    user_id = get_current_user_id()
    logger.info(f"📂 [Tool] list_project_files requested for {session_id} by {user_id}")
    
    if not user_id:
        return "Error: User not authenticated. Cannot access project files."

    try:
        # 1. SECURITY CHECK: Verify Ownership via Firestore
        db = firestore.client()
        project_ref = db.collection("projects").document(session_id)
        project_snap = project_ref.get()
        
        if not project_snap.exists:
            logger.warning(f"⚠️ [Tool] Project {session_id} not found")
            return "Error: Project not found."
            
        project_data = project_snap.to_dict()
        owner_id = project_data.get("user_id") or project_data.get("uid")
        
        if owner_id != user_id:
            logger.warning(f"⛔ [Tool] Access Denied: User {user_id} tried to access {session_id} (owned by {owner_id})")
            return "Error: Access Denied. You do not have permission to view this project's files."

        # 2. LIST FILES from Storage
        bucket = storage.bucket()
        prefix = f"projects/{session_id}/" # Standard path structure
        
        blobs = bucket.list_blobs(prefix=prefix)
        file_list = []
        
        count = 0
        for blob in blobs:
            if blob.name.endswith("/"): # Skip folders
                continue
                
            # Filter by category if requested
            content_type = blob.content_type or ""
            filename = blob.name.split("/")[-1]
            
            # Simple category detection
            is_match = True
            if category:
                if category == 'image' and not content_type.startswith('image/'): is_match = False
                elif category == 'video' and not content_type.startswith('video/'): is_match = False
                elif category == 'document' and not content_type.startswith('application/pdf'): is_match = False
                # Smart tag check (requires metadata which we assume might be there or filename convention)
                elif category == 'plan':
                    # Fallback check for filenames containing 'plan' or 'piantina'
                    if 'plan' not in filename.lower() and 'piantina' not in filename.lower():
                        is_match = False
            
            
            if is_match:
                # Read metadata from Firebase Storage
                metadata = blob.metadata or {}
                room_tag = metadata.get('room', '').strip()
                status_tag = metadata.get('status', '').strip()
                
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

    except Exception as e:
        logger.error(f"❌ [Tool] Error listing files: {str(e)}")
        return f"System Error: Unable to list files. ({str(e)})"
