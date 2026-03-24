import re

from pydantic import BaseModel, Field, field_validator
from typing import Optional

_ALLOWED_CONTENT_TYPES = frozenset({
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf", "video/mp4", "video/webm",
})
_ALLOWED_FOLDERS = frozenset({"project_assets", "gallery", "testimonials", "renders"})
_SAFE_FILENAME_RE = re.compile(r"^[a-zA-Z0-9._-]+$")


class SignedUrlRequest(BaseModel):
    """Request schema for generating a direct upload URL."""
    filename: str = Field(..., min_length=1, max_length=255)
    content_type: str
    folder: str = "project_assets"

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, v: str) -> str:
        if ".." in v or "/" in v or "\\" in v:
            raise ValueError("Path traversal detected in filename")
        if not _SAFE_FILENAME_RE.match(v):
            raise ValueError("Filename contains disallowed characters")
        return v

    @field_validator("content_type")
    @classmethod
    def validate_content_type(cls, v: str) -> str:
        if v not in _ALLOWED_CONTENT_TYPES:
            raise ValueError(f"Content type not allowed: {v}")
        return v

    @field_validator("folder")
    @classmethod
    def validate_folder(cls, v: str) -> str:
        if v not in _ALLOWED_FOLDERS:
            raise ValueError(f"Folder not allowed: {v}")
        return v

class SignedUrlResponse(BaseModel):
    """Response schema containing the signed URL and asset metadata."""
    upload_url: str
    public_url: str
    path: str
