"""
Media Upload Handler for Images and Videos.

This module provides endpoints for uploading media files:
- Images: Uploaded to Firebase Storage with signed URLs
- Videos: Uploaded to Firebase Storage; the model reads them by gs:// URI (Vertex AI)

**Security**: All uploaded files are validated using Magic Bytes to prevent
MIME type spoofing attacks (e.g., .exe files renamed to .jpg).
"""
import re
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from firebase_admin import storage as fb_storage
from pydantic import BaseModel
from src.auth.jwt_handler import verify_token
from src.core.exceptions import QuotaExceeded
from src.core.logger import get_logger
from src.models.media import ImageMediaAsset, VideoMediaAsset
from src.repositories.conversation_repository import get_conversation_repository
from src.schemas.internal import UserSession
from src.tools.quota import check_quota, increment_quota
from src.utils.security import sanitize_filename, validate_image_magic_bytes, validate_video_magic_bytes

logger = get_logger(__name__)

router = APIRouter(prefix="/api/upload", tags=["upload"])


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
# Resumable upload chunk (multiple of 256 KiB). Without it the GCS client
# buffers up to 100 MB per request.
STORAGE_UPLOAD_CHUNK = 8 * 1024 * 1024

# Detected MIME (validate_video_magic_bytes) -> stored file extension
_VIDEO_EXTENSIONS = {"video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm"}


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
) -> tuple[str, str]:
    """Synchronous Firebase Storage upload — runs in threadpool to avoid blocking the event loop."""
    bucket = fb_storage.bucket()
    blob = bucket.blob(file_path)

    blob.upload_from_string(content, content_type=content_type)

    # Private cache: the object is NOT public, so only the bearer of a valid
    # signed URL may fetch it. "private" prevents shared/CDN caches from
    # retaining the (authenticated) response.
    blob.cache_control = "private, max-age=3600"
    blob.content_disposition = f'inline; filename="{safe_filename}"'
    blob.patch()

    # 🔒 Security (H-2): do NOT call blob.make_public(). User uploads are
    # private interiors/PII (GDPR). Access is granted ONLY via short-lived
    # signed URLs; the gallery regenerates fresh signed URLs from the stored
    # storage_path on read (see src/tools/gallery.py).
    signed_url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(hours=1),
        method="GET",
    )

    return signed_url, signed_url


def _spooled_size(file: UploadFile) -> int:
    """Byte size of the upload, read from its spooled temp file (no copy)."""
    stream = file.file
    stream.seek(0, 2)
    size = stream.tell()
    stream.seek(0)
    return size


def _firebase_upload_stream(
    file_path: str,
    file: UploadFile,
    content_type: str,
    safe_filename: str,
) -> tuple[str, str]:
    """Stream an upload to Firebase Storage in chunks — runs in threadpool.

    Returns (gs:// URI the model reads, short-lived signed URL for the preview).
    """
    bucket = fb_storage.bucket()
    blob = bucket.blob(file_path, chunk_size=STORAGE_UPLOAD_CHUNK)
    # Same privacy as images: private object, signed URLs only (H-2).
    blob.cache_control = "private, max-age=3600"
    blob.content_disposition = f'inline; filename="{safe_filename}"'
    file.file.seek(0)
    blob.upload_from_file(file.file, content_type=content_type)

    signed_url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(hours=1),
        method="GET",
    )
    return f"gs://{bucket.name}/{file_path}", signed_url


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
    # Validate session_id format (prevent path traversal / log injection)
    if not re.match(r'^[a-zA-Z0-9_-]+$', session_id) or len(session_id) > 128:
        raise HTTPException(status_code=422, detail="Invalid session_id format")

    # 🛡️ Ownership (security audit M1): never attach files to another user's project.
    # Outside the try below, so PermissionDenied reaches the handler as a 403.
    await get_conversation_repository().assert_session_access(session_id, user_session.uid)

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
        # Both URLs are short-lived signed URLs (object stays private — H-2).
        signed_url, _ = await run_in_threadpool(
            _firebase_upload, file_path, content, validated_mime, safe_filename
        )

        # 7. Increment quota
        await increment_quota(user_id, "upload_image")

        # 8. Persist metadata to Firestore so uploaded photos appear in the gallery.
        # The gallery regenerates fresh signed URLs from storage_path on read, so
        # storing a (transient) signed URL here is acceptable.
        repo = get_conversation_repository()
        await repo.save_file_metadata(session_id, {
            "url": signed_url,
            "type": "image",
            "name": safe_filename,
            "size": file_size,
            "uploadedBy": user_id,
            "mimeType": validated_mime,
            "metadata": {"source": "user_upload", "storage_path": file_path},
        })

        logger.info(
            "image_upload_completed",
            extra={
                "session_id": session_id,
                "file_path": file_path,
                "file_size_bytes": file_size,
                "mime_type": validated_mime,
                "user_id": user_id,
                "storage_url": signed_url.split("?")[0],
            }
        )

        return ImageMediaAsset(
            id=asset_id,
            url=signed_url,
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
        ) from e


