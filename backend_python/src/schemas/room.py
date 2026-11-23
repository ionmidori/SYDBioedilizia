"""Rooms of a project: `projects/{project_id}/rooms/{room_id}` (Phase 138).

One chat covers the whole home; each room is a "scheda stanza" (structured
memory) and everything about it — files, messages, quote items, renders —
carries its `room_id`. Documents are stored as `RoomSchema.model_dump()`
(snake_case, like the API), written only by the backend.

**Golden Sync**: mirrored by the zod schemas in `web_client/types/room.ts`, except
`intervention_spec` (Phase 140) and `photo_estimate`: excluded from every
serialization of the room (the client's `roomSchema` is strict); the client
reads the spec through the confirmation API (step 3).
"""
import re
from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationError,
    ValidatorFunctionWrapHandler,
    field_serializer,
    field_validator,
    model_validator,
)

from src.schemas.intervention_spec import RoomInterventionSpec
from src.vision.measure_room import RoomMeasurements

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

# Leading article: "l'" may touch the word ("l'ingresso"), the others need a space
# (else "Ingresso" would lose its "I").
_ARTICLE = re.compile(r"^(?:l'\s*|(?:il|lo|la|i|gli|le)\s+)")


def normalize_room_label(text: str) -> str:
    """Key under which two names mean the same room: "Il  Bagno" = "bagno"."""
    return _ARTICLE.sub("", " ".join(text.casefold().split()))

_BriefText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
_BriefItem = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class RoomBrief(BaseModel):
    """What is known about the room: measures, current state, decisions taken."""
    model_config = ConfigDict(extra="forbid")

    floor_mq: float | None = Field(default=None, ge=0, le=10_000, description="Floor area (m²)")
    walls_mq: float | None = Field(default=None, ge=0, le=10_000, description="Wall area (m²)")
    height_m: float | None = Field(default=None, ge=0, le=20, description="Ceiling height (m)")
    length_m: float | None = Field(default=None, gt=0, le=100, description="Room length (m), with the width the code derives the measures")
    width_m: float | None = Field(default=None, gt=0, le=100, description="Room width (m)")
    surfaces: _BriefText | None = Field(default=None, description="Floors, walls, ceilings: materials and condition")
    systems: _BriefText | None = Field(default=None, description="Electrical, plumbing, heating")
    fixtures: _BriefText | None = Field(default=None, description="Doors, windows, sanitary ware, fitted elements")
    criticalities: list[_BriefItem] = Field(default_factory=list, max_length=20)
    decisions: list[_BriefItem] = Field(default_factory=list, max_length=20)
    open_questions: list[_BriefItem] = Field(default_factory=list, max_length=20)


_Sha256 = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]


class PhotoEstimate(BaseModel):
    """What SYD measured from the room's photos when the client picked the room
    (`services/room_photo_vision.py`): an estimate, never the client's value."""
    model_config = ConfigDict(extra="forbid")

    source_hash: _Sha256 = Field(description="The photos read, in order: a change measures the room again")
    reference_hash: _Sha256 = Field(description="Content of the measured photo: the quote reuses the estimate for it")
    measurements: RoomMeasurements
    notes: list[_BriefItem] = Field(default_factory=list, max_length=20, description="What each other photo adds")
    at: datetime


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
    # Written only by SpecStore.update (a partial update). exclude=True
    # keeps it out of the API and of model_dump(): never write a whole RoomSchema dump
    # over an existing room document, or the spec is lost.
    intervention_spec: RoomInterventionSpec | None = Field(
        default=None, exclude=True, description="What the room's quote was computed from (backend-only)"
    )
    # Written only by RoomRepository.update_photo_estimate (backend-only, like the spec).
    photo_estimate: PhotoEstimate | None = Field(
        default=None, exclude=True, description="Measures estimated from the room's photos (backend-only)"
    )
    # Written by RoomRepository.reset_brief / reset_all_briefs (a chat clear); a spec write clears it
    # (SpecStore.update: the room is quoted again). Backend-only, like the spec.
    cleared_at: datetime | None = Field(
        default=None, exclude=True, description="When the client cleared the room's chat (backend-only)"
    )

    @field_validator("intervention_spec", "photo_estimate", mode="wrap")
    @classmethod
    def _readable_backend_field(
        cls, value: object, handler: ValidatorFunctionWrapHandler
    ) -> RoomInterventionSpec | PhotoEstimate | None:
        """A backend field that does not read (a newer format during a rollout) reads as
        None, so it never breaks the room or its listing (SpecStore skips such a spec)."""
        try:
            return handler(value)
        except ValidationError:
            return None

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
