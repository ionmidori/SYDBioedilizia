"""
Master price book — editable from the admin console (Phase 128, Fase 6.1a).

The price book is what the AI quotes with: its SKUs and prices go into the
Gemini prompt and into every draft quote. Editing it is therefore a
business-critical operation, validated strictly and versioned.

Golden Sync: web_client/types/admin-price-book.ts (1:1).
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# SKU as used in quotes and prompts: short, no spaces or exotic characters.
SKU_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._\-]{0,39}$"
MAX_ITEMS = 2000
# A Firestore document holds 1 MiB (~66 items weigh ~25 KiB). The JSON size over-estimates
# the stored size, so this limit leaves room for the other fields of the document.
MAX_BYTES = 800 * 1024


class PriceBookItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sku: str = Field(..., pattern=SKU_PATTERN)
    description: str = Field(..., min_length=1, max_length=300)
    unit: str = Field(..., min_length=1, max_length=12)
    unit_price: float = Field(..., ge=0, le=1_000_000)
    category: str = Field(..., min_length=1, max_length=60)
    subcategory: str | None = Field(default=None, max_length=80)
    vat_agevolata: bool = False
    min_qty: float | None = Field(default=None, ge=0)
    max_qty: float | None = Field(default=None, ge=0)
    tags: list[str] = Field(default_factory=list, max_length=20)
    range_min: float | None = Field(default=None, ge=0)
    range_max: float | None = Field(default=None, ge=0)

    @field_validator("description", "unit", "category", "subcategory")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, tags: list[str]) -> list[str]:
        cleaned = [t.strip() for t in tags if t and t.strip()]
        if any(len(t) > 40 for t in cleaned):
            raise ValueError("Each tag must be at most 40 characters.")
        return cleaned

    @model_validator(mode="after")
    def _ranges(self) -> PriceBookItem:
        if not self.description or not self.unit or not self.category:
            raise ValueError("description, unit and category cannot be blank.")
        if self.min_qty is not None and self.max_qty is not None and self.min_qty > self.max_qty:
            raise ValueError(f"{self.sku}: min_qty is greater than max_qty.")
        if self.range_min is not None and self.range_max is not None and self.range_min > self.range_max:
            raise ValueError(f"{self.sku}: range_min is greater than range_max.")
        return self


class PriceBookResponse(BaseModel):
    """The whole price book plus what the editor needs to save it safely."""

    etag: str
    version: int
    source: Literal["firestore", "seed"]
    item_count: int
    updated_at: datetime | None = None
    updated_by: str | None = None
    # Set when the stored document was ignored (e.g. written by another tool
    # without a version): the seed is shown and saving replaces the document.
    ignored_document: str | None = None
    items: list[PriceBookItem]


class PutPriceBookBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[PriceBookItem] = Field(..., min_length=1, max_length=MAX_ITEMS)
    reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _unique_skus(self) -> PutPriceBookBody:
        seen: set[str] = set()
        duplicated: list[str] = []
        for item in self.items:
            key = item.sku.casefold()
            if key in seen:
                duplicated.append(item.sku)
            seen.add(key)
        if duplicated:
            raise ValueError(f"Duplicate SKU: {', '.join(sorted(set(duplicated))[:10])}")
        size = len(json.dumps([i.model_dump(exclude_none=True) for i in self.items], ensure_ascii=False).encode())
        if size > MAX_BYTES:
            raise ValueError(
                f"The price book is too large to store ({size // 1024} KiB, limit {MAX_BYTES // 1024} KiB): "
                "shorten descriptions or tags."
            )
        return self


class PriceBookSaveResponse(BaseModel):
    etag: str
    version: int
    item_count: int
    added: int
    removed: int
    changed: int


class PriceBookHistoryItem(BaseModel):
    """One saved version (the items themselves stay in Firestore)."""

    version: int
    actor_uid: str | None = None
    reason: str | None = None
    item_count: int = 0
    added: int = 0
    removed: int = 0
    changed: int = 0
    created_at: datetime | None = None


class PriceBookHistory(BaseModel):
    items: list[PriceBookHistoryItem]
