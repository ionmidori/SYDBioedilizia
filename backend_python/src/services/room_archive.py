"""Rooms the client cleared ("Ricomincia chat di …", "Pulisci tutta la chat"): archived (D7).

A cleared room (`RoomSchema.cleared_at`) stays out of the questions, the card and the editable
draft; its spec and lines stay for the team. It is active again as soon as the client talks
about it or files a photo in it after the clear. Pure: the activity is read from the history and
the files the quote tool has already loaded, never with a read of its own.
"""
from collections.abc import Callable, Iterable, Mapping
from datetime import UTC, datetime

from src.db.projects.constants import FILE_ROOM_FIELD
from src.schemas.room import RoomSchema

# A message of this turn has no timestamp yet (saved after the stream): it is the newest of all.
_THIS_TURN = datetime.max.replace(tzinfo=UTC)


def _at(value: object) -> datetime | None:
    return value if isinstance(value, datetime) else None


def last_activity(
    room_id: str,
    history: Iterable[Mapping[str, object]],
    owner_of: Callable[[Mapping[str, object]], str | None],
    files: Iterable[Mapping[str, object]],
) -> datetime | None:
    """The newest message (by its owner room, `message_rooms`) or file of the room, None if none."""
    times = [
        _at(m.get("timestamp")) or _THIS_TURN for m in history if owner_of(m) == room_id
    ] + [at for f in files if f.get(FILE_ROOM_FIELD) == room_id and (at := _at(f.get("uploadedAt"))) is not None]
    return max(times, default=None)


def is_archived(room: RoomSchema, activity: datetime | None) -> bool:
    """Cleared by the client and nothing of it since."""
    return room.cleared_at is not None and (activity is None or activity <= room.cleared_at)
