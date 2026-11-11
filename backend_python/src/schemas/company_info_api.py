"""
Company info API shapes (Phase 141): the admin editor and the public read.

Golden Sync: web_client/types/company-info.ts (1:1).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.schemas.company_info import CompanyInfo


class CompanyInfoResponse(BaseModel):
    """The whole company info plus what the editor needs to save it safely."""

    etag: str
    version: int
    source: Literal["firestore", "seed"]
    updated_at: datetime | None = None
    updated_by: str | None = None
    # Set when the stored document was ignored: the seed is shown and saving replaces it.
    ignored_document: str | None = None
    info: CompanyInfo


class PutCompanyInfoBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    info: CompanyInfo
    reason: str | None = Field(default=None, max_length=500)


class CompanyInfoSaveResponse(BaseModel):
    etag: str
    version: int
    changed_parts: list[str]


class CompanyInfoHistoryItem(BaseModel):
    """One saved version (the info itself stays in Firestore)."""

    version: int
    actor_uid: str | None = None
    reason: str | None = None
    changed_parts: list[str] = Field(default_factory=list)
    created_at: datetime | None = None


class CompanyInfoHistory(BaseModel):
    items: list[CompanyInfoHistoryItem]


class PublicCompanyInfo(BaseModel):
    """GET /api/content/company-info: what the site shows (version 0 = the seed)."""

    version: int
    updated_at: datetime | None = None
    info: CompanyInfo
