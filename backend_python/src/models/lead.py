from datetime import datetime

from pydantic import BaseModel, EmailStr, Field
from src.utils.datetime_utils import utc_now


class LeadData(BaseModel):
    """Customer lead data model."""
    model_config = {"extra": "forbid"}
    name: str = Field(..., max_length=100, description="Customer name")
    email: EmailStr = Field(..., description="Customer email address")
    phone: str | None = Field(None, max_length=20, description="Customer phone number")
    project_details: str = Field(..., max_length=2000, description="Detailed project description")
    room_type: str | None = Field(None, max_length=100, description="Type of room")
    style: str | None = Field(None, max_length=100, description="Preferred design style")

class LeadDocument(LeadData):
    """Complete lead document with metadata for Firestore."""
    uid: str = Field(..., description="User Firebase UID")
    session_id: str = Field(..., description="Chat session ID")
    created_at: datetime = Field(default_factory=utc_now, description="Timestamp")
    source: str = Field(default="chat", description="Lead source")
