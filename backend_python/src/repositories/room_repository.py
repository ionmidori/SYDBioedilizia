"""Rooms of a project and the room each project file belongs to (Phase 138).

Rooms live in `projects/{project_id}/rooms/{room_id}`; a file of
`projects/{project_id}/files` belongs to a room through its top-level `roomId`
field. Ownership is the caller's job (REST routes check the project owner,
agent tools use the trusted session): this layer only reads and writes.
"""
import uuid
from typing import Any

from google.api_core.exceptions import AlreadyExists
from google.cloud.firestore_v1 import FieldFilter

from src.core.exceptions import ProjectFileNotFoundError, RoomLimitError, RoomNotFoundError
from src.core.logger import get_logger
from src.db.firebase_client import get_async_firestore_client
from src.db.projects.constants import FILE_ROOM_FIELD
from src.schemas.room import RoomCreate, RoomSchema, RoomUpdate
from src.utils.datetime_utils import utc_now

logger = get_logger(__name__)

PROJECTS = "projects"
ROOMS = "rooms"
FILES = "files"

# Room that collects the files of a project created before rooms existed.
DEFAULT_ROOM_ID = "generale"
DEFAULT_ROOM_LABEL = "Generale"
# A home, not a building: bounds the room index the model reads every turn.
# Soft cap (count then write): concurrent creations may pass it by a few.
MAX_ROOMS_PER_PROJECT = 30
# Writes per batch when filing a legacy project's files (Firestore limit: 500).
_BATCH_WRITES = 400


def _new_room_id() -> str:
    return uuid.uuid4().hex[:12]


