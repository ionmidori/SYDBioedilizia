"""Where the intervention spec of each quote unit is stored (Phase 140, step 3).

A room keeps its spec on its document (`projects/{pid}/rooms/{rid}.intervention_spec`,
written by `RoomRepository`). Two units have no room document of their own:
"Generale" before its room exists, and the whole chat of a project without rooms
(`CHAT_SPEC_KEY`). Their specs live in `projects/{pid}/private_data/intervention_specs`,
one field per key; once the "Generale" room exists, its document wins over that copy.

Ownership is the caller's job, like `RoomRepository`. No project id in the logs:
from the quote tool it is the chat session id, an access token for guests.
"""
import asyncio
from typing import Any

from pydantic import ValidationError

from src.core.logger import get_logger
from src.db.firebase_client import get_async_firestore_client
from src.repositories.room_repository import PROJECTS, ROOMS, RoomRepository, get_room_repository
from src.schemas.intervention_spec import RoomInterventionSpec
from src.schemas.room import DEFAULT_ROOM_ID

logger = get_logger(__name__)

# The unit of a project without rooms: the whole chat.
CHAT_SPEC_KEY = "chat"
_PRIVATE = "private_data"
_PROJECT_SPECS = "intervention_specs"
_ROOM_FIELD = "intervention_spec"


def _valid(key: str, data: object) -> RoomInterventionSpec | None:
    """A stored spec, or None when it no longer reads (logged: the next analysis rewrites it)."""
    try:
        return RoomInterventionSpec.model_validate(data)
    except ValidationError as exc:
        logger.warning(
            "[SpecStore] Stored intervention spec not readable: ignored.",
            extra={"section_key": key, "errors": exc.error_count()},
        )
        return None


class SpecStore:
    """Async Firestore access to the intervention spec of every quote unit, by section key:
    a room id, `DEFAULT_ROOM_ID` ("Generale") or `CHAT_SPEC_KEY`."""

    def __init__(self, rooms: RoomRepository) -> None:
        self._rooms = rooms

    def _project(self, project_id: str) -> Any:
        return get_async_firestore_client().collection(PROJECTS).document(project_id)

    def _project_specs(self, project_id: str) -> Any:
        return self._project(project_id).collection(_PRIVATE).document(_PROJECT_SPECS)

    async def _stored_in_project(self, project_id: str) -> dict[str, object]:
        snap = await self._project_specs(project_id).get()
        return (snap.to_dict() or {}) if snap.exists else {}

    async def _stored_on_rooms(self, project_id: str) -> dict[str, object]:
        query = self._project(project_id).collection(ROOMS).select([_ROOM_FIELD])
        stored: dict[str, object] = {}
        async for doc in query.stream():
            data = (doc.to_dict() or {}).get(_ROOM_FIELD)
            if data is not None:
                stored[doc.id] = data
        return stored

    async def load_all(self, project_id: str) -> dict[str, RoomInterventionSpec]:
        """Every stored spec by section key; a room document wins over the project copy."""
        in_project, on_rooms = await asyncio.gather(
            self._stored_in_project(project_id), self._stored_on_rooms(project_id)
        )
        specs: dict[str, RoomInterventionSpec] = {}
        for key, data in {**in_project, **on_rooms}.items():
            spec = _valid(key, data)
            if spec is not None:
                specs[key] = spec
        return specs

    async def save(self, project_id: str, section_key: str, spec: RoomInterventionSpec) -> None:
        """Replace the spec of one unit, leaving every other field and unit alone.

        A room id that is no room raises NotFound (a GoogleAPIError), like
        `RoomRepository.save_intervention_spec`."""
        in_project = section_key == CHAT_SPEC_KEY or (
            section_key == DEFAULT_ROOM_ID and await self._rooms.get_room(project_id, DEFAULT_ROOM_ID) is None
        )
        if not in_project:
            await self._rooms.save_intervention_spec(project_id, section_key, spec)
            return
        # merge on the one field path: the spec is replaced whole (a plain merge
        # would keep the keys of an old `conflicts` map), the other units stay.
        await self._project_specs(project_id).set({section_key: spec.model_dump()}, merge=[section_key])
        logger.info("[SpecStore] Intervention spec saved", extra={"section_key": section_key})


def get_spec_store() -> SpecStore:
    return SpecStore(get_room_repository())
