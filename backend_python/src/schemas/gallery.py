from datetime import datetime

from pydantic import BaseModel


class GalleryAssetMetadata(BaseModel):
    model_config = {"extra": "forbid"}
    size: int | None = None
    uploadedBy: str
    projectId: str
    projectName: str

class GalleryAsset(BaseModel):
    model_config = {"extra": "forbid"}
    id: str
    type: str # 'image' | 'video' | 'quote' | 'unknown'
    url: str
    thumbnail: str | None = None
    title: str
    createdAt: datetime
    timestamp: datetime
    metadata: GalleryAssetMetadata

class GalleryResponse(BaseModel):
    model_config = {"extra": "ignore"}
    assets: list[GalleryAsset]
    hasMore: bool
    lastVisibleId: str | None = None
