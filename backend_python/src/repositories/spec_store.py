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

A unit the client cleared (a chat clear, services/room_archive.py) is archived: its spec
stays (the team keeps it) but `load_all` leaves it out, so it is on no card and in no draft.
A room is archived by its `cleared_at`; the units in the project specs by an entry of their
`archived` map. The next spec written for the unit starts it again from nothing: what the
client confirmed before the clear does not count, and the archive mark goes.

Ownership is the caller's job, like `RoomRepository`. No project id in the logs:
from the quote tool it is the chat session id, an access token for guests.
"""
import asyncio
import hashlib
import json
from collections.abc import Awaitable, Callable, Iterable, Mapping
from datetime import datetime
from typing import Any

from google.api_core.exceptions import NotFound
from google.cloud.firestore_v1 import DELETE_FIELD
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
# A room the client cleared (RoomSchema.cleared_at), and the project units archived.
_CLEARED_FIELD = "cleared_at"
_ARCHIVED = "archived"

# The new spec of a unit from the one stored now (None: none yet).
SpecChange = Callable[[RoomInterventionSpec | None], RoomInterventionSpec]
# Reads in a write's transaction before its own reads; raises to write nothing (the
# caller's error reaches the client). Unlike `quote_drafts.DraftGuard`, which returns False.
TransactionGuard = Callable[[Any], Awaitable[None]]


def chat_on_card(keys: Iterable[str]) -> bool:
    """The whole chat is a section of the card only while no room has a spec."""
    return all(key == CHAT_SPEC_KEY for key in keys)


def spec_fingerprint(specs: Mapping[str, RoomInterventionSpec]) -> str:
    """One string for a project's specs (`load_all`): equal only when every unit's spec is."""
    canonical = {key: spec.model_dump(mode="json") for key, spec in specs.items()}
    return hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()


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

    async def _stored_in_project(
        self, db: Any, project_id: str, transaction: Any | None
    ) -> tuple[dict[str, object], set[str]]:
        """The project's specs by key, and the keys archived there."""
        snap = await self._project_specs(db, project_id).get(transaction=transaction)
        data = dict(snap.to_dict() or {}) if snap.exists else {}
        archived = data.pop(_ARCHIVED, None)
        return data, set(archived) if isinstance(archived, dict) else set()

    async def _stored_on_rooms(
        self, db: Any, project_id: str, transaction: Any | None
    ) -> tuple[dict[str, object], set[str]]:
        """The rooms' specs by room id, and the rooms the client cleared (same read)."""
        query = self._project(db, project_id).collection(ROOMS).select([_ROOM_FIELD, _CLEARED_FIELD])
        stored: dict[str, object] = {}
        cleared: set[str] = set()
        async for doc in query.stream(transaction=transaction):
            fields = doc.to_dict() or {}
            if fields.get(_CLEARED_FIELD) is not None:
                cleared.add(doc.id)
            data = fields.get(_ROOM_FIELD)
            if data is not None:
                stored[doc.id] = data
        return stored, cleared

    async def load_all(
        self, project_id: str, *, transaction: Any | None = None, include_archived: bool = False
    ) -> dict[str, RoomInterventionSpec]:
        """Every readable stored spec by section key; a room's wins over the project copy.
        The units the client cleared are left out unless `include_archived` (the team).

        With `transaction`, both reads are the transaction's: the card checks there that
        the specs are still the ones its draft was computed from (`spec_fingerprint`)."""
        db = get_async_firestore_client()
        (in_project, archived), (on_rooms, cleared) = await asyncio.gather(
            self._stored_in_project(db, project_id, transaction), self._stored_on_rooms(db, project_id, transaction)
        )
        # A cleared room hides its project copy too ("Generale" before its room had a spec); the
        # project's archive mark hides only a project copy: a room's new spec is the unit again.
        hidden = set() if include_archived else cleared | (archived - set(on_rooms))
        specs: dict[str, RoomInterventionSpec] = {}
        for key, data in {**in_project, **on_rooms}.items():
            if key in hidden:
                continue
            spec = _valid(key, data)
            if spec is not None:
                specs[key] = spec
        return specs

    async def archive_project_specs(
        self, project_id: str, *, now: datetime, keys: Iterable[str] = (CHAT_SPEC_KEY, DEFAULT_ROOM_ID)
    ) -> None:
        """A chat clear: the units kept in the project specs are archived too (the whole chat
        before the rooms, and on a full clear "Generale" before its room). The rooms are
        archived by their own reset."""
        db = get_async_firestore_client()
        await self._project_specs(db, project_id).set({_ARCHIVED: dict.fromkeys(keys, now)}, merge=True)

    async def update(
        self, project_id: str, section_key: str, change: SpecChange, *, guard: TransactionGuard | None = None
    ) -> RoomInterventionSpec | None:
        """Write `change(stored spec)` as the unit's spec, in one transaction, leaving
        every other field and unit alone. Returns what was written, or None (nothing
        written) when the stored spec does not read.

        `guard` runs first in the transaction and raises to write nothing (the card:
        the quote is still the client's when the spec is written, not only when read).

        A room id that is no room raises NotFound (a GoogleAPIError)."""
        db = get_async_firestore_client()
        project_specs = self._project_specs(db, project_id)
        room = None if section_key == CHAT_SPEC_KEY else self._project(db, project_id).collection(ROOMS).document(section_key)

        async def body(transaction: Any) -> RoomInterventionSpec | None:
            if guard is not None:
                await guard(transaction)
            # Every read before the first write (Firestore transactions).
            room_snap = await room.get(transaction=transaction) if room is not None else None
            room_data = (room_snap.to_dict() or {}) if room_snap is not None and room_snap.exists else None
            on_room = room_data is not None
            if room is not None and not on_room and section_key != DEFAULT_ROOM_ID:
                raise NotFound(f"room {section_key}")
            # A room the client cleared starts again from nothing: its old spec is not read.
            room_cleared = room_data is not None and room_data.get(_CLEARED_FIELD) is not None
            stored = room_data.get(_ROOM_FIELD) if room_data is not None and not room_cleared else None
            project_archived = False
            # "Generale" reads its project copy until its room has a spec of its own.
            if stored is None and not room_cleared and section_key in (CHAT_SPEC_KEY, DEFAULT_ROOM_ID):
                project_snap = await project_specs.get(transaction=transaction)
                project_data = (project_snap.to_dict() or {}) if project_snap.exists else {}
                archived = project_data.get(_ARCHIVED)
                project_archived = isinstance(archived, dict) and section_key in archived
                stored = None if project_archived else project_data.get(section_key)
            current = None if stored is None else _valid(section_key, stored)
            if stored is not None and current is None:
                return None
            spec = change(current)
            if on_room:
                # Written for the room again: the room is active again (no longer archived).
                transaction.update(
                    room, {_ROOM_FIELD: spec.model_dump(), "updated_at": utc_now(), _CLEARED_FIELD: None}
                )
            elif project_archived:
                # The archive mark goes with the new spec (the document exists: it holds the mark).
                transaction.update(
                    project_specs, {section_key: spec.model_dump(), f"{_ARCHIVED}.{section_key}": DELETE_FIELD}
                )
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
