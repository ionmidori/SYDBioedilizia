"""
API endpoint for updating file metadata in Firebase Storage.
Allows users to correct AI-assigned metadata (room type, status).
"""
import re
from typing import Literal

from fastapi import APIRouter, Depends
from google.api_core.exceptions import GoogleAPIError
from google.auth.exceptions import GoogleAuthError
from pydantic import BaseModel, Field, field_validator, model_validator
from src.auth.jwt_handler import get_current_user_id
from src.core.exceptions import PermissionDenied, ResourceNotFound, ServiceError
from src.core.logger import get_logger
from src.db.firebase_client import get_storage_client
from src.schemas.room import RoomType
from src.services.chat_merge.refs import media_prefixes
from src.tools.project_storage import ProjectNotFoundError, project_owner
from starlette.concurrency import run_in_threadpool

logger = get_logger(__name__)

router = APIRouter()

# Same values as STATUS_OPTIONS in web_client/components/chat/GalleryCard.tsx.
GalleryStatus = Literal["approvato", "bozza", "in_revisione", "scartato"]

_SAFE_PATH = re.compile(r"^[a-zA-Z0-9/_.\-]+$")


class UpdateMetadataRequest(BaseModel):
    """Request body for metadata update."""
    model_config = {"extra": "forbid"}

    project_id: str = Field(..., min_length=1, max_length=128, pattern=r'^[a-zA-Z0-9_-]+$')
    file_path: str = Field(..., min_length=1, max_length=512)
    room: RoomType | None = None
    status: GalleryStatus | None = None

    @field_validator('file_path')
    @classmethod
    def validate_file_path(cls, v: str) -> str:
        if '..' in v.split('/') or v.startswith('/') or v.endswith('/') or '//' in v:
            raise ValueError('Invalid file path')
        if not _SAFE_PATH.match(v):
            raise ValueError('Invalid file path: contains disallowed characters')
        return v

    @model_validator(mode='after')
    def require_a_field(self) -> "UpdateMetadataRequest":
        if self.room is None and self.status is None:
            raise ValueError('Nothing to update: send room and/or status')
        return self


def _patch_blob_metadata(file_path: str, update: dict[str, str]) -> bool:
    """Merge `update` into the blob's custom metadata; False if the blob is missing."""
    # get_storage_client() already returns a Bucket: do NOT call .bucket() on it.
    blob = get_storage_client().blob(file_path)
    if not blob.exists():
        return False
    blob.metadata = {**(blob.metadata or {}), **update}
    blob.patch()
    return True


@router.post("/update-file-metadata")
async def update_file_metadata(
    request: UpdateMetadataRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Update custom metadata (room, status) of one media file of the caller's project.

    Security: the Admin SDK bypasses storage.rules, so the route itself checks
    that the caller owns the project AND that `file_path` is one of that
    project's media (`media_prefixes`: chat uploads, renders, dashboard
    uploads; never its quote PDFs). Owning one project must not open the files
    of another.
    """
    # Checked before any I/O: a path outside the project is refused without
    # revealing whether it exists.
    if not request.file_path.startswith(media_prefixes(request.project_id)):
        logger.warning("[UpdateMetadata] Refused: file outside the project's media folders")
        raise PermissionDenied("You don't have permission to edit this file")

    update = {k: v for k, v in (("room", request.room), ("status", request.status)) if v is not None}

    try:
        try:
            owner = await run_in_threadpool(project_owner, request.project_id)
        except ProjectNotFoundError as e:
            raise ResourceNotFound("Project not found") from e
        if owner != user_id:
            # No ids in the log: a project id is a session id (an access token).
            logger.warning("[UpdateMetadata] Refused: caller is not the project owner")
            raise PermissionDenied("You don't have permission to edit this project's files")

        if not await run_in_threadpool(_patch_blob_metadata, request.file_path, update):
            raise ResourceNotFound("File not found in storage")
    except (GoogleAPIError, GoogleAuthError) as e:
        logger.error(f"[UpdateMetadata] Firebase call failed: {type(e).__name__}")
        raise ServiceError("Failed to update metadata") from e

    logger.info(f"[UpdateMetadata] Updated fields: {sorted(update)}")
    return {
        "success": True,
        "file_path": request.file_path,
        "updated_metadata": update,
    }
