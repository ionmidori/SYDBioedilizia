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
from datetime import timedelta
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Form, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Tuple
from firebase_admin import storage as fb_storage
from src.db.firebase_client import get_storage_client
from src.auth.jwt_handler import verify_token
from src.schemas.internal import UserSession
from src.services.media_processor import MediaProcessor, get_media_processor, VideoProcessingError
from src.core.logger import get_logger
from src.models.media import ImageMediaAsset, VideoMediaAsset
from src.utils.security import validate_image_magic_bytes, validate_video_magic_bytes, sanitize_filename
from src.tools.quota import check_quota, increment_quota
from src.core.exceptions import QuotaExceeded

logger = get_logger(__name__)

router = APIRouter(prefix="/api/upload", tags=["upload"])


class VideoUploadResponse(BaseModel):
    """Response model for video upload."""
    model_config = {"extra": "ignore"}
    file_uri: str
    mime_type: str
    display_name: str
    state: str
    size_bytes: int


class ImageUploadResponse(BaseModel):
    """Response model for image upload."""
    model_config = {"extra": "ignore"}
    public_url: str
    signed_url: str
    file_path: str
    mime_type: str
    size_bytes: int


MAX_IMAGE_SIZE = 10 * 1024 * 1024   # 10MB
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100MB
CHUNK_SIZE = 1024 * 1024            # 1MB read chunks


# ── Shared Dependencies (DRY) ──────────────────────────────────────────────

async def _enforce_quota(user_id: str, tool_name: str) -> int:
    """Check quota and raise QuotaExceeded if limit reached. Returns remaining count."""
    allowed, remaining, reset_at = await check_quota(user_id, tool_name)
    if not allowed:
        raise QuotaExceeded(
            message=f"Limite {tool_name} raggiunto. Riprova domani.",
            detail={"tool_name": tool_name, "reset_at": reset_at.isoformat()},
        )
    return remaining


# ── Chunked File Reading (Memory Safety) ───────────────────────────────────

async def _safe_read_file(file: UploadFile, max_size: int) -> bytes:
    """Read file in chunks, rejecting payloads that exceed max_size.

    Prevents memory exhaustion from spoofed Content-Length headers
    by enforcing the limit during read, not just after.
    """
    buf = bytearray()
    while chunk := await file.read(CHUNK_SIZE):
        buf.extend(chunk)
        if len(buf) > max_size:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {max_size / 1024 / 1024:.0f}MB.",
            )
    return bytes(buf)


# ── Sync Firebase Operations (Thread Pool) ─────────────────────────────────

def _firebase_upload(
    file_path: str,
    content: bytes,
    content_type: str,
    safe_filename: str,
) -> Tuple[str, str]:
    """Synchronous Firebase Storage upload — runs in threadpool to avoid blocking the event loop."""
    bucket = fb_storage.bucket()
    blob = bucket.blob(file_path)

    blob.upload_from_string(content, content_type=content_type)

    blob.cache_control = "public, max-age=31536000, immutable"
    blob.content_disposition = f'inline; filename="{safe_filename}"'
    blob.patch()

    signed_url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(hours=1),
        method="GET",
    )

    blob.make_public()
    return blob.public_url, signed_url


