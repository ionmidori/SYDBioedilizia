from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from src.utils.datetime_utils import utc_now

# Canonical status lifecycle: draft → pending_review → approved → sent | rejected
QuoteStatusType = Literal["draft", "pending_review", "approved", "sent", "rejected"]

class QuoteItem(BaseModel):
    sku: str = Field(..., description="Unique Identifier from Master Price Book")
    description: str = Field(..., description="Item description")
    unit: str = Field(..., description="Measurement unit (mq, cad, m, etc.)")
    qty: float = Field(..., gt=0, description="Quantity to be executed")
    unit_price: float = Field(..., ge=0, description="Price per unit")
    total: float = Field(..., ge=0, description="Total price for the item (qty * unit_price)")
    ai_reasoning: Optional[str] = Field(None, description="Why the AI suggested this item")
    category: Optional[str] = Field(None, description="Category of the work (e.g., Demolitions)")
    manual_override: bool = Field(False, description="Whether the item was manually edited by admin")

class QuoteFinancials(BaseModel):
    subtotal: float = Field(0.0)
    vat_rate: float = Field(0.22)
    vat_amount: float = Field(0.0)
    grand_total: float = Field(0.0)

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

    model_config = ConfigDict(from_attributes=True)
