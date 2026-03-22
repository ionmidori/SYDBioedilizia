from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from src.utils.datetime_utils import utc_now

# Canonical status lifecycle: draft → pending_review → approved → sent | rejected
QuoteStatusType = Literal["draft", "pending_review", "approved", "sent", "rejected"]

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


class QuoteFinancials(BaseModel):
    model_config = {"extra": "forbid"}
    subtotal: float = Field(0.0)
    vat_rate: float = Field(0.22)
    vat_amount: float = Field(0.0)
    grand_total: float = Field(0.0)



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
    financials: QuoteFinancials = Field(default_factory=QuoteFinancials)  # type: ignore[arg-type]
    admin_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    version: int = 1

    model_config = ConfigDict(extra="forbid", from_attributes=True)


# ── Multi-Project Batch Submission ────────────────────────────────────────────

BatchStatusType = Literal["draft", "submitted", "partially_approved", "approved", "rejected"]


class BatchProject(BaseModel):
    """Snapshot of a single project's quote within a batch submission."""
    model_config = {"extra": "forbid"}
    project_id: str = Field(..., description="Firestore project document ID")
    project_name: str = Field(..., description="Human label (e.g., 'Bagno Via Roma')")
    status: QuoteStatusType = Field("draft", description="Per-project approval status within the batch")
    item_count: int = Field(0, ge=0, description="Number of quote items")
    subtotal: float = Field(0.0, ge=0, description="Project quote subtotal (pre-VAT)")
    admin_notes: Optional[str] = Field(None, description="Per-project admin notes")


class QuoteBatch(BaseModel):
    """Groups multiple project quotes for a single batch submission to admin."""
    model_config = ConfigDict(extra="forbid")
    id: Optional[str] = Field(None, description="Firestore document ID (auto-generated)")
    user_id: str = Field(..., description="Authenticated user UID")
    status: BatchStatusType = Field("draft", description="Overall batch lifecycle status")
    projects: list[BatchProject] = Field(default_factory=list, description="Individual project snapshots")
    total_projects: int = Field(0, ge=0, description="Number of projects in batch")
    batch_subtotal: float = Field(0.0, ge=0, description="Sum of all project subtotals")
    batch_grand_total: float = Field(0.0, ge=0, description="Batch total with VAT")
    submitted_at: Optional[datetime] = Field(None, description="When batch was submitted to admin")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    # Cross-project aggregation preview (advisory, not mutating)
    potential_savings: float = Field(0.0, ge=0, description="Total potential savings from cross-project optimization")
    aggregation_preview: list[AggregationAdjustment] = Field(
        default_factory=list, description="Advisory cross-project optimizations (read-only preview)"
    )
