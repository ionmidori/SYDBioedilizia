"""Phase 140 step 3: one place for the intervention spec of every quote unit.

A room keeps it on its document; "Generale" before its room exists and the whole
chat of a project without rooms keep it in the project's private specs. A write
re-reads the stored spec in its transaction: a confirmation made meanwhile is
never lost, and a spec that does not read is never overwritten.
"""
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from google.api_core.exceptions import NotFound
from src.db import transactions
from src.repositories import room_repository, spec_store
from src.repositories.room_repository import RoomRepository
from src.repositories.spec_store import CHAT_SPEC_KEY, SpecStore
from src.schemas.intervention_spec import RoomInterventionSpec
from src.schemas.room import DEFAULT_ROOM_ID, RoomBrief, RoomCreate, RoomUpdate
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

PID = "proj1"
T0 = datetime(2026, 11, 12, tzinfo=UTC)
PROJECT_SPECS = ("projects", PID, "private_data", "intervention_specs")


@pytest.fixture()
def db(monkeypatch: pytest.MonkeyPatch) -> FakeDb:
    fake = FakeDb()

    async def transact(_db: FakeDb, body):
        return await body(FakeTransaction(fake))

    monkeypatch.setattr(transactions, "run_transaction", transact)
    with patch.object(room_repository, "get_async_firestore_client", return_value=fake), \
         patch.object(spec_store, "get_async_firestore_client", return_value=fake):
        yield fake


@pytest.fixture()
def store() -> SpecStore:
    return SpecStore()


def _spec(mq: float, **fields: object) -> RoomInterventionSpec:
    return RoomInterventionSpec.model_validate({
        "measures": [{"name": "mq", "value": mq, "source": "confirmed"}],
        "library_version": "2.1.0",
        "generated_at": T0,
        **fields,
    })


async def _put(store: SpecStore, key: str, spec: RoomInterventionSpec) -> RoomInterventionSpec | None:
    return await store.update(PID, key, lambda _current: spec)


async def test_room_spec_is_saved_on_the_room(db: FakeDb, store: SpecStore) -> None:
    bagno = await RoomRepository().create_room(PID, RoomCreate(label="Bagno", room_type="bagno"))
    assert await _put(store, bagno.room_id, _spec(8)) == _spec(8)

    room = await RoomRepository().get_room(PID, bagno.room_id)
    assert room is not None and room.intervention_spec == _spec(8)
    assert db.get_data(*PROJECT_SPECS) is None


async def test_the_room_write_touches_only_its_field(db: FakeDb, store: SpecStore) -> None:
    """The quote tool and the background brief refresh write the same document:
    the spec write leaves brief and summary as they are."""
    repo = RoomRepository()
    with patch.object(room_repository, "utc_now", return_value=T0):
        bagno = await repo.create_room(PID, RoomCreate(label="Bagno", room_type="bagno"))
    _, version = await repo.get_room_versioned(PID, bagno.room_id)
    await repo.update_brief(PID, bagno.room_id, brief=RoomBrief(floor_mq=5.0), summary="Bagno 5 mq",
                            expected_update_time=version)
    before = db.get_data("projects", PID, "rooms", bagno.room_id)

    later = T0 + timedelta(hours=1)
    with patch.object(spec_store, "utc_now", return_value=later):
        await _put(store, bagno.room_id, _spec(6))

    after = db.get_data("projects", PID, "rooms", bagno.room_id)
    assert after is not None and before is not None
    assert {k for k in after if after.get(k) != before.get(k)} == {"intervention_spec", "updated_at"}
    assert after["updated_at"] == later


async def test_the_room_spec_survives_a_rename_and_a_brief_refresh(db: FakeDb, store: SpecStore) -> None:
    repo = RoomRepository()
    bagno = await repo.create_room(PID, RoomCreate(label="Bagno", room_type="bagno"))
    await _put(store, bagno.room_id, _spec(6))

    await repo.update_room(PID, bagno.room_id, RoomUpdate(label="Bagno grande"))
    _, version = await repo.get_room_versioned(PID, bagno.room_id)
    await repo.update_brief(PID, bagno.room_id, brief=RoomBrief(floor_mq=7.0), summary=None,
                            expected_update_time=version)

    room = await repo.get_room(PID, bagno.room_id)
    assert room is not None and room.label == "Bagno grande" and room.intervention_spec == _spec(6)


async def test_an_unknown_room_is_not_found(db: FakeDb, store: SpecStore) -> None:
    with pytest.raises(NotFound):
        await _put(store, "deleted1", _spec(8))
    assert db.get_data(*PROJECT_SPECS) is None


