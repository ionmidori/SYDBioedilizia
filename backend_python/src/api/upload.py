"""
Media Upload Handler for Images and Videos.

This module provides endpoints for uploading media files:
- Images: Uploaded to Firebase Storage with signed URLs
- Videos: Uploaded to Google AI File API for native multimodal processing

**Security**: All uploaded files are validated using Magic Bytes to prevent
MIME type spoofing attacks (e.g., .exe files renamed to .jpg).
"""
import io
import uuid
import time
from datetime import datetime, timedelta
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Form, Request, Response
from pydantic import BaseModel
from typing import Optional
from src.db.firebase_client import get_storage_client
from src.auth.jwt_handler import verify_token
from src.schemas.internal import UserSession
from src.services.media_processor import MediaProcessor, get_media_processor, VideoProcessingError
from src.core.logger import get_logger
from src.models.media import ImageMediaAsset, VideoMediaAsset
from src.utils.security import validate_image_magic_bytes, validate_video_magic_bytes, sanitize_filename

logger = get_logger(__name__)

router = APIRouter(prefix="/api/upload", tags=["upload"])


class VideoUploadResponse(BaseModel):
    """Response model for video upload."""
    file_uri: str
    mime_type: str
    display_name: str
    state: str
    size_bytes: int


class ImageUploadResponse(BaseModel):
    """Response model for image upload."""
    public_url: str
    signed_url: str
    file_path: str
    mime_type: str
    size_bytes: int


MAX_IMAGE_SIZE = 10 * 1024 * 1024   # 10MB
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100MB


@router.post("/image", response_model=ImageMediaAsset)
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    session_id: str = Form(...),
    user_session: UserSession = Depends(verify_token),
) -> ImageMediaAsset:
    """
    Upload an image to Firebase Storage.
    
    Args:
        file: Image file (jpeg, png, webp, gif)
        session_id: Chat session ID for organizing uploads
        user_session: JWT verified user session
        
    Returns:
        ImageUploadResponse with public URL and metadata
        
    Raises:
        HTTPException: If upload fails or file type is invalid
    """
    try:
        # 🛡️ EARLY REJECTION: Check Content-Length header before reading body
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_IMAGE_SIZE * 2:
            raise HTTPException(status_code=413, detail="Request body too large.")

        user_id = user_session.uid

        # 🛡️ RATE LIMITING CHECK
        from src.tools.quota import check_quota, increment_quota
        allowed, remaining, reset_at = await check_quota(user_id, "upload_image")
        
        if not allowed:
            reset_time = reset_at.strftime("%H:%M")
            raise HTTPException(
                status_code=429,
                detail=f"⏳ Upload limit reached (10 images/day). Resets at {reset_time}."
            )
        
        # 🛡️ SECURITY: Magic Bytes Validation (Prevents .exe -> .jpg attacks)
        validated_mime = await validate_image_magic_bytes(file)
        logger.info(f"🛡️ Image Magic Bytes check passed: {validated_mime}")
        
        # Sanitize filename
        safe_filename = await sanitize_filename(file.filename or "upload.jpg")
        
        # Read file content
        content = await file.read()
        file_size = len(content)
        
        # 📊 LOG: Upload Started
        logger.info(
            "image_upload_started",
            extra={
                "session_id": session_id,
                "file_size_bytes": file_size,
                "mime_type": file.content_type,
                "user_id": user_id,
                "quota_remaining": remaining
            }
        )
        
        if file_size > MAX_IMAGE_SIZE:
            logger.warning(
                "image_upload_rejected_size",
                extra={
                    "file_size_bytes": file_size,
                    "max_size_bytes": MAX_IMAGE_SIZE,
                    "user_id": user_id
                }
            )
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {file_size / 1024 / 1024:.2f}MB. Maximum size is 10MB."
            )
        
        # Generate unique filename with asset ID
        asset_id = uuid.uuid4().hex
        ext = safe_filename.split('.')[-1] if '.' in safe_filename else 'jpg'
        unique_filename = f"{asset_id}.{ext}"
        file_path = f"user-uploads/{session_id}/{unique_filename}"
        
        # Upload to Firebase Storage
        from firebase_admin import storage
        bucket = storage.bucket()
        blob = bucket.blob(file_path)
        
        blob.upload_from_string(
            content,
            content_type=validated_mime  # Use validated MIME, not declared
        )

        # 🛡️ SECURITY: Set Metadata
        # - Cache-Control: Immutable (1 year) since we use UUIDs
        # - Content-Disposition: Inline but with correct filename
        blob.cache_control = "public, max-age=31536000, immutable"
        blob.content_disposition = f'inline; filename="{safe_filename}"'
        blob.patch()
        
        # Generate signed URL (1 hour validity - minimizes exposure window)
        signed_url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(hours=1),
            method="GET"
        )
        
        # Make public URL
        blob.make_public()
        public_url = blob.public_url
        
        # ✅ INCREMENT QUOTA
        await increment_quota(user_id, "upload_image")
        
        # 📊 LOG: Upload Completed
        logger.info(
            "image_upload_completed",
            extra={
                "session_id": session_id,
                "file_path": file_path,
                "file_size_bytes": file_size,
                "mime_type": file.content_type,
                "user_id": user_id,
                "storage_url": public_url
            }
        )
        
        return ImageMediaAsset(
            id=asset_id,
            url=public_url,
            filename=safe_filename,
            mime_type=validated_mime,
            size_bytes=file_size,
            file_path=file_path,
            signed_url=signed_url
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image upload failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Upload failed. Please try again."
        )


