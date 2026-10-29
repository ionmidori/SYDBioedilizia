"""
The signed-in user (Phase 139: one chat per user).

- GET /api/me/chat — the user's chat id, assigned by the backend on first call

See src/services/user_chat/service.py.
"""
from fastapi import APIRouter, Depends, Request
from src.auth.jwt_handler import verify_token
from src.core.exceptions import UserChatSignInRequired
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.schemas.internal import UserSession
from src.schemas.user_chat import UserChatResponse
from src.services.user_chat.service import resolve_user_chat

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("/chat", response_model=UserChatResponse, summary="The signed-in user's chat")
@limiter.limit("60/minute")
async def get_my_chat(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    user_session: UserSession = Depends(verify_token),
) -> UserChatResponse:
    # Guests keep the chat id their client chose: at login the guest claim
    # brings their chat into the account's.
    if user_session.is_guest:
        raise UserChatSignInRequired()
    chat = await resolve_user_chat(get_async_firestore_client(), user_session.uid)
    return UserChatResponse(chat_id=chat.chat_id, created=chat.created)
