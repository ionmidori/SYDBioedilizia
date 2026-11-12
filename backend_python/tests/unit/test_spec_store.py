"""Phase 140 step 3: one place for the intervention spec of every quote unit.

A room keeps it on its document; "Generale" before its room exists and the whole
chat of a project without rooms keep it in the project's private specs.
"""
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from src.repositories import room_repository, spec_store
from src.repositories.room_repository import RoomRepository
from src.repositories.spec_store import CHAT_SPEC_KEY, SpecStore
from src.schemas.intervention_spec import RoomInterventionSpec
from src.schemas.room import DEFAULT_ROOM_ID, RoomCreate
from tests.unit.firestore_fakes import FakeDb

PID = "proj1"
T0 = datetime(2026, 11, 12, tzinfo=UTC)
PROJECT_SPECS = ("projects", PID, "private_data", "intervention_specs")


@pytest.fixture()
def db() -> FakeDb:
    fake = FakeDb()
    with patch.object(room_repository, "get_async_firestore_client", return_value=fake), \
         patch.object(spec_store, "get_async_firestore_client", return_value=fake):
        yield fake


@pytest.fixture()
def store() -> SpecStore:
    return SpecStore(RoomRepository())


def _spec(mq: float, **fields: object) -> RoomInterventionSpec:
    return RoomInterventionSpec.model_validate({
        "measures": [{"name": "mq", "value": mq, "source": "confirmed"}],
        "library_version": "2.1.0",
        "generated_at": T0,
        **fields,
    })


async def test_room_spec_is_saved_on_the_room(db: FakeDb, store: SpecStore) -> None:
    bagno = await RoomRepository().create_room(PID, RoomCreate(label="Bagno", room_type="bagno"))
    await store.save(PID, bagno.room_id, _spec(8))

    room = await RoomRepository().get_room(PID, bagno.room_id)
    assert room is not None and room.intervention_spec == _spec(8)
    assert db.get_data(*PROJECT_SPECS) is None


async def test_generale_without_its_room_goes_to_the_project_specs(db: FakeDb, store: SpecStore) -> None:
    await store.save(PID, DEFAULT_ROOM_ID, _spec(8))
    assert db.get_data(*PROJECT_SPECS) == {DEFAULT_ROOM_ID: _spec(8).model_dump()}


async def test_generale_with_its_room_goes_to_the_room(db: FakeDb, store: SpecStore) -> None:
    await RoomRepository().ensure_default_room(PID)
    await store.save(PID, DEFAULT_ROOM_ID, _spec(8))

    room = await RoomRepository().get_room(PID, DEFAULT_ROOM_ID)
    assert room is not None and room.intervention_spec == _spec(8)
    assert db.get_data(*PROJECT_SPECS) is None


async def test_a_project_spec_is_replaced_whole_and_alone(db: FakeDb, store: SpecStore) -> None:
    await store.save(PID, DEFAULT_ROOM_ID, _spec(5))
    await store.save(PID, CHAT_SPEC_KEY, _spec(6, conflicts={"mq_pareti": [10.0, 14.0]}))
    await store.save(PID, CHAT_SPEC_KEY, _spec(7))

    assert db.get_data(*PROJECT_SPECS) == {
        DEFAULT_ROOM_ID: _spec(5).model_dump(),
        CHAT_SPEC_KEY: _spec(7).model_dump(),  # no conflict left from the earlier save
    }


async def test_load_all_joins_rooms_and_project_specs(db: FakeDb, store: SpecStore) -> None:
    rooms = RoomRepository()
    bagno = await rooms.create_room(PID, RoomCreate(label="Bagno", room_type="bagno"))
    await rooms.create_room(PID, RoomCreate(label="Cucina", room_type="cucina"))  # no spec yet
    await store.save(PID, bagno.room_id, _spec(6))
    await store.save(PID, DEFAULT_ROOM_ID, _spec(9))
    await store.save(PID, CHAT_SPEC_KEY, _spec(40))

    assert await store.load_all(PID) == {bagno.room_id: _spec(6), DEFAULT_ROOM_ID: _spec(9), CHAT_SPEC_KEY: _spec(40)}


async def test_the_generale_room_wins_over_the_project_copy(db: FakeDb, store: SpecStore) -> None:
    await store.save(PID, DEFAULT_ROOM_ID, _spec(9))  # before the room existed
    await RoomRepository().ensure_default_room(PID)
    await store.save(PID, DEFAULT_ROOM_ID, _spec(12))

    assert await store.load_all(PID) == {DEFAULT_ROOM_ID: _spec(12)}


async def test_an_unreadable_stored_spec_is_skipped(
    db: FakeDb, store: SpecStore, caplog: pytest.LogCaptureFixture
) -> None:
    db.put(*PROJECT_SPECS, {CHAT_SPEC_KEY: {"measures": "not a list"}, DEFAULT_ROOM_ID: _spec(9).model_dump()})

    assert await store.load_all(PID) == {DEFAULT_ROOM_ID: _spec(9)}
    assert "Stored intervention spec not readable" in caplog.text
    assert PID not in caplog.text


async def test_load_all_of_an_empty_project(db: FakeDb, store: SpecStore) -> None:
    assert await store.load_all(PID) == {}
