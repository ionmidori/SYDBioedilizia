from typing import Literal, Optional
from pydantic import BaseModel, Field, HttpUrl

class MediaAttachment(BaseModel):
    """
    Structured representation of a media file attached to a message.
    Used to decouple media metadata from message text content.
    """
    url: str
    media_type: Literal['image', 'video', 'document'] = 'image'
    mime_type: str = "image/jpeg"
    file_uri: Optional[str] = None # For internal Gemini File API refs
    width: Optional[int] = None
    height: Optional[int] = None
    
    def to_firestore(self) -> dict:
        return self.model_dump(exclude_none=True)
