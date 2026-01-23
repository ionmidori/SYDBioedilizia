"""
Video Upload Handler using Google AI File API.

This module provides endpoints for uploading videos to Google's File API
for native multimodal processing with Gemini models.
"""
import os
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from pydantic import BaseModel
import google.generativeai as genai
from src.auth.jwt_handler import verify_token

logger = logging.getLogger(__name__)

# Initialize Gemini File API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not found in environment variables")

genai.configure(api_key=GEMINI_API_KEY)

router = APIRouter(prefix="/upload", tags=["upload"])


class UploadResponse(BaseModel):
    """Response model for file upload."""
    file_uri: str
    mime_type: str
    display_name: str
    state: str
    size_bytes: int


@router.post("/video", response_model=UploadResponse)
async def upload_video(
    file: UploadFile = File(...),
    user_payload: dict = Depends(verify_token)
) -> UploadResponse:
    """
    Upload a video file to Google AI File API for native processing.
    
    Args:
        file: Video file (mp4, webm, mov, avi)
        user_payload: JWT verified user payload
        
    Returns:
        UploadResponse with file URI and metadata
        
    Raises:
        HTTPException: If upload fails or file type is invalid
    """
    try:
        # Validate file type
        if not file.content_type or not file.content_type.startswith('video/'):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type: {file.content_type}. Only video files are accepted."
            )
        
        # Get user ID for logging
        user_id = user_payload.get("uid", "unknown")
        logger.info(f"📹 User {user_id} uploading video: {file.filename} ({file.content_type})")
        
        # Read file content
        content = await file.read()
        file_size = len(content)
        
        # Check file size (limit to 100MB as per best practices)
        MAX_SIZE = 100 * 1024 * 1024  # 100MB
        if file_size > MAX_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {file_size / 1024 / 1024:.2f}MB. Maximum size is 100MB."
            )
        
        logger.info(f"📹 File size: {file_size / 1024 / 1024:.2f}MB")
        
        # Upload to Google AI File API
        # Note: Files are automatically deleted after 48 hours
        uploaded_file = genai.upload_file(
            path=file.file,
            display_name=file.filename,
            mime_type=file.content_type
        )
        
        logger.info(f"✅ Video uploaded successfully: {uploaded_file.uri}")
        logger.info(f"   State: {uploaded_file.state.name}")
        
        # Wait for file to be processed (ACTIVE state)
        # For large files, this may take a few seconds
        import time
        max_wait = 30  # seconds
        elapsed = 0
        while uploaded_file.state.name == "PROCESSING" and elapsed < max_wait:
            time.sleep(1)
            uploaded_file = genai.get_file(uploaded_file.name)
            elapsed += 1
            
        if uploaded_file.state.name != "ACTIVE":
            raise HTTPException(
                status_code=500,
                detail=f"File processing failed. State: {uploaded_file.state.name}"
            )
        
        logger.info(f"🎬 Video ready for inference: {uploaded_file.uri}")
        
        return UploadResponse(
            file_uri=uploaded_file.uri,
            mime_type=uploaded_file.mime_type,
            display_name=uploaded_file.display_name,
            state=uploaded_file.state.name,
            size_bytes=file_size
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Video upload failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Upload failed: {str(e)}"
        )
