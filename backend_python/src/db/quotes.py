"""
DEPRECATED: Legacy quote storage module (v1 schema → 'quotes/' collection).

New code should use:
  - src/schemas/quote.py (QuoteSchema, QuoteItem, QuoteFinancials)
  - src/tools/quote_tools.py → projects/{pid}/private_data/quote
  - src/api/routes/quote_routes.py (CRUD + HITL endpoints)

Kept for backward compatibility with existing production data.
"""
import logging
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field
from src.db.firebase_client import get_async_firestore_client
from src.utils.datetime_utils import utc_now
from src.utils.serialization import parse_firestore_datetime

logger = logging.getLogger(__name__)

# Pydantic Models for Quote Data Structure (LEGACY v1 — see schemas/quote.py for v2)

class LogisticsData(BaseModel):
    model_config = {"extra": "forbid"}
    floor: str | None = None
    elevator: bool | None = None
    yearOfConstruction: str | None = None
    ceilingHeight: str | None = None

class ScopeOfWorkData(BaseModel):
    model_config = {"extra": "forbid"}
    demolitions: bool | None = None
    electrical: str | None = None
    plumbing: str | None = None
    fixtures: str | None = None

class QuantitiesData(BaseModel):
    model_config = {"extra": "forbid"}
    sqm: int | None = None
    points: int | None = None

class QuoteDraftData(BaseModel):
    """
    Data structure for a quote draft (mirroring legacy schema.ts/quotes.ts)
    """
    model_config = {"extra": "forbid"}
    # Technical Data (The Convergence Protocol)
    logistics: LogisticsData | None = None
    scopeOfWork: ScopeOfWorkData | None = None
    quantities: QuantitiesData | None = None

    # Context
    roomType: str | None = None
    style: str | None = None

    # Generated Visuals
    renderUrl: str | None = None

    # Metadata
    clientId: str
    status: Literal['draft', 'pending_review', 'processed'] = 'draft'
    createdAt: datetime = Field(default_factory=utc_now)
    updatedAt: datetime = Field(default_factory=utc_now)
    schemaVersion: int = 1

    def to_firestore(self) -> dict[str, Any]:
        """Convert to dictionary for Firestore storage, handling datetimes."""
        data = self.model_dump(exclude_none=True)
        return data

    @classmethod
    def from_firestore(cls, data: dict[str, Any]) -> "QuoteDraftData":
        """Robustly create instance from Firestore dict."""
        data["createdAt"] = parse_firestore_datetime(data.get("createdAt"))
        data["updatedAt"] = parse_firestore_datetime(data.get("updatedAt"))
        return cls(**data)

async def save_quote_draft(
    user_id: str,
    image_url: str | None,
    ai_data: dict[str, Any]
) -> str:
    """
    Saves a new quote draft to the 'quotes' collection in Firestore.

    Args:
        user_id: The ID of the user (or session ID if anonymous)
        image_url: Optional URL of the reference image or generated render
        ai_data: The structured data collected by the Technical Surveyor (Mode B)

    Returns:
        The ID of the created document
    """
    try:
        db = get_async_firestore_client()

        # Prepare data structure from loose AI dictionary
        quote_model = QuoteDraftData(
            clientId=user_id,
            renderUrl=image_url or ai_data.get('renderUrl'),
            logistics=ai_data.get('logistics'),
            scopeOfWork=ai_data.get('scopeOfWork'),
            quantities=ai_data.get('quantities'),
            roomType=ai_data.get('roomType'),
            style=ai_data.get('style'),
            status='draft'
        )

        # Add to 'quotes' collection (Async)
        collection_ref = db.collection('quotes')
        _, doc_ref = await collection_ref.add(quote_model.to_firestore())

        logger.info(f"[QuoteSystem] Draft saved with ID: {doc_ref.id} for User: {user_id}")
        return doc_ref.id

    except Exception as e:
        logger.error(f"[QuoteSystem] Error saving quote draft: {e}")
        raise Exception(f"Failed to save quote draft: {str(e)}") from e
