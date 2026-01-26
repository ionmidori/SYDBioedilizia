"""
Video Upload Handler using Google AI File API.

This module provides endpoints for uploading videos to Google's File API
for native multimodal processing with Gemini models.
"""
import os
import logging
import asyncio
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from pydantic import BaseModel
from google import genai
from google.genai import types
from src.auth.jwt_handler import verify_token

logger = logging.getLogger(__name__)

# Gemini initialization is handled lazily in the route handler
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

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
        # 🛡️ RATE LIMITING CHECK
        user_id = user_payload.get("uid", "unknown")
        
        from src.tools.quota import check_quota, increment_quota
        allowed, remaining, reset_at = check_quota(user_id, "upload_video")
        
        if not allowed:
            reset_time = reset_at.strftime("%H:%M")
            raise HTTPException(
                status_code=429,
                detail=f"⏳ Upload limit reached (1 video/day). Resets at {reset_time}."
            )

        # Lazy config
        if not GEMINI_API_KEY:
             raise RuntimeError("GEMINI_API_KEY not found")
        
        # Initialize new SDK Client
        client = genai.Client(api_key=GEMINI_API_KEY, http_options={'api_version': 'v1beta'})
        
        try:
            # 🛡️ SECURITY: Magic Bytes Validation
            from src.utils.security import validate_video_magic_bytes, sanitize_filename
            
            detected_mime = await validate_video_magic_bytes(file)
            logger.info(f"🛡️ Magic Bytes check passed: {detected_mime}")
            
            safe_filename = await sanitize_filename(file.filename or "upload.mp4")
            logger.info(f"📹 User {user_id} uploading video: {safe_filename} ({file.content_type})")
            
            content = await file.read()
            file_size = len(content)
            
            MAX_SIZE = 100 * 1024 * 1024  # 100MB
            if file_size > MAX_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large: {file_size / 1024 / 1024:.2f}MB. Maximum size is 100MB."
                )
            
            # Upload using new SDK
            import io
            file_stream = io.BytesIO(content)
            
            # Using Async upload
            uploaded_file = await client.aio.files.upload(
                file=file_stream,
                config=types.UploadFileConfig(
                    display_name=safe_filename,
                    mime_type=file.content_type
                )
            )
            
            logger.info(f"✅ Video uploaded successfully: {uploaded_file.uri}")
            logger.info(f"   State: {uploaded_file.state}")
            
            # Wait for processing
            max_wait = 30
            elapsed = 0
            
            while uploaded_file.state == "PROCESSING" and elapsed < max_wait:
                await asyncio.sleep(1)
                uploaded_file = await client.aio.files.get(name=uploaded_file.name)
                elapsed += 1
                
            if uploaded_file.state != "ACTIVE":
                raise HTTPException(
                    status_code=500,
                    detail=f"File processing failed. State: {uploaded_file.state}"
                )
            
            # ✅ INCREMENT QUOTA (Only on success)
            increment_quota(user_id, "upload_video")
            
            return UploadResponse(
                file_uri=uploaded_file.uri,
                mime_type=uploaded_file.mime_type,
                display_name=uploaded_file.display_name,
                state=uploaded_file.state,
                size_bytes=file_size
            )
            
        finally:
            client.close()
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Video upload failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Upload failed: {str(e)}"
        )
