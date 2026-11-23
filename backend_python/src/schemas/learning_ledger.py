"""Learning ledger entry (Phase 140 step 2): how the technician corrected an AI draft.

Stored at `learning_ledger/{random_id}` with no quote or technician identifier.
Server-only: no API reads it, so there is no TypeScript twin. Recording only; nothing
uses the entries automatically yet.

The entry is anonymous and outlives the client's account: never a `quote_number`,
technician UID (`approved_by`), project id (for a guest it is the chat session id,
an access token), client data, the site address, the admin notes, a room name
(the client picks it), `client_request` manual work, `unmapped_work_requests`, or
the lines' AI reasoning (it may quote room names).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.core.money import Money
from src.schemas.quote import ManualWorkItem, QuoteAiWarning, QuoteItem, RevisionChange, RevisionRoomSpec
from src.schemas.room import RoomType


class LedgerRoom(BaseModel):
    """A quoted room without its label."""
    model_config = ConfigDict(extra="forbid")

    room_id: str
    room_type: RoomType
    floor_mq: float | None = None
    walls_mq: float | None = None
    # The client cleared the room from the chat while the team had the quote (D8).
    archived_by_client: bool = False


class LearningLedgerEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    approved_version: int = Field(..., ge=1)
    ai_version: int = Field(..., ge=1, description="Last AI revision up to the approved version")
    approved_at: datetime
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

    @field_validator("manual_work")
    @classmethod
    def _without_client_requests_and_room_labels(cls, entries: list[ManualWorkItem]) -> list[ManualWorkItem]:
        # Client requests carry client free text; room_label may carry personal data.
        return [
            entry.model_copy(update={"room_label": None})
            for entry in entries
            if entry.origin != "client_request"
        ]

    @field_validator("ai_warnings")
    @classmethod
    def _without_warning_room_labels(cls, entries: list[QuoteAiWarning]) -> list[QuoteAiWarning]:
        # The room name is the client's choice and may carry personal data.
        return [entry.model_copy(update={"room_label": None}) for entry in entries]

    @field_validator("specs")
    @classmethod
    def _without_unmapped_work_requests(cls, specs: list[RevisionRoomSpec]) -> list[RevisionRoomSpec]:
        # Unmapped work requests preserve client free text verbatim.
        return [
            s.model_copy(update={"spec": s.spec.model_copy(update={"unmapped_work_requests": []})})
            for s in specs
        ]
