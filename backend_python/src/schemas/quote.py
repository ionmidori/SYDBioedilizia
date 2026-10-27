from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from src.core.money import Money
from src.schemas.room import RoomType
from src.utils.datetime_utils import utc_now

# Canonical status lifecycle — transitions enforced by src/services/quote_state.py:
# draft → pending_review → in_review → approved → sent | rejected (deleted = soft delete)
QuoteStatusType = Literal[
    "draft", "pending_review", "in_review", "approved", "sent", "rejected", "deleted"
]

# Email delivery outcome, tracked separately from the review status.
QuoteDeliveryStatusType = Literal[
    "none", "queued", "sent", "delivered", "bounced", "complained", "failed"
]

QuoteChannelType = Literal["chat", "dashboard"]

class QuoteItem(BaseModel):
    model_config = {"extra": "forbid"}
    sku: str = Field(..., description="Unique Identifier from Master Price Book")
    description: str = Field(..., description="Item description")
    unit: str = Field(..., description="Measurement unit (mq, cad, m, etc.)")
    # allow_inf_nan=False: JSON `Infinity` is a 422 here, not a failure of the money arithmetic.
    qty: float = Field(..., ge=0, allow_inf_nan=False, description="Quantity to be executed")
    unit_price: float = Field(..., ge=0, allow_inf_nan=False, description="Price per unit")
    total: Money = Field(..., ge=0, description="qty x unit_price, to the cent (src/core/money.py)")
    ai_reasoning: str | None = Field(None, description="Why the AI suggested this item")
    category: str | None = Field(None, description="Category of the work (e.g., Demolitions)")
    manual_override: bool = Field(False, description="Whether the item was manually edited by admin")
    room_id: str | None = Field(None, description="Room section of the line (see QuoteRoom); None on a quote without rooms")


class QuoteRoom(BaseModel):
    """A section of a multi-room quote: one per room, plus "Generale" for the
    project-wide lines (src/services/room_aggregation.py)."""
    model_config = {"extra": "forbid"}
    room_id: str
    room_label: str
    room_type: RoomType
    floor_mq: float | None = Field(default=None, ge=0, allow_inf_nan=False, description="Floor area from the room brief")
    walls_mq: float | None = Field(default=None, ge=0, allow_inf_nan=False, description="Wall area from the room brief")
    room_subtotal: Money = Field(default=Decimal("0.00"), ge=0, description="Sum of the room's line totals (pre-VAT)")


class QuoteFinancials(BaseModel):
    """Totals computed by `src.core.money.compute_totals` (amounts to the cent)."""
    model_config = {"extra": "forbid"}
    subtotal: Money = Field(default=Decimal("0.00"))
    vat_rate: float = Field(0.22)
    vat_amount: Money = Field(default=Decimal("0.00"))
    grand_total: Money = Field(default=Decimal("0.00"))



class QuoteRequest(BaseModel):
    """What the client asked for — shown to the admin in the quote dossier."""
    model_config = {"extra": "forbid"}
    summary: str | None = Field(default=None, description="AI summary of the requested works (Italian)")
    technical_notes: str | None = Field(default=None, description="Site notes from the project's construction details")
    address: str | None = Field(default=None, description="Site address")
    footage_sqm: float | None = Field(default=None, ge=0, description="Surface in square metres")
    budget_cap: float | None = Field(default=None, ge=0, description="Client budget cap in EUR")
    channel: QuoteChannelType | None = Field(default=None, description="Where the request started")
    session_id: str | None = Field(default=None, description="Chat session the draft was generated from")
    batch_id: str | None = Field(default=None, description="Batch the quote was submitted with")


class ClientSnapshot(BaseModel):
    """Who asked for the quote, captured when the draft is created.

    A snapshot (not a live join) so the admin inbox can list and search
    quotes without a Firebase Auth call per row. GDPR erasure clears it.
    """
    model_config = {"extra": "forbid"}
    uid: str
    display_name: str | None = Field(default=None)
    email: str | None = Field(default=None)
    phone: str | None = Field(default=None)
    is_guest: bool = False
    captured_at: datetime = Field(default_factory=utc_now)


MediaKindType = Literal["input_photo", "render", "video", "link"]


class MediaRef(BaseModel):
    """A photo, render or link attached to the request.

    Stores the Storage object path, never a signed URL: signed URLs expire,
    fresh short-lived ones are minted on read from `blob_path`.
    """
    model_config = {"extra": "forbid"}
    media_id: str = Field(..., description="projects/{pid}/files document id")
    kind: MediaKindType
    blob_path: str | None = Field(default=None, description="Object path in the app bucket")
    external_url: str | None = Field(default=None, description="Only for kind=link (never fetched server-side)")
    mime: str | None = Field(default=None)
    label: str = Field(..., description="Human label, e.g. 'Foto 1', 'Render 2'")
    source_media_id: str | None = Field(default=None, description="Photo a render was generated from")
    created_at: datetime | None = Field(default=None)


