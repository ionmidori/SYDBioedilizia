"""
Room API Routes — Multi-room project management + analysis triggers.

Security: All endpoints require JWT authentication (Depends(verify_token)).
          Project ownership is verified before any mutation.

Endpoints:
  POST   /quote/{project_id}/rooms                    — Add room to project
  GET    /quote/{project_id}/rooms                    — List rooms + analysis status
  GET    /quote/{project_id}/rooms/{room_id}          — Room detail with items
  DELETE /quote/{project_id}/rooms/{room_id}          — Remove room (idempotent)
  POST   /quote/{project_id}/rooms/{room_id}/analyze  — Trigger single room analysis
  POST   /quote/{project_id}/aggregate                — Run cross-room aggregation

Storage: projects/{project_id}/rooms/{room_id}
"""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field

from src.auth.jwt_handler import verify_token
from src.core.exceptions import RoomNotFoundError
from src.db.firebase_client import get_async_firestore_client
from src.schemas.internal import UserSession
from src.schemas.quote import RoomQuote, RoomType
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/quote", tags=["Rooms"])

_PROJECT_ID = Path(
    ...,
    min_length=1,
    max_length=200,
    description="Project identifier",
    examples=["proj-abc123"],
)

_ROOM_ID = Path(
    ...,
    min_length=1,
    max_length=100,
    description="Room identifier (UUID)",
    examples=["550e8400-e29b-41d4-a716-446655440000"],
)


# ── Request/Response Models ──────────────────────────────────────────────────

class AddRoomRequest(BaseModel):
    """Request body for adding a room to a project."""
    model_config = {"extra": "forbid"}
    room_label: str = Field(..., min_length=1, max_length=100, description="Human name: 'Bagno Principale'")
    room_type: RoomType = Field(..., description="Room type classification")
    media_urls: list[str] = Field(default_factory=list, description="Firebase Storage URLs for room photos")


class AddRoomResponse(BaseModel):
    room_id: str
    room_label: str
    room_type: RoomType
    status: str = "created"


class RoomListResponse(BaseModel):
    rooms: list[RoomQuote]
    count: int


class AggregateResponse(BaseModel):
    status: str
    items_count: int
    rooms_count: int
    subtotal: float
    grand_total: float
    savings: float


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _verify_project_ownership(project_id: str, user: UserSession) -> None:
    """Verify the caller owns the project (or is admin)."""
    if user.claims.get("role") == "admin":
        return
    db = get_async_firestore_client()
    doc = await db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Project not found.")
    data = doc.to_dict() or {}
    if data.get("userId") != user.uid:
        raise HTTPException(status_code=403, detail="Not authorized for this project.")


# ── POST /quote/{project_id}/rooms ───────────────────────────────────────────

