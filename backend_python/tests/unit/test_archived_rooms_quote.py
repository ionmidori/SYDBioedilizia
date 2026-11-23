"""PR 3 of the card fixes (D7): a room the client cleared is not quoted again by itself.

The quote tool reads the history and the files it already loads (no read of its own): a
cleared room comes back only with talk or a photo of it after the clear.
"""
from datetime import UTC, datetime, timedelta
from typing import Any

from src.schemas.room import DEFAULT_ROOM_ID, RoomSchema
from src.utils.datetime_utils import utc_now
from tests.unit.test_room_quote import ANALYSES, _calls_by_room, _file, _project, _quote

T0 = datetime(2026, 11, 20, 10, 0, tzinfo=UTC)
CLEARED = T0 + timedelta(hours=1)
AFTER = CLEARED + timedelta(minutes=5)


def _room(room_id: str, label: str, room_type: str, cleared_at: datetime | None = None) -> RoomSchema:
    now = utc_now()
    return RoomSchema(
        room_id=room_id, label=label, room_type=room_type, created_at=now, updated_at=now, cleared_at=cleared_at
    )


def _rooms(bagno_cleared: datetime | None = CLEARED) -> list[RoomSchema]:
    return [
        _room(DEFAULT_ROOM_ID, "Generale", "altro"),
        _room("bagno1", "Bagno", "bagno", bagno_cleared),
        _room("cucina1", "Cucina", "cucina"),
    ]


def _files(bagno_photo_at: datetime = T0) -> list[dict[str, Any]]:
    return [
        {**_file("f_bagno", "bagno1"), "uploadedAt": bagno_photo_at},
        {**_file("f_cucina", "cucina1"), "uploadedAt": T0},
    ]


CUCINA_TALK = {"id": "c1", "role": "user", "content": "In cucina un top in quarzo", "room_id": "cucina1", "timestamp": AFTER}


async def _analysed(rooms: list[RoomSchema], files: list[dict[str, Any]], history: list[dict[str, Any]]) -> set[str]:
    with _project(rooms=rooms, files=files, history=history, analyses=ANALYSES) as mocks:
        await _quote()
    return set(_calls_by_room(mocks["analyze"])) - {"Generale"}


async def test_a_cleared_room_with_only_its_old_photo_is_not_quoted() -> None:
    assert await _analysed(_rooms(), _files(), [CUCINA_TALK]) == {"Cucina"}


async def test_a_room_never_cleared_is_quoted_as_before() -> None:
    assert await _analysed(_rooms(bagno_cleared=None), _files(), [CUCINA_TALK]) == {"Bagno", "Cucina"}


async def test_talk_about_the_room_after_the_clear_quotes_it_again() -> None:
    bagno_talk = {"id": "b1", "role": "user", "content": "Nel bagno voglio la doccia", "room_id": "bagno1", "timestamp": AFTER}
    assert await _analysed(_rooms(), _files(), [CUCINA_TALK, bagno_talk]) == {"Bagno", "Cucina"}


async def test_a_new_photo_after_the_clear_quotes_it_again() -> None:
    assert await _analysed(_rooms(), _files(bagno_photo_at=AFTER), [CUCINA_TALK]) == {"Bagno", "Cucina"}


async def test_talk_from_before_the_clear_does_not_bring_it_back() -> None:
    """A message typed in another chip that names the bathroom, from before the clear."""
    old = {"id": "g1", "role": "user", "content": "Il bagno è 8 mq", "room_id": DEFAULT_ROOM_ID, "timestamp": T0}
    assert await _analysed(_rooms(), _files(), [CUCINA_TALK, old]) == {"Cucina"}