RevisionActorType = Literal["ai", "admin", "system"]

RevisionChangeType = Literal["added", "removed", "changed"]


class RevisionChange(BaseModel):
    """One line-item difference between a revision and the previous one."""
    model_config = {"extra": "forbid"}
    change: RevisionChangeType
    sku: str
    room_id: str | None = Field(default=None, description="Room section of the line (multi-room quotes)")
    before: dict[str, Any] | None = Field(default=None, description="qty/unit_price/total/description before")
    after: dict[str, Any] | None = Field(default=None, description="qty/unit_price/total/description after")


class QuoteReview(BaseModel):
    """Admin review state: who holds the lock, who approved/rejected and why."""
    model_config = {"extra": "forbid"}
    locked_by: str | None = Field(default=None, description="Admin uid holding the review lock")
    locked_at: datetime | None = Field(default=None)
    approved_by: str | None = Field(default=None)
    approved_at: datetime | None = Field(default=None)
    approved_revision: int | None = Field(default=None, description="Version frozen by the approval")
    reason: str | None = Field(default=None, description="Last reject/reopen reason")


class QuoteRevision(BaseModel):
    """Immutable snapshot at projects/{pid}/private_data/quote/revisions/{version}."""
    model_config = {"extra": "forbid"}
    version: int = Field(..., ge=1)
    items: list[QuoteItem] = Field(default_factory=list)
    rooms: list[QuoteRoom] = Field(default_factory=list)
    financials: QuoteFinancials = Field(default_factory=QuoteFinancials)  # type: ignore[arg-type]
    admin_notes: str | None = Field(default=None)
    actor_uid: str | None = Field(default=None)
    actor_kind: RevisionActorType
    reason: str | None = Field(default=None)
    diff: list[RevisionChange] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)


DeliveryRecordStatusType = Literal["queued", "sent", "delivered", "bounced", "complained", "failed"]


class DeliveryEventRecord(BaseModel):
    """A provider-reported outcome stored on the delivery (webhook)."""
    model_config = {"extra": "forbid"}
    event: str
    at: datetime
    detail: str | None = Field(default=None)


class QuoteDelivery(BaseModel):
    """projects/{pid}/private_data/quote/deliveries/{delivery_id}: one send of
    the approved PDF to one recipient (immutable recipient, mutable outcome)."""
    model_config = {"extra": "forbid"}
    delivery_id: str
    to: str
    cc: list[str] = Field(default_factory=list)
    subject: str | None = Field(default=None, description="Subject override (else the template subject)")
    message: str | None = Field(default=None, description="Optional note from the admin, added to the body")
    revision: int = Field(..., ge=1)
    pdf_blob_path: str
    status: DeliveryRecordStatusType = "queued"
    provider: str
    provider_message_id: str | None = Field(default=None)
    attempts: int = 0
    last_error: str | None = Field(default=None, description="Error type only — never the message body")
    events: list[DeliveryEventRecord] = Field(default_factory=list)
    created_by: str
    created_at: datetime
    sent_at: datetime | None = Field(default=None)
    updated_at: datetime | None = Field(default=None)


class QuoteSchema(BaseModel):
    id: str | None = None
    # Discriminator for the `private_data` collection-group query (admin inbox).
    doc_type: Literal["quote"] = "quote"
    project_id: str
    user_id: str
    # Human-readable reference, immutable once assigned (src/services/quote_numbering.py).
    quote_number: str | None = Field(default=None, description="e.g. PRV-2026-0042 — never contains personal data")
    quote_year: int | None = None
    quote_seq: int | None = None
    status: QuoteStatusType = Field("draft", description="See src/services/quote_state.py")
    delivery_status: QuoteDeliveryStatusType = "none"
    items: list[QuoteItem] = Field(default_factory=list)
    # Sections of a multi-room quote, in display order (empty: a quote without rooms).
    rooms: list[QuoteRoom] = Field(default_factory=list)
    financials: QuoteFinancials = Field(default_factory=QuoteFinancials)  # type: ignore[arg-type]
    admin_notes: str | None = None
    request: QuoteRequest | None = None
    client_snapshot: ClientSnapshot | None = None
    media: list[MediaRef] = Field(default_factory=list)
    # Lower-cased tokens (number, name, email) for the admin inbox search.
    search_keys: list[str] = Field(default_factory=list)
    review: QuoteReview | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    # Optimistic-concurrency token: bumped on every content change.
    version: int = 1
    # Written when a quote is approved (services/admin_quotes.approve + pdf render).
    # Typed here so stored approved quotes still validate under extra="forbid".
    pdf_url: str | None = None
    pdf_blob_path: str | None = None
    pdf_revision: int | None = None
    last_delivery_id: str | None = None
    sent_at: datetime | None = None
    admin_decision: str | None = None
    reviewed_by: str | None = None
    started_by: str | None = None
    delivered_at: datetime | None = None
    deleted_at: datetime | None = None

    model_config = ConfigDict(extra="forbid", from_attributes=True)
