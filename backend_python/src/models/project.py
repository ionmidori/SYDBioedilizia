"""
Project entity models for Dashboard.

This module defines the Pydantic models for the "Project" concept,
which is an extension of the existing Firestore "sessions" collection.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class ProjectStatus(str, Enum):
    """Status values for a renovation project."""
    DRAFT = "draft"
    ANALYZING = "analyzing"
    QUOTED = "quoted"
    RENDERING = "rendering"
    COMPLETED = "completed"

    @classmethod
    def _missing_(cls, value):
        return cls.DRAFT


class PropertyType(str, Enum):
    """Property type classification for construction projects."""
    APARTMENT = "apartment"
    VILLA = "villa"
    COMMERCIAL = "commercial"


class Address(BaseModel):
    """Address structure for construction site location."""
    street: str = Field(..., min_length=1, max_length=200, description="Street address")
    city: str = Field(..., min_length=1, max_length=100, description="City name")
    zip: str = Field(..., min_length=1, max_length=20, description="Postal code")

    model_config = ConfigDict(from_attributes=True)


class ProjectDetails(BaseModel):
    """
    Comprehensive construction site details.
    This serves as the Single Source of Truth for AI context.
    """
    id: str = Field(..., description="Project session_id reference")
    footage_sqm: float = Field(..., gt=0, le=100000, description="Square meters of property")
    property_type: PropertyType = Field(..., description="Type of property")
    address: Address = Field(..., description="Construction site address")
    budget_cap: float = Field(..., gt=0, description="Maximum budget in EUR")
    technical_notes: Optional[str] = Field(None, max_length=1000, description="Additional technical notes")
    renovation_constraints: list[str] = Field(default_factory=list, description="List of renovation constraints")

    @field_serializer('property_type')
    def serialize_property_type(self, value: PropertyType) -> str:
        """Serialize enum to its string value for JSON."""
        return value.value

    model_config = ConfigDict(from_attributes=True)


class ProjectBase(BaseModel):
    """Base fields editable by user."""
    title: str = Field(default="Nuovo Progetto", max_length=100, description="Project display name")


class ProjectCreate(ProjectBase):
    """Request body for creating a new project."""
    pass


class ProjectUpdate(BaseModel):
    """Request body for updating project metadata."""
    title: Optional[str] = Field(None, max_length=100)
    status: Optional[ProjectStatus] = None
    thumbnail_url: Optional[str] = None
    original_image_url: Optional[str] = None


class ProjectDocument(ProjectBase):
    """
    Full project document as stored in Firestore.
    Maps to the `sessions` collection schema.
    """
    session_id: str = Field(..., description="Firestore document ID")
    user_id: str = Field(..., description="Owner Firebase UID or guest_* prefix")
    status: ProjectStatus = Field(default=ProjectStatus.DRAFT)
    thumbnail_url: Optional[str] = Field(None, description="First uploaded image URL")
    original_image_url: Optional[str] = Field(None, description="Source image URL for transformation")
    message_count: int = Field(default=0)
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last activity timestamp")
    construction_details: Optional[ProjectDetails] = Field(None, description="Construction site details")

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


class ProjectListItem(BaseModel):
    """
    Lightweight project model for dashboard grid.
    Only includes fields needed for the list view.
    """
    session_id: str
    title: str
    status: ProjectStatus
    thumbnail_url: Optional[str] = None
    original_image_url: Optional[str] = None
    updated_at: datetime
    message_count: int = 0

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
