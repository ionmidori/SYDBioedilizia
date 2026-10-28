"""Phase 138 PR-1: rooms of a project (schema + repository) and the room of
each file and message, on the in-memory Firestore double."""
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from pydantic import ValidationError
from src.core.exceptions import ProjectFileNotFoundError, RoomLimitError, RoomNotFoundError
from src.repositories import room_repository
from src.repositories.conversation_repository import ConversationRepository
from src.repositories.room_repository import DEFAULT_ROOM_ID, MAX_ROOMS_PER_PROJECT, RoomRepository
from src.schemas.room import RoomCreate, RoomSchema, RoomUpdate
from tests.unit.firestore_fakes import FakeDb

PID = "proj1"
T0 = datetime(2026, 10, 1, tzinfo=UTC)


@pytest.fixture()
def db() -> FakeDb:
    fake = FakeDb()
    with patch.object(room_repository, "get_async_firestore_client", return_value=fake):
        yield fake


def _file(db: FakeDb, file_id: str, *, minutes: int, type_: str = "image", room: str | None = None) -> None:
    data = {"type": type_, "url": f"https://x/{file_id}", "uploadedAt": T0 + timedelta(minutes=minutes),
            "metadata": {"storage_path": f"user-uploads/{PID}/{file_id}.jpg"}}
    if room is not None:
        data["roomId"] = room
    db.put("projects", PID, "files", file_id, data)


# ── Schema ───────────────────────────────────────────────────────────────────

def test_room_label_is_trimmed_and_type_checked():
    assert RoomCreate(label="  Bagno grande ", room_type="bagno").label == "Bagno grande"
    with pytest.raises(ValidationError):
        RoomCreate(label="Garage", room_type="garage")  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        RoomCreate(label="   ", room_type="bagno")


def test_room_update_needs_a_change():
    with pytest.raises(ValidationError):
        RoomUpdate()
    assert RoomUpdate(label="Cucina").room_type is None


def test_room_json_dates_are_utc_with_z():
    room = RoomSchema(room_id="r1", label="Bagno", room_type="bagno", created_at=T0, updated_at=T0)
    dumped = room.model_dump(mode="json")
    assert dumped["created_at"] == "2026-10-01T00:00:00Z"
    assert dumped["brief"]["decisions"] == []
    assert isinstance(room.model_dump()["created_at"], datetime)  # Firestore gets a timestamp


# ── Repository ───────────────────────────────────────────────────────────────

async def test_create_get_and_list_in_creation_order(db):
    repo = RoomRepository()
    with patch.object(room_repository, "utc_now", side_effect=[T0, T0 + timedelta(minutes=1)]):
        bagno = await repo.create_room(PID, RoomCreate(label="Bagno", room_type="bagno"))
        cucina = await repo.create_room(PID, RoomCreate(label="Cucina", room_type="cucina"))

    assert (await repo.get_room(PID, bagno.room_id)) == bagno
    assert [r.room_id for r in await repo.list_rooms(PID)] == [bagno.room_id, cucina.room_id]
    assert await repo.get_room(PID, "missing") is None


async def test_room_limit(db):
    for i in range(MAX_ROOMS_PER_PROJECT):
        db.put("projects", PID, "rooms", f"r{i}", {})
    with pytest.raises(RoomLimitError):
        await RoomRepository().create_room(PID, RoomCreate(label="Altra", room_type="altro"))


async def test_update_renames_and_retypes(db):
    repo = RoomRepository()
    room = await repo.create_room(PID, RoomCreate(label="Camera", room_type="camera"))
    updated = await repo.update_room(PID, room.room_id, RoomUpdate(label="Studio", room_type="altro"))

    assert (updated.label, updated.room_type) == ("Studio", "altro")
    assert await repo.get_room(PID, room.room_id) == updated
    with pytest.raises(RoomNotFoundError):
        await repo.update_room(PID, "missing", RoomUpdate(label="X"))


async def test_default_room_collects_unassigned_files_once(db):
    _file(db, "f1", minutes=1)
    _file(db, "f2", minutes=2, room="r-bagno")
    repo = RoomRepository()

    room = await repo.ensure_default_room(PID)
    assert room.room_id == DEFAULT_ROOM_ID and room.label == "Generale"
    assert db.get_data("projects", PID, "files", "f1")["roomId"] == DEFAULT_ROOM_ID
    assert db.get_data("projects", PID, "files", "f2")["roomId"] == "r-bagno"  # never moved

    again = await repo.ensure_default_room(PID)  # concurrent/second call: same room
    assert again.room_id == DEFAULT_ROOM_ID
    assert [r.room_id for r in await repo.list_rooms(PID)] == [DEFAULT_ROOM_ID]


