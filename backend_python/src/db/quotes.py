from datetime import datetime
from src.utils.datetime_utils import utc_now
from typing import Optional, Dict, Any, Literal
from pydantic import BaseModel, Field
import logging
from src.db.firebase_client import get_async_firestore_client
from google.cloud import firestore

logger = logging.getLogger(__name__)

from src.utils.serialization import parse_firestore_datetime

# Pydantic Models for Quote Data Structure

class LogisticsData(BaseModel):
    floor: Optional[str] = None
    elevator: Optional[bool] = None
    yearOfConstruction: Optional[str] = None
    ceilingHeight: Optional[str] = None

class ScopeOfWorkData(BaseModel):
    demolitions: Optional[bool] = None
    electrical: Optional[str] = None
    plumbing: Optional[str] = None
    fixtures: Optional[str] = None

class QuantitiesData(BaseModel):
    sqm: Optional[int] = None
    points: Optional[int] = None

class QuoteDraftData(BaseModel):
    """
    Data structure for a quote draft (mirroring legacy schema.ts/quotes.ts)
    """
    # Technical Data (The Convergence Protocol)
    logistics: Optional[LogisticsData] = None
    scopeOfWork: Optional[ScopeOfWorkData] = None
    quantities: Optional[QuantitiesData] = None
    
    # Context
    roomType: Optional[str] = None
    style: Optional[str] = None
    
    # Generated Visuals
    renderUrl: Optional[str] = None
    
    # Metadata
    clientId: str
    status: Literal['draft', 'pending_review', 'processed'] = 'draft'
    createdAt: datetime = Field(default_factory=utc_now)
    updatedAt: datetime = Field(default_factory=utc_now)
    schemaVersion: int = 1

    def to_firestore(self) -> Dict[str, Any]:
        """Convert to dictionary for Firestore storage, handling datetimes."""
        data = self.model_dump(exclude_none=True)
        return data

    @classmethod
    def from_firestore(cls, data: Dict[str, Any]) -> "QuoteDraftData":
        """Robustly create instance from Firestore dict."""
        data["createdAt"] = parse_firestore_datetime(data.get("createdAt"))
        data["updatedAt"] = parse_firestore_datetime(data.get("updatedAt"))
        return cls(**data)

async def save_quote_draft(
    user_id: str,
    image_url: Optional[str],
    ai_data: Dict[str, Any]
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
        raise Exception(f"Failed to save quote draft: {str(e)}")
