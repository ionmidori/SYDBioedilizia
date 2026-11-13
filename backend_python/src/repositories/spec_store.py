"""Where the intervention spec of each quote unit is stored (Phase 140, step 3).

A room keeps its spec on its document (`projects/{pid}/rooms/{rid}.intervention_spec`).
Two units have no room document of their own: "Generale" before its room exists,
and the whole chat of a project without rooms (`CHAT_SPEC_KEY`). Their specs live in
`projects/{pid}/private_data/intervention_specs`, one field per key; once the
"Generale" room has a spec, it wins over that copy.

Two writers, the quote tool and the confirmation card: every write re-reads the
stored spec in its transaction, so a confirmation made during an analysis is
never lost, and a stored spec that does not read (a newer format during a
rollout) is never overwritten.

Ownership is the caller's job, like `RoomRepository`. No project id in the logs:
from the quote tool it is the chat session id, an access token for guests.
"""
import asyncio
from collections.abc import Callable, Iterable
from typing import Any

from google.api_core.exceptions import NotFound
from pydantic import ValidationError

from src.core.logger import get_logger
from src.db import transactions
from src.db.firebase_client import get_async_firestore_client
from src.repositories.room_repository import PROJECTS, ROOMS
from src.schemas.intervention_spec import RoomInterventionSpec
from src.schemas.room import DEFAULT_ROOM_ID
from src.utils.datetime_utils import utc_now

logger = get_logger(__name__)

# The unit of a project without rooms: the whole chat.
CHAT_SPEC_KEY = "chat"
_PRIVATE = "private_data"
_PROJECT_SPECS = "intervention_specs"
_ROOM_FIELD = "intervention_spec"

# The new spec of a unit from the one stored now (None: none yet).
SpecChange = Callable[[RoomInterventionSpec | None], RoomInterventionSpec]


def chat_on_card(keys: Iterable[str]) -> bool:
    """The whole chat is a section of the card only while no room has a spec."""
    return all(key == CHAT_SPEC_KEY for key in keys)


def _valid(key: str, data: object) -> RoomInterventionSpec | None:
    """A stored spec, or None when it does not read (logged)."""
    try:
        return RoomInterventionSpec.model_validate(data)
    except ValidationError as exc:
        logger.warning(
            "[SpecStore] Stored intervention spec not readable: ignored, never overwritten.",
            extra={"section_key": key, "errors": exc.error_count()},
        )
        return None


class SpecStore:
    """Async Firestore access to the intervention spec of every quote unit, by section key:
    a room id, `DEFAULT_ROOM_ID` ("Generale") or `CHAT_SPEC_KEY`."""

    def _project(self, db: Any, project_id: str) -> Any:
        return db.collection(PROJECTS).document(project_id)

    def _project_specs(self, db: Any, project_id: str) -> Any:
        return self._project(db, project_id).collection(_PRIVATE).document(_PROJECT_SPECS)

    async def _stored_in_project(self, db: Any, project_id: str) -> dict[str, object]:
        snap = await self._project_specs(db, project_id).get()
        return (snap.to_dict() or {}) if snap.exists else {}

    async def _stored_on_rooms(self, db: Any, project_id: str) -> dict[str, object]:
        query = self._project(db, project_id).collection(ROOMS).select([_ROOM_FIELD])
        stored: dict[str, object] = {}
        async for doc in query.stream():
            data = (doc.to_dict() or {}).get(_ROOM_FIELD)
            if data is not None:
                stored[doc.id] = data
        return stored

    async def load_all(self, project_id: str) -> dict[str, RoomInterventionSpec]:
        """Every readable stored spec by section key; a room's wins over the project copy."""
        db = get_async_firestore_client()
        in_project, on_rooms = await asyncio.gather(
            self._stored_in_project(db, project_id), self._stored_on_rooms(db, project_id)
        )
        specs: dict[str, RoomInterventionSpec] = {}
        for key, data in {**in_project, **on_rooms}.items():
            spec = _valid(key, data)
            if spec is not None:
                specs[key] = spec
        return specs

    async def update(self, project_id: str, section_key: str, change: SpecChange) -> RoomInterventionSpec | None:
        """Write `change(stored spec)` as the unit's spec, in one transaction, leaving
        every other field and unit alone. Returns what was written, or None (nothing
        written) when the stored spec does not read.

        A room id that is no room raises NotFound (a GoogleAPIError)."""
        db = get_async_firestore_client()
        project_specs = self._project_specs(db, project_id)
        room = None if section_key == CHAT_SPEC_KEY else self._project(db, project_id).collection(ROOMS).document(section_key)

        async def body(transaction: Any) -> RoomInterventionSpec | None:
            # Every read before the first write (Firestore transactions).
            room_snap = await room.get(transaction=transaction) if room is not None else None
            room_data = (room_snap.to_dict() or {}) if room_snap is not None and room_snap.exists else None
            on_room = room_data is not None
            if room is not None and not on_room and section_key != DEFAULT_ROOM_ID:
                raise NotFound(f"room {section_key}")
            stored = room_data.get(_ROOM_FIELD) if room_data is not None else None
            # "Generale" reads its project copy until its room has a spec of its own.
            if stored is None and section_key in (CHAT_SPEC_KEY, DEFAULT_ROOM_ID):
                project_snap = await project_specs.get(transaction=transaction)
                stored = (project_snap.to_dict() or {}).get(section_key) if project_snap.exists else None
            current = None if stored is None else _valid(section_key, stored)
            if stored is not None and current is None:
                return None
            spec = change(current)
            if on_room:
                transaction.update(room, {_ROOM_FIELD: spec.model_dump(), "updated_at": utc_now()})
            else:
                # merge on the one field path: the spec is replaced whole (a plain merge
                # would keep the keys of an old `conflicts` map), the other units stay.
                transaction.set(project_specs, {section_key: spec.model_dump()}, merge=[section_key])
            return spec

        spec = await transactions.run_transaction(db, body)
        logger.info("[SpecStore] Intervention spec saved", extra={"section_key": section_key, "written": spec is not None})
        return spec


def get_spec_store() -> SpecStore:
    return SpecStore()
