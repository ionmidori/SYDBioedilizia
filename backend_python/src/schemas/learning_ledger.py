"""Learning ledger entry (Phase 140 step 2): how the technician corrected an AI draft.

One entry per approved quote version, at `learning_ledger/{quote_number}_r{version}`.
Server-only: no API reads it, so there is no TypeScript twin. Recording only; nothing
uses the entries automatically yet.

The entry carries no client data and outlives the client's account: never a project
id (for a guest it is the chat session id, an access token), client data, the site
address, the admin notes, a room name (the client picks it) or the lines' AI reasoning
(it may quote room names). It is pseudonymous, not anonymous: while the quote document
exists, `quote_number` leads back to it.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.core.money import Money
from src.schemas.quote import ManualWorkItem, QuoteAiWarning, QuoteItem, RevisionChange, RevisionRoomSpec
from src.schemas.room import RoomType

_Labelled = TypeVar("_Labelled", ManualWorkItem, QuoteAiWarning)


class LedgerRoom(BaseModel):
    """A quoted room without its label."""
    model_config = ConfigDict(extra="forbid")

    room_id: str
    room_type: RoomType
    floor_mq: float | None = None
    walls_mq: float | None = None


class LearningLedgerEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    quote_number: str
    approved_version: int = Field(..., ge=1)
    ai_version: int = Field(..., ge=1, description="Last AI revision up to the approved version")
    approved_at: datetime
    approved_by: str = Field(..., description="Uid of the technician who approved")
    ai_created_at: datetime
    rooms: list[LedgerRoom] = Field(default_factory=list)
    specs: list[RevisionRoomSpec] = Field(default_factory=list, description="What the AI lines were expanded from")
    ai_items: list[QuoteItem]
    approved_items: list[QuoteItem]
    changes: list[RevisionChange] = Field(..., description="Net diff from the AI lines to the approved ones")
    manual_work: list[ManualWorkItem] = Field(default_factory=list)
    ai_warnings: list[QuoteAiWarning] = Field(default_factory=list)
    ai_subtotal: Money
    approved_subtotal: Money

    @field_validator("ai_items", "approved_items")
    @classmethod
    def _without_reasoning(cls, items: list[QuoteItem]) -> list[QuoteItem]:
        # A project-wide line lists the client's room names in its reasoning.
        return [item.model_copy(update={"ai_reasoning": None}) for item in items]

    @field_validator("manual_work", "ai_warnings")
    @classmethod
    def _without_room_labels(cls, entries: list[_Labelled]) -> list[_Labelled]:
        # The room name is the client's choice and may carry personal data.
        return [entry.model_copy(update={"room_label": None}) for entry in entries]