async def test_generale_without_its_room_goes_to_the_project_specs(db: FakeDb, store: SpecStore) -> None:
    await _put(store, DEFAULT_ROOM_ID, _spec(8))
    assert db.get_data(*PROJECT_SPECS) == {DEFAULT_ROOM_ID: _spec(8).model_dump()}


async def test_generale_with_its_room_goes_to_the_room(db: FakeDb, store: SpecStore) -> None:
    await RoomRepository().ensure_default_room(PID)
    await _put(store, DEFAULT_ROOM_ID, _spec(8))

    room = await RoomRepository().get_room(PID, DEFAULT_ROOM_ID)
    assert room is not None and room.intervention_spec == _spec(8)
    assert db.get_data(*PROJECT_SPECS) is None


async def test_a_project_spec_is_replaced_whole_and_alone(db: FakeDb, store: SpecStore) -> None:
    await _put(store, DEFAULT_ROOM_ID, _spec(5))
    await _put(store, CHAT_SPEC_KEY, _spec(6, conflicts={"mq_pareti": [10.0, 14.0]}))
    await _put(store, CHAT_SPEC_KEY, _spec(7))

    assert db.get_data(*PROJECT_SPECS) == {
        DEFAULT_ROOM_ID: _spec(5).model_dump(),
        CHAT_SPEC_KEY: _spec(7).model_dump(),  # no conflict left from the earlier save
    }


async def test_the_change_reads_the_spec_stored_now(db: FakeDb, store: SpecStore) -> None:
    """A confirmation written while the model was analysing is what the change sees."""
    bagno = await RoomRepository().create_room(PID, RoomCreate(label="Bagno", room_type="bagno"))
    await _put(store, bagno.room_id, _spec(9))
    seen: list[RoomInterventionSpec | None] = []

    def change(current: RoomInterventionSpec | None) -> RoomInterventionSpec:
        seen.append(current)
        return _spec(10)

    await store.update(PID, bagno.room_id, change)
    assert seen == [_spec(9)]


async def test_generale_reads_its_project_copy_until_the_room_has_one(db: FakeDb, store: SpecStore) -> None:
    await _put(store, DEFAULT_ROOM_ID, _spec(9))  # before the room existed
    await RoomRepository().ensure_default_room(PID)
    seen: list[RoomInterventionSpec | None] = []

    def change(current: RoomInterventionSpec | None) -> RoomInterventionSpec:
        seen.append(current)
        return _spec(12)

    await store.update(PID, DEFAULT_ROOM_ID, change)
    await store.update(PID, DEFAULT_ROOM_ID, change)
    assert seen == [_spec(9), _spec(12)]
    assert await store.load_all(PID) == {DEFAULT_ROOM_ID: _spec(12)}


async def test_an_unreadable_stored_spec_is_never_overwritten(
    db: FakeDb, store: SpecStore, caplog: pytest.LogCaptureFixture
) -> None:
    """E.g. a newer format read by the previous revision during a rollout: its
    confirmations would be lost."""
    unreadable = {"measures": "not a list"}
    db.put(*PROJECT_SPECS, {CHAT_SPEC_KEY: unreadable})

    assert await _put(store, CHAT_SPEC_KEY, _spec(8)) is None
    assert db.get_data(*PROJECT_SPECS) == {CHAT_SPEC_KEY: unreadable}
    assert "Stored intervention spec not readable" in caplog.text


async def test_load_all_joins_rooms_and_project_specs(db: FakeDb, store: SpecStore) -> None:
    rooms = RoomRepository()
    bagno = await rooms.create_room(PID, RoomCreate(label="Bagno", room_type="bagno"))
    await rooms.create_room(PID, RoomCreate(label="Cucina", room_type="cucina"))  # no spec yet
    await _put(store, bagno.room_id, _spec(6))
    await _put(store, DEFAULT_ROOM_ID, _spec(9))
    await _put(store, CHAT_SPEC_KEY, _spec(40))

    assert await store.load_all(PID) == {bagno.room_id: _spec(6), DEFAULT_ROOM_ID: _spec(9), CHAT_SPEC_KEY: _spec(40)}


async def test_load_all_skips_an_unreadable_spec(
    db: FakeDb, store: SpecStore, caplog: pytest.LogCaptureFixture
) -> None:
    db.put(*PROJECT_SPECS, {CHAT_SPEC_KEY: {"measures": "not a list"}, DEFAULT_ROOM_ID: _spec(9).model_dump()})

    assert await store.load_all(PID) == {DEFAULT_ROOM_ID: _spec(9)}
    assert "Stored intervention spec not readable" in caplog.text
    assert PID not in caplog.text


async def test_load_all_of_an_empty_project(db: FakeDb, store: SpecStore) -> None:
    assert await store.load_all(PID) == {}