@router.post(
    "/{project_id}/rooms",
    response_model=AddRoomResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_room(
    body: AddRoomRequest,
    project_id: str = _PROJECT_ID,
    user: UserSession = Depends(verify_token),
):
    """Add a room to a project for multi-room analysis."""
    await _verify_project_ownership(project_id, user)

    room_id = str(uuid.uuid4())
    room_data = {
        "room_id": room_id,
        "room_label": body.room_label,
        "room_type": body.room_type,
        "media_urls": body.media_urls,
        "items": [],
        "room_subtotal": 0.0,
        "completeness_score": 0.0,
        "missing_info": [],
        "created_at": utc_now().isoformat(),
        "analyzed_at": None,
    }

    db = get_async_firestore_client()
    await (
        db.collection("projects")
        .document(project_id)
        .collection("rooms")
        .document(room_id)
        .set(room_data)
    )

    logger.info(
        "[RoomRoutes] Room added.",
        extra={"project_id": project_id, "room_id": room_id, "room_type": body.room_type},
    )

    return AddRoomResponse(
        room_id=room_id,
        room_label=body.room_label,
        room_type=body.room_type,
    )


# ── GET /quote/{project_id}/rooms ────────────────────────────────────────────

@router.get("/{project_id}/rooms", response_model=RoomListResponse)
async def list_rooms(
    project_id: str = _PROJECT_ID,
    user: UserSession = Depends(verify_token),
):
    """List all rooms for a project with their analysis status."""
    await _verify_project_ownership(project_id, user)

    db = get_async_firestore_client()
    rooms_ref = db.collection("projects").document(project_id).collection("rooms")
    docs = rooms_ref.stream()

    rooms: list[RoomQuote] = []
    async for doc in docs:
        data = doc.to_dict()
        try:
            room = RoomQuote(**data)
            rooms.append(room)
        except Exception as exc:
            logger.warning(
                "[RoomRoutes] Skipping malformed room doc.",
                extra={"room_id": doc.id, "error": str(exc)},
            )

    return RoomListResponse(rooms=rooms, count=len(rooms))


# ── GET /quote/{project_id}/rooms/{room_id} ──────────────────────────────────

@router.get("/{project_id}/rooms/{room_id}", response_model=RoomQuote)
async def get_room(
    project_id: str = _PROJECT_ID,
    room_id: str = _ROOM_ID,
    user: UserSession = Depends(verify_token),
):
    """Get detailed room data including items and measurements."""
    await _verify_project_ownership(project_id, user)

    db = get_async_firestore_client()
    doc = await (
        db.collection("projects")
        .document(project_id)
        .collection("rooms")
        .document(room_id)
        .get()
    )

    if not doc.exists:
        raise RoomNotFoundError(project_id, room_id)

    return RoomQuote(**doc.to_dict())


# ── DELETE /quote/{project_id}/rooms/{room_id} ───────────────────────────────

@router.delete(
    "/{project_id}/rooms/{room_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_room(
    project_id: str = _PROJECT_ID,
    room_id: str = _ROOM_ID,
    user: UserSession = Depends(verify_token),
):
    """Remove a room from the project (idempotent)."""
    await _verify_project_ownership(project_id, user)

    db = get_async_firestore_client()
    await (
        db.collection("projects")
        .document(project_id)
        .collection("rooms")
        .document(room_id)
        .delete()
    )

    logger.info(
        "[RoomRoutes] Room deleted.",
        extra={"project_id": project_id, "room_id": room_id},
    )


# ── POST /quote/{project_id}/rooms/{room_id}/analyze ────────────────────────

@router.post("/{project_id}/rooms/{room_id}/analyze", response_model=RoomQuote)
async def analyze_room(
    project_id: str = _PROJECT_ID,
    room_id: str = _ROOM_ID,
    user: UserSession = Depends(verify_token),
):
    """Trigger analysis for a single room. Updates the room document with results."""
    await _verify_project_ownership(project_id, user)

    db = get_async_firestore_client()
    room_doc = await (
        db.collection("projects")
        .document(project_id)
        .collection("rooms")
        .document(room_id)
        .get()
    )

    if not room_doc.exists:
        raise RoomNotFoundError(project_id, room_id)

    room_data = room_doc.to_dict()

    # Load chat history for context
    from src.repositories.conversation_repository import ConversationRepository
    repo = ConversationRepository()
    chat_history = await repo.get_context(project_id, limit=40)

    # Run analysis
    from src.services.room_analysis_service import get_room_analysis_service
    service = get_room_analysis_service()
    room_quote = await service.analyze_room(
        project_id=project_id,
        user_id=user.uid,
        room_id=room_id,
        room_label=room_data.get("room_label", "Stanza"),
        room_type=room_data.get("room_type", "altro"),
        media_urls=room_data.get("media_urls", []),
        chat_history=chat_history,
    )

    # Persist results back to Firestore
    await (
        db.collection("projects")
        .document(project_id)
        .collection("rooms")
        .document(room_id)
        .set(room_quote.model_dump(exclude_none=True))
    )

    return room_quote


# ── POST /quote/{project_id}/aggregate ───────────────────────────────────────

@router.post("/{project_id}/aggregate", response_model=AggregateResponse)
async def aggregate_rooms(
    project_id: str = _PROJECT_ID,
    user: UserSession = Depends(verify_token),
):
    """Run cross-room aggregation on all analyzed rooms. Produces unified quote."""
    await _verify_project_ownership(project_id, user)

    db = get_async_firestore_client()
    rooms_ref = db.collection("projects").document(project_id).collection("rooms")
    docs = rooms_ref.stream()

    rooms: list[dict] = []
    async for doc in docs:
        data = doc.to_dict()
        if data.get("analyzed_at"):
            rooms.append(data)

    if not rooms:
        raise HTTPException(
            status_code=400,
            detail="No analyzed rooms found. Run room analysis first.",
        )

    # Load chat history
    from src.repositories.conversation_repository import ConversationRepository
    repo = ConversationRepository()
    chat_history = await repo.get_context(project_id, limit=40)

    # Build room specs for the service
    room_specs = [
        {
            "room_id": r["room_id"],
            "room_label": r.get("room_label", "Stanza"),
            "room_type": r.get("room_type", "altro"),
            "media_urls": r.get("media_urls", []),
        }
        for r in rooms
    ]

    from src.services.room_analysis_service import get_room_analysis_service
    service = get_room_analysis_service()
    quote = await service.analyze_and_aggregate(
        project_id=project_id,
        user_id=user.uid,
        rooms=room_specs,
        chat_history=chat_history,
    )

    if not quote:
        raise HTTPException(
            status_code=500,
            detail="Aggregation failed — no rooms could be analyzed.",
        )

    # Save unified quote
    quote_ref = (
        db.collection("projects")
        .document(project_id)
        .collection("private_data")
        .document("quote")
    )
    await quote_ref.set(quote.model_dump(exclude_none=True))

    total_savings = sum(a.savings for a in quote.aggregation_adjustments)

    logger.info(
        "[RoomRoutes] Aggregation complete.",
        extra={
            "project_id": project_id,
            "rooms": len(quote.rooms),
            "items": len(quote.items),
            "savings": total_savings,
        },
    )

    return AggregateResponse(
        status="aggregated",
        items_count=len(quote.items),
        rooms_count=len(quote.rooms),
        subtotal=quote.financials.subtotal,
        grand_total=quote.financials.grand_total,
        savings=total_savings,
    )