# ── Endpoints ──────────────────────────────────────────────────────────────

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
        ImageMediaAsset with public URL and metadata

    Raises:
        HTTPException: If upload fails or file type is invalid
    """
    try:
        # 1. Early rejection via Content-Length header (fast fail, advisory only)
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_IMAGE_SIZE * 2:
            raise HTTPException(status_code=413, detail="Request body too large.")

        user_id = user_session.uid

        # 2. Quota enforcement (DRY)
        remaining = await _enforce_quota(user_id, "upload_image")

        # 3. Magic Bytes Validation (before reading full body)
        validated_mime = await validate_image_magic_bytes(file)
        logger.info(f"Image Magic Bytes check passed: {validated_mime}")

        safe_filename = await sanitize_filename(file.filename or "upload.jpg")

        # 4. Chunked read with enforced size limit (memory safety)
        content = await _safe_read_file(file, MAX_IMAGE_SIZE)
        file_size = len(content)

        logger.info(
            "image_upload_started",
            extra={
                "session_id": session_id,
                "file_size_bytes": file_size,
                "mime_type": validated_mime,
                "user_id": user_id,
                "quota_remaining": remaining,
            }
        )

        # 5. Generate unique storage path
        asset_id = uuid.uuid4().hex
        ext = safe_filename.split('.')[-1] if '.' in safe_filename else 'jpg'
        file_path = f"user-uploads/{session_id}/{asset_id}.{ext}"

        # 6. Firebase upload in threadpool (non-blocking)
        public_url, signed_url = await run_in_threadpool(
            _firebase_upload, file_path, content, validated_mime, safe_filename
        )

        # 7. Increment quota
        await increment_quota(user_id, "upload_image")

        logger.info(
            "image_upload_completed",
            extra={
                "session_id": session_id,
                "file_path": file_path,
                "file_size_bytes": file_size,
                "mime_type": validated_mime,
                "user_id": user_id,
                "storage_url": public_url,
            }
        )

        return ImageMediaAsset(
            id=asset_id,
            url=public_url,
            filename=safe_filename,
            mime_type=validated_mime,
            size_bytes=file_size,
            file_path=file_path,
            signed_url=signed_url,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image upload failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Upload failed. Please try again."
        )


@router.post("/video", response_model=VideoMediaAsset)
async def upload_video(
    request: Request,
    file: UploadFile = File(...),
    user_session: UserSession = Depends(verify_token),
    processor: MediaProcessor = Depends(get_media_processor),
) -> VideoMediaAsset:
    """
    Upload a video file to Google AI File API for native processing.

    Args:
        file: Video file (mp4, webm, mov, avi)
        user_session: JWT verified user session
        processor: Injected MediaProcessor service

    Returns:
        VideoMediaAsset with file URI and metadata

    Raises:
        HTTPException: If upload fails or file type is invalid
    """
    try:
        # 1. Early rejection via Content-Length header (fast fail, advisory only)
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_VIDEO_SIZE * 2:
            raise HTTPException(status_code=413, detail="Request body too large.")

        user_id = user_session.uid

        # 2. Quota enforcement (DRY)
        await _enforce_quota(user_id, "upload_video")

        try:
            # 3. Magic Bytes Validation
            detected_mime = await validate_video_magic_bytes(file)
            logger.info(f"Video Magic Bytes check passed: {detected_mime}")

            safe_filename = await sanitize_filename(file.filename or "upload.mp4")
            logger.info(f"User {user_id} uploading video: {safe_filename} ({detected_mime})")

            # 4. Chunked read with enforced size limit (memory safety)
            content = await _safe_read_file(file, MAX_VIDEO_SIZE)
            file_size = len(content)

            # 5. Prepare stream for Google File API
            file_stream = io.BytesIO(content)

            # 6. Delegate to service (async — already non-blocking)
            uploaded_file = await processor.upload_video_for_analysis(
                file_stream=file_stream,
                mime_type=detected_mime,
                display_name=safe_filename,
            )

            # 7. Wait for processing (async polling)
            active_file = await processor.wait_for_processing(uploaded_file.name)

            # 8. Increment quota (only on success)
            await increment_quota(user_id, "upload_video")

            asset_id = uuid.uuid4().hex

            return VideoMediaAsset(
                id=asset_id,
                url=active_file.uri,
                filename=safe_filename,
                mime_type=active_file.mime_type,
                size_bytes=file_size,
                file_uri=active_file.uri,
                state=active_file.state.name,
            )

        except VideoProcessingError as e:
            logger.error(f"Video processing error: {str(e)}")
            raise HTTPException(
                status_code=502,
                detail="Video processing failed. Please try a different format or smaller file.",
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Video upload handler failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Upload failed. Please try again."
        )
