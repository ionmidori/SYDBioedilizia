"""
MediaAsset Models (Discriminated Union Pattern).

This module defines strictly typed media asset models for all upload types.
Uses Pydantic V2 Discriminated Unions via `Literal` type discriminators.

**Golden Sync**: TypeScript interfaces must be generated in `web_client/types/media.ts`.
"""
from typing import Literal, Optional, Union
from datetime import datetime
from src.utils.datetime_utils import utc_now
from pydantic import BaseModel, Field, ConfigDict
import uuid


class MediaAssetBase(BaseModel):
    """
    Base model for all media assets.
    Common fields shared across image, video, and document types.
    """
    model_config = ConfigDict(extra="forbid")  # Strict: No extra fields

    id: str = Field(default_factory=lambda: uuid.uuid4().hex, description="Unique asset ID")
    url: str = Field(..., description="Public URL to access the asset")
    filename: str = Field(..., description="Original sanitized filename")
    mime_type: str = Field(..., description="Validated MIME type from Magic Bytes")
    size_bytes: int = Field(..., ge=0, description="File size in bytes")
    created_at: datetime = Field(default_factory=utc_now, description="Upload timestamp")


class ImageMediaAsset(MediaAssetBase):
    """
    Image-specific asset model.
    
    Discriminator: asset_type = "image"
    """
    asset_type: Literal["image"] = "image"
    
    # Image-specific metadata
    width: Optional[int] = Field(None, ge=1, description="Image width in pixels")
    height: Optional[int] = Field(None, ge=1, description="Image height in pixels")
    
    # Storage paths
    file_path: str = Field(..., description="Storage path in bucket")
    signed_url: Optional[str] = Field(None, description="Signed URL (expires)")


class VideoMediaAsset(MediaAssetBase):
    """
    Video-specific asset model.
    
    Discriminator: asset_type = "video"
    """
    asset_type: Literal["video"] = "video"
    
    # Video-specific metadata
    width: Optional[int] = Field(None, ge=1, description="Video width in pixels")
    height: Optional[int] = Field(None, ge=1, description="Video height in pixels")
    duration_seconds: Optional[float] = Field(None, ge=0, description="Duration in seconds")
    
    # File API reference (for Gemini multimodal processing)
    file_uri: str = Field(..., description="Google AI File API URI")
    state: str = Field(default="ACTIVE", description="File API processing state")


class DocumentMediaAsset(MediaAssetBase):
    """
    Document-specific asset model (PDF, etc).
    
    Discriminator: asset_type = "document"
    """
    asset_type: Literal["document"] = "document"
    
    page_count: Optional[int] = Field(None, ge=1, description="Number of pages (PDF)")
    
    # Storage paths
    file_path: str = Field(..., description="Storage path in bucket")
    signed_url: Optional[str] = Field(None, description="Signed URL (expires)")


# ============================================================================
# DISCRIMINATED UNION TYPE
# ============================================================================

MediaAsset = Union[ImageMediaAsset, VideoMediaAsset, DocumentMediaAsset]
"""
Discriminated Union type for all media assets.

Usage in FastAPI responses:
    response_model=ImageMediaAsset  # For specific endpoint
    response_model=MediaAsset       # For polymorphic responses

The discriminator field is `asset_type`:
- "image" -> ImageMediaAsset
- "video" -> VideoMediaAsset  
- "document" -> DocumentMediaAsset
"""


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def parse_media_asset(data: dict) -> MediaAsset:
    """
    Parse a dictionary into the correct MediaAsset subtype.
    
    Uses the `asset_type` discriminator to determine the model.
    
    Args:
        data: Dictionary with asset data including `asset_type`
        
    Returns:
        Appropriate MediaAsset subtype instance
        
    Raises:
        ValueError: If asset_type is missing or invalid
    """
    asset_type = data.get("asset_type")
    
    if asset_type == "image":
        return ImageMediaAsset.model_validate(data)
    elif asset_type == "video":
        return VideoMediaAsset.model_validate(data)
    elif asset_type == "document":
        return DocumentMediaAsset.model_validate(data)
    else:
        raise ValueError(f"Unknown asset_type: {asset_type}")
