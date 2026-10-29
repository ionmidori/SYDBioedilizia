"""The user's chat (Phase 139). Golden Sync: web_client/types/user-chat.ts."""
from pydantic import BaseModel, ConfigDict


class UserChatResponse(BaseModel):
    """GET /api/me/chat: the id of the signed-in user's chat."""

    model_config = ConfigDict(extra="forbid")

    chat_id: str
    # A new, empty chat was created by this call.
    created: bool
