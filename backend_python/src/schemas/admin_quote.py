"""
Admin quote review API contracts (/api/admin/quotes) — Phase 128 PR 3.1.

Golden Sync: web_client/types/admin-quote.ts mirrors every model here.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from src.core.money import Money
from src.schemas.quote import (
    DeliveryRecordStatusType,
    MediaRef,
    QuoteDeliveryStatusType,
    QuoteItem,
    QuoteSchema,
    QuoteStatusType,
)


class AdminMe(BaseModel):
    uid: str
    email: str | None = None
    role: str
    mfa: bool


class AdminQuoteListItem(BaseModel):
    project_id: str
    quote_number: str | None = None
    client_display_name: str | None = None
    client_email: str | None = None
    client_is_guest: bool = False
    status: QuoteStatusType
    delivery_status: QuoteDeliveryStatusType = "none"
    grand_total: Money = Decimal("0.00")
    item_count: int = 0
    channel: str | None = None
    summary: str = ""
    thumbnail_media_id: str | None = None
    locked_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AdminQuoteList(BaseModel):
    items: list[AdminQuoteListItem]
    next_cursor: str | None = None


class DossierMedia(MediaRef):
    """MediaRef plus a short-lived inline URL (None if it could not be signed)."""
    url: str | None = None


class ClientLive(BaseModel):
    """Current Firebase Auth / profile data, to spot changes since the snapshot."""
    display_name: str | None = None
    email: str | None = None
    phone: str | None = None


class RevisionSummary(BaseModel):
    version: int
    actor_kind: str
    actor_uid: str | None = None
    reason: str | None = None
    created_at: datetime | None = None
    grand_total: Money | None = None
    change_count: int = 0


class DeliverySummary(BaseModel):
    """One send of the quote, newest first in the dossier."""
    delivery_id: str
    to: str
    cc: list[str] = Field(default_factory=list)
    revision: int
    status: DeliveryRecordStatusType
    provider: str
    attempts: int = 0
    last_error: str | None = None
    created_by: str
    created_at: datetime | None = None
    sent_at: datetime | None = None
    last_event: str | None = None
    last_event_at: datetime | None = None


class QuoteDossier(BaseModel):
    project_id: str
    project_name: str | None = None
    etag: str
    quote: QuoteSchema
    client_live: ClientLive | None = None
    client_profile_changed: bool = False
    media: list[DossierMedia] = Field(default_factory=list)
    revisions: list[RevisionSummary] = Field(default_factory=list)
    deliveries: list[DeliverySummary] = Field(default_factory=list)


class EditQuoteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[QuoteItem] | None = Field(default=None, max_length=200)
    admin_notes: str | None = Field(default=None, max_length=4000)
    vat_rate: float | None = Field(default=None, ge=0, le=0.5)
    reason: str | None = Field(default=None, max_length=500)


class ReasonBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(..., min_length=3, max_length=1000)


class QuoteWriteResponse(BaseModel):
    project_id: str
    status: QuoteStatusType
    version: int
    quote_number: str | None = None
    etag: str
    # Approval only: PDF of the frozen version (15-minute preview link).
    pdf_ready: bool | None = None
    pdf_preview_url: str | None = None


class MediaUrlResponse(BaseModel):
    url: str
    filename: str = ""
    expires_in_seconds: int = 900


class SendDefaults(BaseModel):
    """What the Send dialog pre-fills: the admin can change every field."""
    to: str | None = None
    to_source: str = Field(..., description="snapshot | profile | none")
    subject: str
    body_preview: str
    attachment_name: str
    revision: int
    pdf_ready: bool


class SendQuoteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    to: EmailStr
    cc: list[EmailStr] = Field(default_factory=list, max_length=3)
    subject: str | None = Field(default=None, min_length=3, max_length=200)
    message: str | None = Field(default=None, max_length=2000)


class SendQuoteResponse(BaseModel):
    project_id: str
    delivery_id: str
    status: QuoteStatusType
    delivery_status: DeliveryRecordStatusType
    quote_number: str | None = None
    duplicate: bool = Field(False, description="True when the Idempotency-Key was already used")
