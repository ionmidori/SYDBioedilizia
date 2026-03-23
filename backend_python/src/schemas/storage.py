from pydantic import BaseModel
from typing import Optional

class SignedUrlRequest(BaseModel):
    """Request schema for generating a direct upload URL."""
    filename: str
    content_type: str
    folder: str = "project_assets"

class SignedUrlResponse(BaseModel):
    """Response schema containing the signed URL and asset metadata."""
    upload_url: str
    public_url: str
    path: str
