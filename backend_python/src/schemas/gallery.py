from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class GalleryAssetMetadata(BaseModel):
    size: Optional[int] = None
    uploadedBy: str
    projectId: str
    projectName: str

class GalleryAsset(BaseModel):
    id: str
    type: str # 'image' | 'video' | 'quote' | 'unknown'
    url: str
    thumbnail: Optional[str] = None
    title: str
    createdAt: datetime
    timestamp: datetime
    metadata: GalleryAssetMetadata

class GalleryResponse(BaseModel):
    assets: List[GalleryAsset]
    hasMore: bool
    lastVisibleId: Optional[str] = None