@router.post("/video", response_model=VideoMediaAsset)
async def upload_video(
    request: Request,
    file: UploadFile = File(...),
    session_id: str = Form(...),
    user_session: UserSession = Depends(verify_token),
) -> VideoMediaAsset:
    """
    Upload a video to Firebase Storage for native multimodal processing.

    The model reads it from Storage by reference (gs:// URI on Vertex AI): no
    Gemini File API, no AI Studio key.

    Args:
        file: Video file (mp4, mov, webm)
        session_id: Chat session ID (= project id) that owns the upload
        user_session: JWT verified user session

    Returns:
        VideoMediaAsset with the gs:// URI (`file_uri`) and a signed preview URL

    Raises:
        HTTPException: If upload fails or file type is invalid
    """
    # Validate session_id format (prevent path traversal / log injection)
    if not re.match(r'^[a-zA-Z0-9_-]+$', session_id) or len(session_id) > 128:
        raise HTTPException(status_code=422, detail="Invalid session_id format")

    # 🛡️ Ownership: never attach files to another user's project (403 outside the try).
    await get_conversation_repository().assert_session_access(session_id, user_session.uid)

    try:
        # 1. Early rejection via Content-Length header (fast fail, advisory only)
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_VIDEO_SIZE * 2:
            raise HTTPException(status_code=413, detail="Request body too large.")

        user_id = user_session.uid

        # 2. Quota enforcement (DRY)
        await _enforce_quota(user_id, "upload_video")

        # 3. Magic Bytes Validation
        detected_mime = await validate_video_magic_bytes(file)
        logger.info(f"Video Magic Bytes check passed: {detected_mime}")

        safe_filename = await sanitize_filename(file.filename or "upload.mp4")

        # 4. Size from the spooled temp file Starlette already wrote: no copy of
        #    the body in memory (the File API path held it twice, ~200 MB).
        file_size = await run_in_threadpool(_spooled_size, file)
        if file_size > MAX_VIDEO_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {MAX_VIDEO_SIZE / 1024 / 1024:.0f}MB.",
            )

        # 5. Stream to Storage (resumable upload, fixed-size chunks)
        asset_id = uuid.uuid4().hex
        ext = _VIDEO_EXTENSIONS.get(detected_mime, "mp4")
        file_path = f"user-uploads/{session_id}/{asset_id}.{ext}"
        gs_uri, signed_url = await run_in_threadpool(
            _firebase_upload_stream, file_path, file, detected_mime, safe_filename
        )

        # 6. Increment quota (only on success)
        await increment_quota(user_id, "upload_video")

        logger.info(
            "video_upload_completed",
            extra={"file_path": file_path, "file_size_bytes": file_size, "mime_type": detected_mime},
        )

        return VideoMediaAsset(
            id=asset_id,
            url=signed_url,
            filename=safe_filename,
            mime_type=detected_mime,
            size_bytes=file_size,
            file_uri=gs_uri,
            file_path=file_path,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Video upload handler failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Upload failed. Please try again."
        ) from e
