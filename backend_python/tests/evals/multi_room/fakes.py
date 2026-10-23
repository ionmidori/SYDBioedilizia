"""In-memory backend for the multi-room eval (Phase 138).

The live model drives the real room tools and the real `generate_render` tool,
but rooms, project files and the image backend are fakes: the run writes
nothing to Firestore or Storage, spends no render quota, and records which
photo every render started from. The project matches the eval case: a kitchen
and a bathroom, photos uploaded kitchen → bathroom → kitchen.
"""
import uuid
from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock, patch

from src.core.exceptions import ProjectFileNotFoundError, RoomNotFoundError
from src.schemas.room import RoomCreate, RoomSchema
from src.tools.quota import QuotaDecision
from src.utils.datetime_utils import utc_now

KITCHEN_ROOM_ID = "r_cucina"
BATH_ROOM_ID = "r_bagno"
KITCHEN_PHOTOS = ("f_cucina_1", "f_cucina_2")
BATH_PHOTO = "f_bagno_1"


def photo_url(file_id: str) -> str:
    return f"https://storage.example.invalid/user-uploads/eval/{file_id}.jpg"


def _room(room_id: str, label: str, room_type: str) -> RoomSchema:
    now = utc_now()
    return RoomSchema(room_id=room_id, label=label, room_type=room_type, created_at=now, updated_at=now)


@dataclass
class FakeRoomRepository:
    """`RoomRepository` over dicts; ignores the project id (one eval project)."""

    rooms: dict[str, RoomSchema] = field(default_factory=lambda: {
        KITCHEN_ROOM_ID: _room(KITCHEN_ROOM_ID, "Cucina", "cucina"),
        BATH_ROOM_ID: _room(BATH_ROOM_ID, "Bagno", "bagno"),
    })
    # Oldest first: kitchen, bathroom, kitchen again.
    files: list[dict[str, Any]] = field(default_factory=lambda: [
        {"id": KITCHEN_PHOTOS[0], "type": "image", "url": photo_url(KITCHEN_PHOTOS[0]), "roomId": KITCHEN_ROOM_ID},
        {"id": BATH_PHOTO, "type": "image", "url": photo_url(BATH_PHOTO), "roomId": BATH_ROOM_ID},
        {"id": KITCHEN_PHOTOS[1], "type": "image", "url": photo_url(KITCHEN_PHOTOS[1]), "roomId": KITCHEN_ROOM_ID},
    ])

    async def list_rooms(self, project_id: str) -> list[RoomSchema]:
        return list(self.rooms.values())

    async def get_room(self, project_id: str, room_id: str) -> RoomSchema | None:
        return self.rooms.get(room_id)

    async def require_room(self, project_id: str, room_id: str) -> RoomSchema:
        if room_id not in self.rooms:
            raise RoomNotFoundError(project_id, room_id)
        return self.rooms[room_id]

    async def create_room(self, project_id: str, data: RoomCreate) -> RoomSchema:
        room = _room(f"r_{uuid.uuid4().hex[:8]}", data.label, data.room_type)
        self.rooms[room.room_id] = room
        return room

    async def files_for_room(
        self, project_id: str, room_id: str, *, file_type: str | None = None, limit: int | None = None
    ) -> list[dict[str, Any]]:
        found = [
            f for f in reversed(self.files)
            if f.get("roomId") == room_id and (file_type is None or f["type"] == file_type)
        ]
        return found[:limit] if limit is not None else found

    async def latest_room_photo(self, project_id: str, room_id: str) -> dict[str, Any] | None:
        photos = await self.files_for_room(project_id, room_id, file_type="image", limit=1)
        return photos[0] if photos else None

    async def latest_unclassified_photo(self, project_id: str) -> dict[str, Any] | None:
        return next(
            (f for f in reversed(self.files) if f["type"] == "image" and f.get("roomId") in (None, "generale")),
            None,
        )

    async def list_files(self, project_id: str) -> list[dict[str, Any]]:
        return list(self.files)

    async def find_file_by_storage_path(self, project_id: str, storage_path: str) -> dict[str, Any] | None:
        return None

    async def assign_file_to_room(self, project_id: str, file_id: str, room_id: str) -> None:
        await self.require_room(project_id, room_id)
        doc = next((f for f in self.files if f["id"] == file_id), None)
        if doc is None:
            raise ProjectFileNotFoundError(project_id, file_id)
        doc["roomId"] = room_id


@dataclass
class RenderRecorder:
    """Photo each `generate_render` call started from (None = text to image)."""

    sources: list[str | None] = field(default_factory=list)

    async def render(self, **kwargs: Any) -> dict[str, Any]:
        self.sources.append(kwargs.get("source_image_url"))
        return {"status": "success", "imageUrl": "https://storage.example.invalid/renders/eval/render.png"}

    def problems(self) -> list[str]:
        """Why the run broke the rule "a bathroom render starts from the bathroom photo"."""
        if not self.sources:
            return ["no render was generated"]
        expected = photo_url(BATH_PHOTO)
        return [f"render {i + 1} started from {s!r}, expected {expected!r}" for i, s in enumerate(self.sources) if s != expected]


@contextmanager
def multi_room_backend() -> Iterator[RenderRecorder]:
    """Patch the room repository, login/quota gates and the image backend."""
    repo = FakeRoomRepository()
    recorder = RenderRecorder()
    newest_project_photo = photo_url(KITCHEN_PHOTOS[1])  # what a room-blind render would use
    allowed = QuotaDecision(True, 10, utc_now())
    with ExitStack() as stack:
        for target in ("src.tools.room_tools.get_room_repository", "src.adk.tools.get_room_repository"):
            stack.enter_context(patch(target, return_value=repo))
        stack.enter_context(patch("src.adk.tools.latest_uploaded_photo_url", new=AsyncMock(return_value=newest_project_photo)))
        stack.enter_context(patch("src.adk.tools.is_anonymous_user", new=AsyncMock(return_value=False)))
        stack.enter_context(patch("src.adk.tools.check_quota", new=AsyncMock(return_value=allowed)))
        stack.enter_context(patch("src.adk.tools.increment_quota", new=AsyncMock()))
        stack.enter_context(patch("src.tools.generate_render.generate_render_wrapper", new=recorder.render))
        yield recorder
