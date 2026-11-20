"""Chat clear/restart schemas (`POST /api/chat/{session_id}/clear`).

**Golden Sync**: mirrored by the zod schemas in `web_client/types/chat-clear.ts`.
"""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.schemas.room import RoomId

ClearChatMode = Literal["soft_archive", "hard_delete"]


class ClearChatRequest(BaseModel):
    """Body of `POST /api/chat/{session_id}/clear`."""

    model_config = ConfigDict(extra="forbid")

    room_id: RoomId | None = None


class ClearChatResponse(BaseModel):
    """Response of `POST /api/chat/{session_id}/clear`."""

    model_config = ConfigDict(extra="forbid")

    mode: ClearChatMode
    room_id: RoomId | None
    affected_count: int = Field(ge=0)
    rooms_reset: int = Field(ge=0)