class RoomRepository:
    """Async Firestore access to rooms and to the room of each project file."""

    def _db(self) -> Any:
        return get_async_firestore_client()

    def _project(self, project_id: str) -> Any:
        return self._db().collection(PROJECTS).document(project_id)

    async def list_rooms(self, project_id: str) -> list[RoomSchema]:
        """Rooms in creation order (the order the client shows its chips in)."""
        query = self._project(project_id).collection(ROOMS).order_by("created_at")
        return [RoomSchema.model_validate(doc.to_dict()) async for doc in query.stream()]

    async def get_room(self, project_id: str, room_id: str) -> RoomSchema | None:
        snap = await self._project(project_id).collection(ROOMS).document(room_id).get()
        return RoomSchema.model_validate(snap.to_dict()) if snap.exists else None

    async def require_room(self, project_id: str, room_id: str) -> RoomSchema:
        """The room, or RoomNotFoundError (404)."""
        room = await self.get_room(project_id, room_id)
        if room is None:
            raise RoomNotFoundError(project_id, room_id)
        return room

    async def create_room(self, project_id: str, data: RoomCreate) -> RoomSchema:
        """New room with an empty brief; RoomLimitError (409) past MAX_ROOMS_PER_PROJECT.

        The first room of a project that already has files (created before
        rooms existed) comes with "Generale" holding them, as on a first listing.
        """
        rooms_ref = self._project(project_id).collection(ROOMS)
        count = (await rooms_ref.count().get())[0][0].value
        if count == 0 and await self._file_unfiled_media(project_id):
            await self._create_default_room(project_id)
            count = 1
        if count >= MAX_ROOMS_PER_PROJECT:
            raise RoomLimitError(project_id, MAX_ROOMS_PER_PROJECT)
        now = utc_now()
        room = RoomSchema(
            room_id=_new_room_id(), label=data.label, room_type=data.room_type, created_at=now, updated_at=now
        )
        await rooms_ref.document(room.room_id).set(room.model_dump())
        logger.info("[Rooms] Room created", extra={"project_id": project_id, "room_id": room.room_id})
        return room

    async def update_room(self, project_id: str, room_id: str, data: RoomUpdate) -> RoomSchema:
        """Rename and/or retype a room; RoomNotFoundError (404) if it does not exist."""
        room = await self.require_room(project_id, room_id)
        changes: dict[str, Any] = data.model_dump(exclude_none=True)
        changes["updated_at"] = utc_now()
        await self._project(project_id).collection(ROOMS).document(room_id).update(changes)
        return room.model_copy(update=changes)

    async def ensure_default_room(self, project_id: str) -> RoomSchema:
        """The "Generale" room, created on first access, holding every file without a room.

        Idempotent and crash-safe: files are filed first, then the room is
        created with `create()` (a concurrent caller gets AlreadyExists and reads
        it). A crash in between leaves files pointing at a room the next call creates.
        Files uploaded later without a room stay unfiled until assigned.
        """
        assigned = await self._file_unfiled_media(project_id)
        room = await self._create_default_room(project_id)
        logger.info("[Rooms] Default room ready", extra={"project_id": project_id, "files_assigned": assigned})
        return room

    async def _file_unfiled_media(self, project_id: str) -> int:
        """Put every file without a room in the default room (batched writes); how many."""
        db = self._db()
        batch, pending, assigned = db.batch(), 0, 0
        async for doc in self._project(project_id).collection(FILES).stream():
            if (doc.to_dict() or {}).get(FILE_ROOM_FIELD):
                continue
            batch.update(doc.reference, {FILE_ROOM_FIELD: DEFAULT_ROOM_ID})
            pending += 1
            assigned += 1
            if pending == _BATCH_WRITES:
                await batch.commit()
                batch, pending = db.batch(), 0
        if pending:
            await batch.commit()
        return assigned

    async def _create_default_room(self, project_id: str) -> RoomSchema:
        now = utc_now()
        room = RoomSchema(
            room_id=DEFAULT_ROOM_ID, label=DEFAULT_ROOM_LABEL, room_type="altro", created_at=now, updated_at=now
        )
        try:
            await self._project(project_id).collection(ROOMS).document(DEFAULT_ROOM_ID).create(room.model_dump())
        except AlreadyExists:
            return await self.require_room(project_id, DEFAULT_ROOM_ID)
        return room

    async def files_for_room(
        self, project_id: str, room_id: str, *, file_type: str | None = None, limit: int | None = None
    ) -> list[dict[str, Any]]:
        """Files of a room, newest first, each with its document `id`."""
        query = self._project(project_id).collection(FILES).where(
            filter=FieldFilter(FILE_ROOM_FIELD, "==", room_id)
        )
        if file_type is not None:
            query = query.where(filter=FieldFilter("type", "==", file_type))
        query = query.order_by("uploadedAt", direction="DESCENDING")
        if limit is not None:
            query = query.limit(limit)
        return [{**(doc.to_dict() or {}), "id": doc.id} async for doc in query.stream()]

    async def latest_room_photo(self, project_id: str, room_id: str) -> dict[str, Any] | None:
        """The newest photo uploaded for the room (renders are type "render", not "image")."""
        photos = await self.files_for_room(project_id, room_id, file_type="image", limit=1)
        return photos[0] if photos else None

    async def find_file_by_storage_path(self, project_id: str, storage_path: str) -> dict[str, Any] | None:
        """The `files` document of an object path (with its `id`), if registered."""
        query = (
            self._project(project_id).collection(FILES)
            .where(filter=FieldFilter("metadata.storage_path", "==", storage_path))
            .limit(1)
        )
        async for doc in query.stream():
            return {**(doc.to_dict() or {}), "id": doc.id}
        return None

    async def assign_file_to_room(self, project_id: str, file_id: str, room_id: str) -> None:
        """Move a project file to a room of the same project (404 if either is missing)."""
        await self.require_room(project_id, room_id)
        file_ref = self._project(project_id).collection(FILES).document(file_id)
        if not (await file_ref.get()).exists:
            raise ProjectFileNotFoundError(project_id, file_id)
        await file_ref.update({FILE_ROOM_FIELD: room_id})
        logger.info("[Rooms] File assigned", extra={"project_id": project_id, "file_id": file_id, "room_id": room_id})


def get_room_repository() -> RoomRepository:
    return RoomRepository()
