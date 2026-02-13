from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from src.utils.datetime_utils import utc_now

class LeadData(BaseModel):
    """Customer lead data model."""
    name: str = Field(..., max_length=100, description="Customer name")
    email: EmailStr = Field(..., description="Customer email address")
    phone: Optional[str] = Field(None, max_length=20, description="Customer phone number")
    project_details: str = Field(..., max_length=2000, description="Detailed project description")
    room_type: Optional[str] = Field(None, max_length=100, description="Type of room")
    style: Optional[str] = Field(None, max_length=100, description="Preferred design style")

class LeadDocument(LeadData):
    """Complete lead document with metadata for Firestore."""
    uid: str = Field(..., description="User Firebase UID")
    session_id: str = Field(..., description="Chat session ID")
    created_at: datetime = Field(default_factory=utc_now, description="Timestamp")
    source: str = Field(default="chat", description="Lead source")
