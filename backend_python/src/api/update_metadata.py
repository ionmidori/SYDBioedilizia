"""
API endpoint for updating file metadata in Firebase Storage.
Allows users to correct AI-assigned metadata (room type, status).
"""
import re
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from src.db.firebase_client import get_firestore_client, get_storage_client
from src.auth.jwt_handler import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter()


_ALLOWED_PATH_PREFIXES = ("renders/", "user-uploads/", "projects/")


class UpdateMetadataRequest(BaseModel):
    """Request body for metadata update."""
    project_id: str = Field(..., min_length=1, max_length=128, pattern=r'^[a-zA-Z0-9_-]+$')
    file_path: str = Field(..., min_length=1, max_length=512)
    room: Optional[str] = Field(None, max_length=100)
    status: Optional[str] = Field(None, max_length=50)

    @field_validator('file_path')
    @classmethod
    def validate_file_path(cls, v: str) -> str:
        # Prevent path traversal
        if '..' in v or v.startswith('/') or '\\' in v:
            raise ValueError('Invalid file path: path traversal detected')
        # Only allow known storage prefixes
        if not v.startswith(_ALLOWED_PATH_PREFIXES):
            raise ValueError(f'Invalid file path: must start with one of {_ALLOWED_PATH_PREFIXES}')
        # Only allow safe characters
        if not re.match(r'^[a-zA-Z0-9/_.\-]+$', v):
            raise ValueError('Invalid file path: contains disallowed characters')
        return v


@router.post("/update-file-metadata")
async def update_file_metadata(
    request: UpdateMetadataRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Update custom metadata for a file in Firebase Storage.
    
    Security:
    - Verifies user owns the project via Firestore
    - Only allows updating whitelisted metadata fields (room, status)
    
    Args:
        request: Metadata update request
        user_id: Authenticated user ID from JWT
        
    Returns:
        Success confirmation with updated metadata
    """
    try:
        logger.info(f"[UpdateMetadata] User {user_id} updating {request.file_path}")
        
        # Verify Project Ownership
        db = get_firestore_client()
        project_ref = db.collection("projects").document(request.project_id)
        project_doc = project_ref.get()
        
        if not project_doc.exists:
            raise HTTPException(status_code=404, detail="Project not found")
            
        project_data = project_doc.to_dict()
        if project_data.get("userId") != user_id:
            raise HTTPException(
                status_code=403, 
                detail="You don't have permission to edit this project's files"
            )
        
        # Update Storage Metadata
        storage = get_storage_client()
        bucket = storage.bucket()
        blob = bucket.blob(request.file_path)
        
        if not blob.exists():
            raise HTTPException(status_code=404, detail="File not found in storage")
        
        # Build metadata update (only whitelisted fields)
        metadata_update = {}
        if request.room is not None:
            metadata_update["room"] = request.room
        if request.status is not None:
            metadata_update["status"] = request.status
            
        # Apply metadata patch
        blob.metadata = {**(blob.metadata or {}), **metadata_update}
        blob.patch()
        
        logger.info(f"[UpdateMetadata] Successfully updated metadata for {request.file_path}")
        
        return {
            "success": True,
            "file_path": request.file_path,
            "updated_metadata": metadata_update
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[UpdateMetadata] Failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update metadata")
