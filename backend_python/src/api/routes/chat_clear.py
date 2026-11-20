"""Chat clear/restart API router (`POST /api/chat/{session_id}/clear`)."""
from fastapi import APIRouter, Body, Depends, Path, Request
from src.auth.jwt_handler import verify_token
from src.core.rate_limit import limiter
from src.schemas.chat_clear import ClearChatRequest, ClearChatResponse
from src.schemas.internal import UserSession
from src.services.chat_clear import clear_chat

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/{session_id}/clear", response_model=ClearChatResponse)
@limiter.limit("10/minute")
async def clear_chat_endpoint(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    session_id: str = Path(..., min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9_-]+$"),
    body: ClearChatRequest = Body(default_factory=ClearChatRequest),
    user_session: UserSession = Depends(verify_token),
) -> ClearChatResponse:
    """Clear one room or the full chat history while preserving media and quotes."""
    return await clear_chat(session_id, user_session.uid, room_id=body.room_id)