async def test_files_for_room_newest_first_and_latest_photo(db):
    _file(db, "old", minutes=1, room="r1")
    _file(db, "new", minutes=5, room="r1")
    _file(db, "render", minutes=9, type_="render", room="r1")
    _file(db, "other", minutes=7, room="r2")
    repo = RoomRepository()

    assert [f["id"] for f in await repo.files_for_room(PID, "r1")] == ["render", "new", "old"]
    assert [f["id"] for f in await repo.files_for_room(PID, "r1", file_type="image", limit=1)] == ["new"]
    assert (await repo.latest_room_photo(PID, "r1"))["id"] == "new"
    assert await repo.latest_room_photo(PID, "r3") is None


async def test_assign_file_to_room(db):
    repo = RoomRepository()
    room = await repo.create_room(PID, RoomCreate(label="Bagno", room_type="bagno"))
    _file(db, "f1", minutes=1)

    await repo.assign_file_to_room(PID, "f1", room.room_id)
    assert db.get_data("projects", PID, "files", "f1")["roomId"] == room.room_id
    with pytest.raises(RoomNotFoundError):
        await repo.assign_file_to_room(PID, "f1", "missing")
    with pytest.raises(ProjectFileNotFoundError):
        await repo.assign_file_to_room(PID, "missing", room.room_id)


async def test_find_file_by_storage_path(db):
    _file(db, "f1", minutes=1)
    found = await RoomRepository().find_file_by_storage_path(PID, f"user-uploads/{PID}/f1.jpg")
    assert found is not None and found["id"] == "f1"
    assert await RoomRepository().find_file_by_storage_path(PID, "user-uploads/x/y.jpg") is None


# ── Messages of a room ───────────────────────────────────────────────────────

async def test_room_context_filters_before_the_limit():
    """The old filter ran after `limit`: 3 newest messages from the kitchen left
    no bathroom message at all. The room is now a query filter."""
    db = FakeDb()
    for i, room in enumerate(["bagno", "bagno", "cucina", "cucina", "cucina"]):
        db.put("sessions", PID, "messages", f"m{i}", {
            "role": "user", "content": f"{room} {i}", "timestamp": T0 + timedelta(minutes=i),
            "metadata": {"room_id": room},
        })
    db.put("sessions", PID, "messages", "untagged", {"role": "user", "content": "x", "timestamp": T0})

    with patch("src.repositories.conversation_repository.get_async_firestore_client", return_value=db):
        bagno = await ConversationRepository().get_context(PID, limit=3, room_id="bagno")
        everything = await ConversationRepository().get_context(PID, limit=3)

    assert [m["id"] for m in bagno] == ["m0", "m1"]
    assert [m["id"] for m in everything] == ["m2", "m3", "m4"]


async def test_first_room_of_a_legacy_project_files_its_media_in_generale(db):
    """Code review: a POST before any listing left the existing files unfiled forever."""
    _file(db, "f1", minutes=1)
    room = await RoomRepository().create_room(PID, RoomCreate(label="Cucina", room_type="cucina"))

    assert db.get_data("projects", PID, "files", "f1")["roomId"] == DEFAULT_ROOM_ID
    assert {r.room_id for r in await RoomRepository().list_rooms(PID)} == {DEFAULT_ROOM_ID, room.room_id}


async def test_first_room_of_an_empty_project_comes_alone(db):
    room = await RoomRepository().create_room(PID, RoomCreate(label="Bagno", room_type="bagno"))
    assert [r.room_id for r in await RoomRepository().list_rooms(PID)] == [room.room_id]


# ── Room brief (Phase 138 PR-5) ──────────────────────────────────────────────

async def test_brief_is_written_only_if_the_room_did_not_change_meanwhile(db):
    from google.api_core.exceptions import FailedPrecondition
    from src.schemas.room import RoomBrief

    repo = RoomRepository()
    with patch.object(room_repository, "utc_now", return_value=T0):
        bagno = await repo.create_room(PID, RoomCreate(label="Bagno", room_type="bagno"))
    found = await repo.get_room_versioned(PID, bagno.room_id)
    assert found is not None
    room, version = found
    assert room == bagno and version == db.clock

    brief = RoomBrief(floor_mq=5.0, decisions=["doccia walk-in"])
    db.clock = T0 + timedelta(minutes=5)
    await repo.update_brief(PID, room.room_id, brief=brief, summary="Bagno 5 mq", expected_update_time=version)
    stored = await repo.get_room(PID, room.room_id)
    assert stored is not None and stored.brief == brief and stored.summary == "Bagno 5 mq"

    # A second write still based on the first read finds the room changed.
    with pytest.raises(FailedPrecondition):
        await repo.update_brief(PID, room.room_id, brief=RoomBrief(), summary=None, expected_update_time=version)
    assert (await repo.get_room(PID, room.room_id)).brief == brief


async def test_versioned_read_of_a_missing_room_is_none(db):
    assert await RoomRepository().get_room_versioned(PID, "missing") is None
