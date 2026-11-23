"""A room the client cleared ("Ricomincia chat di …") is archived (PR 3 of the card fixes, D7).

It stays out of the questions, the card and the editable draft until the client talks about it
again or files a new photo in it: then it is active again. What counts is only what came after
the clear (`cleared_at`), read from the history and the files the quote tool already loaded.
"""
from datetime import UTC, datetime, timedelta

from src.schemas.room import RoomSchema
from src.services.room_archive import is_archived, last_activity

T0 = datetime(2026, 11, 20, 10, 0, tzinfo=UTC)
CLEARED = T0 + timedelta(hours=1)


def _room(cleared_at: datetime | None = CLEARED, room_id: str = "bagno1") -> RoomSchema:
    return RoomSchema(
        room_id=room_id, label="Bagno", room_type="bagno", created_at=T0, updated_at=T0, cleared_at=cleared_at
    )


def test_a_room_never_cleared_is_never_archived() -> None:
    assert is_archived(_room(cleared_at=None), None) is False
    assert is_archived(_room(cleared_at=None), T0) is False


def test_a_cleared_room_without_new_activity_is_archived() -> None:
    assert is_archived(_room(), None) is True
    assert is_archived(_room(), CLEARED - timedelta(minutes=5)) is True
    assert is_archived(_room(), CLEARED) is True


def test_activity_after_the_clear_makes_it_active_again() -> None:
    assert is_archived(_room(), CLEARED + timedelta(seconds=1)) is False


def test_the_last_activity_reads_the_rooms_messages_and_files_after_the_clear() -> None:
    owner = {"m1": "bagno1", "m2": "cucina1", "m3": "bagno1"}
    history = [
        {"id": "m1", "content": "vecchio", "timestamp": T0},
        {"id": "m2", "content": "cucina", "timestamp": CLEARED + timedelta(minutes=9)},
        {"id": "m3", "content": "nuovo", "timestamp": CLEARED + timedelta(minutes=2)},
    ]
    files = [
        {"id": "f1", "roomId": "bagno1", "uploadedAt": T0},
        {"id": "f2", "roomId": "bagno1", "uploadedAt": CLEARED + timedelta(minutes=5)},
        {"id": "f3", "roomId": "cucina1", "uploadedAt": CLEARED + timedelta(minutes=20)},
    ]
    found = last_activity("bagno1", history, lambda m: owner[m["id"]], files)
    assert found == CLEARED + timedelta(minutes=5)


def test_a_message_of_this_turn_without_a_timestamp_is_new() -> None:
    """The quote tool adds the turn's message (saved only after the stream): it is now."""
    history = [{"id": "m9", "content": "il bagno lo rifaccio", "timestamp": None}]
    found = last_activity("bagno1", history, lambda _m: "bagno1", [])
    assert found is not None and is_archived(_room(), found) is False


def test_nothing_of_the_room_is_no_activity() -> None:
    assert last_activity("bagno1", [], lambda _m: None, [{"id": "f", "roomId": "x", "uploadedAt": T0}]) is None
