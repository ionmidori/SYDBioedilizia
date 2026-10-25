"""Rooms of a project: `projects/{project_id}/rooms/{room_id}` (Phase 138).

One chat covers the whole home; each room is a "scheda stanza" (structured
memory) and everything about it — files, messages, quote items, renders —
carries its `room_id`. Documents are stored as `RoomSchema.model_dump()`
(snake_case, like the API), written only by the backend.

**Golden Sync**: mirrored by the zod schemas in `web_client/types/room.ts`.
"""
from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_serializer, model_validator

# Same values as the room picker in the chat gallery (`ROOM_TYPES` in web_client/types/room.ts).
RoomType = Literal["cucina", "soggiorno", "camera", "bagno", "corridoio", "altro"]
ROOM_TYPES: tuple[RoomType, ...] = ("cucina", "soggiorno", "camera", "bagno", "corridoio", "altro")

# Room that collects the files of a project created before rooms existed, and
# the project-wide lines of a multi-room quote.
DEFAULT_ROOM_ID = "generale"
DEFAULT_ROOM_LABEL = "Generale"

# Ids are path segments and are shown to the model: short, URL-safe.
ROOM_ID_PATTERN = r"^[a-zA-Z0-9_-]{1,64}$"
RoomId = Annotated[str, StringConstraints(pattern=ROOM_ID_PATTERN)]

RoomLabel = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
_BriefText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
_BriefItem = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class RoomBrief(BaseModel):
    """What is known about the room: measures, current state, decisions taken."""
    model_config = ConfigDict(extra="forbid")

    floor_mq: float | None = Field(default=None, ge=0, le=10_000, description="Floor area (m²)")
    walls_mq: float | None = Field(default=None, ge=0, le=10_000, description="Wall area (m²)")
    height_m: float | None = Field(default=None, ge=0, le=20, description="Ceiling height (m)")
    surfaces: _BriefText | None = Field(default=None, description="Floors, walls, ceilings: materials and condition")
    systems: _BriefText | None = Field(default=None, description="Electrical, plumbing, heating")
    fixtures: _BriefText | None = Field(default=None, description="Doors, windows, sanitary ware, fitted elements")
    criticalities: list[_BriefItem] = Field(default_factory=list, max_length=20)
    decisions: list[_BriefItem] = Field(default_factory=list, max_length=20)
    open_questions: list[_BriefItem] = Field(default_factory=list, max_length=20)


class RoomSchema(BaseModel):
    """A room of the project, as stored in Firestore and returned by the API."""
    model_config = ConfigDict(extra="forbid")

    room_id: RoomId
    label: RoomLabel
    room_type: RoomType
    created_at: datetime
    updated_at: datetime
    brief: RoomBrief = Field(default_factory=RoomBrief)
    reference_photo_id: str | None = Field(default=None, description="Id of the `files` document measured for this room")
    summary: str | None = Field(default=None, max_length=500, description="One-line summary for the room index")

    @field_serializer("created_at", "updated_at", when_used="json")
    def _serialize_datetime(self, dt: datetime) -> str:
        """UTC ISO 8601 with Z (naive = UTC, the Firestore SDK contract), like ProjectDocument."""
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


class RoomCreate(BaseModel):
    """Body of `POST /api/projects/{id}/rooms`."""
    model_config = ConfigDict(extra="forbid")

    label: RoomLabel
    room_type: RoomType


class RoomUpdate(BaseModel):
    """Body of `PATCH /api/projects/{id}/rooms/{room_id}`: rename and/or change the type."""
    model_config = ConfigDict(extra="forbid")

    label: RoomLabel | None = None
    room_type: RoomType | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> "RoomUpdate":
        if self.label is None and self.room_type is None:
            raise ValueError("Specify label and/or room_type")
        return self


class FileRoomUpdate(BaseModel):
    """Body of `PATCH /api/projects/{id}/files/{file_id}`: move a file to a room."""
    model_config = ConfigDict(extra="forbid")

    room_id: RoomId
