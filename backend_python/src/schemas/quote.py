from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from src.utils.datetime_utils import utc_now

# Canonical status lifecycle: draft → pending_review → approved → sent | rejected
QuoteStatusType = Literal["draft", "pending_review", "approved", "sent", "rejected"]

# Room types aligned with Italian residential renovation
RoomType = Literal[
    "bagno", "cucina", "soggiorno", "camera",
    "corridoio", "ingresso", "terrazzo", "altro",
]


class QuoteItem(BaseModel):
    model_config = {"extra": "forbid"}
    sku: str = Field(..., description="Unique Identifier from Master Price Book")
    description: str = Field(..., description="Item description")
    unit: str = Field(..., description="Measurement unit (mq, cad, m, etc.)")
    qty: float = Field(..., ge=0, description="Quantity to be executed")
    unit_price: float = Field(..., ge=0, description="Price per unit")
    total: float = Field(..., ge=0, description="Total price for the item (qty * unit_price)")
    ai_reasoning: Optional[str] = Field(None, description="Why the AI suggested this item")
    category: Optional[str] = Field(None, description="Category of the work (e.g., Demolitions)")
    manual_override: bool = Field(False, description="Whether the item was manually edited by admin")
    room_id: Optional[str] = Field(None, description="Room this item belongs to (multi-room flow)")


class QuoteFinancials(BaseModel):
    model_config = {"extra": "forbid"}
    subtotal: float = Field(0.0)
    vat_rate: float = Field(0.22)
    vat_amount: float = Field(0.0)
    grand_total: float = Field(0.0)


# ── Multi-Room Models ────────────────────────────────────────────────────────

class RoomQuote(BaseModel):
    """Per-room breakdown within a multi-room project quote."""
    model_config = {"extra": "forbid"}
    room_id: str = Field(..., description="Stable UUID for this room")
    room_label: str = Field(..., description="Human name: 'Bagno Principale', 'Cucina'")
    room_type: RoomType = Field(..., description="Room type classification")
    floor_mq: Optional[float] = Field(None, ge=0, description="Measured floor area")
    walls_mq: Optional[float] = Field(None, ge=0, description="Net wall area")
    items: list[QuoteItem] = Field(default_factory=list)
    room_subtotal: float = Field(0.0, description="Sum of item totals for this room (pre-aggregation)")
    completeness_score: float = Field(1.0, ge=0.0, le=1.0)
    missing_info: list[str] = Field(default_factory=list)
    analyzed_at: Optional[datetime] = None
    media_urls: list[str] = Field(default_factory=list, description="Photos used for this room's analysis")
    version: int = 1


class AggregationAdjustment(BaseModel):
    """A cross-room optimization applied during aggregation."""
    model_config = {"extra": "forbid"}
    adjustment_type: Literal[
        "dedup_singleton",
        "merge_quantities",
        "volume_discount",
        "shared_overhead",
    ] = Field(..., description="Type of cross-room optimization")
    description: str = Field(..., description="Human-readable Italian explanation")
    sku: Optional[str] = Field(None, description="SKU affected (if applicable)")
    original_total: float = Field(..., description="Total before adjustment")
    adjusted_total: float = Field(..., description="Total after adjustment")
    savings: float = Field(..., ge=0, description="Amount saved")
    affected_rooms: list[str] = Field(default_factory=list, description="room_ids involved")


class QuoteSchema(BaseModel):
    id: Optional[str] = None
    project_id: str
    user_id: str
    status: QuoteStatusType = Field("draft", description="Status lifecycle: draft → pending_review → approved → sent | rejected")
    items: list[QuoteItem] = Field(default_factory=list)
    financials: QuoteFinancials = Field(default_factory=QuoteFinancials)
    admin_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    version: int = 1
    # Multi-room fields (backward-compatible: defaults to empty)
    rooms: list[RoomQuote] = Field(default_factory=list, description="Per-room breakdowns. Empty for single-room quotes.")
    aggregation_adjustments: list[AggregationAdjustment] = Field(default_factory=list, description="Cross-room optimizations applied")
    aggregated_subtotal: Optional[float] = Field(None, description="Post-aggregation subtotal (None = use financials.subtotal)")

    model_config = ConfigDict(extra="forbid", from_attributes=True)