@router.post("/video", response_model=VideoMediaAsset)
async def upload_video(
    request: Request,
    file: UploadFile = File(...),
    user_session: UserSession = Depends(verify_token),
    processor: MediaProcessor = Depends(get_media_processor)
) -> VideoMediaAsset:
    """
    Upload a video file to Google AI File API for native processing.
    
    Args:
        file: Video file (mp4, webm, mov, avi)
        user_session: JWT verified user session
        processor: Injected MediaProcessor service
        
    Returns:
        VideoUploadResponse with file URI and metadata
        
    Raises:
        HTTPException: If upload fails or file type is invalid
    """
    try:
        # 🛡️ EARLY REJECTION: Check Content-Length header before reading body
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_VIDEO_SIZE * 2:
            raise HTTPException(status_code=413, detail="Request body too large.")

        user_id = user_session.uid

        # 🛡️ RATE LIMITING CHECK
        from src.tools.quota import check_quota, increment_quota
        allowed, remaining, reset_at = await check_quota(user_id, "upload_video")
        
        if not allowed:
            reset_time = reset_at.strftime("%H:%M")
            raise HTTPException(
                status_code=429,
                detail=f"⏳ Upload limit reached (1 video/day). Resets at {reset_time}."
            )
        
        try:
            # 🛡️ SECURITY: Magic Bytes Validation (already imported at top)
            detected_mime = await validate_video_magic_bytes(file)
            logger.info(f"🛡️ Magic Bytes check passed: {detected_mime}")            
            safe_filename = await sanitize_filename(file.filename or "upload.mp4")
            logger.info(f"📹 User {user_id} uploading video: {safe_filename} ({file.content_type})")
            
            content = await file.read()
            file_size = len(content)
            
            if file_size > MAX_VIDEO_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large: {file_size / 1024 / 1024:.2f}MB. Maximum size is 100MB."
                )
            
            # Prepare stream for service
            file_stream = io.BytesIO(content)
            
            # 🚀 DELEGATE TO SERVICE (use validated MIME, not client-declared)
            uploaded_file = await processor.upload_video_for_analysis(
                file_stream=file_stream,
                mime_type=detected_mime,
                display_name=safe_filename
            )
            
            # Wait for processing (Polling)
            active_file = await processor.wait_for_processing(uploaded_file.name)
            
            # ✅ INCREMENT QUOTA (Only on success)
            await increment_quota(user_id, "upload_video")
            
            # Generate asset ID
            asset_id = uuid.uuid4().hex
            
            return VideoMediaAsset(
                id=asset_id,
                url=active_file.uri,  # File API URI is the URL for videos
                filename=safe_filename,
                mime_type=active_file.mime_type,
                size_bytes=file_size,
                file_uri=active_file.uri,
                state=active_file.state.name
            )
            
        except VideoProcessingError as e:
            logger.error(f"Video processing error: {str(e)}")
            raise HTTPException(
                status_code=502,
                detail="Video processing failed. Please try a different format or smaller file."
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Video upload handler failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Upload failed. Please try again."
        )

