"""Guest → account claim (Phase 138 PR-6). Golden Sync: web_client/lib/guest-claim-api.ts."""
from datetime import datetime

from pydantic import BaseModel, Field


class GuestClaimTicket(BaseModel):
    """Proof, issued to an anonymous user, that it is that user: single use, short lived."""

    ticket: str
    expires_at: datetime


class GuestClaimRequest(BaseModel):
    model_config = {"extra": "forbid"}

    ticket: str = Field(..., min_length=32, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")


class GuestClaimResult(BaseModel):
    """The guest's chats now owned by the account, most recent first."""

    session_ids: list[str]
    # The conversation the chat opens after the claim (None: nothing to open).
    open_session_id: str | None = None
