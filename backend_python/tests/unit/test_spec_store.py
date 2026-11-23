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
from src.repositories.spec_store import CHAT_SPEC_KEY, SpecStore, spec_fingerprint
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


# ── Phase 140 seguiti T4: the card's races ────────────────────────────────────


class _QuoteTaken(Exception):
    pass


async def test_a_failing_guard_writes_nothing(db: FakeDb, store: SpecStore) -> None:
    """The card's check that the quote is still the client's runs in the write's
    transaction, before the spec is read: when it fails nothing is written."""
    bagno = await RoomRepository().create_room(PID, RoomCreate(label="Bagno", room_type="bagno"))
    await _put(store, bagno.room_id, _spec(6))
    seen: list[FakeTransaction] = []

    async def guard(transaction: FakeTransaction) -> None:
        seen.append(transaction)
        raise _QuoteTaken

    with pytest.raises(_QuoteTaken):
        await store.update(PID, bagno.room_id, lambda _current: _spec(9), guard=guard)

    room = await RoomRepository().get_room(PID, bagno.room_id)
    assert room is not None and room.intervention_spec == _spec(6)
    assert len(seen) == 1 and seen[0].writes == []


async def test_a_passing_guard_reads_before_the_spec(db: FakeDb, store: SpecStore) -> None:
    order: list[str] = []

    async def guard(transaction: FakeTransaction) -> None:
        order.append(f"guard after {len(transaction.reads)} reads")

    await store.update(PID, CHAT_SPEC_KEY, lambda _current: _spec(9), guard=guard)
    assert order == ["guard after 0 reads"]
    assert await store.load_all(PID) == {CHAT_SPEC_KEY: _spec(9)}


async def test_load_all_reads_in_the_transaction(db: FakeDb, store: SpecStore) -> None:
    bagno = await RoomRepository().create_room(PID, RoomCreate(label="Bagno", room_type="bagno"))
    await _put(store, bagno.room_id, _spec(6))
    await _put(store, CHAT_SPEC_KEY, _spec(40))
    transaction = FakeTransaction(db)

    specs = await store.load_all(PID, transaction=transaction)

    assert specs == {bagno.room_id: _spec(6), CHAT_SPEC_KEY: _spec(40)}
    assert set(transaction.reads) == {PROJECT_SPECS, ("projects", PID, "rooms")}


def test_the_fingerprint_follows_the_specs_not_their_order() -> None:
    one = {"bagno1": _spec(6), CHAT_SPEC_KEY: _spec(40)}
    same = {CHAT_SPEC_KEY: _spec(40), "bagno1": _spec(6)}
    assert spec_fingerprint(one) == spec_fingerprint(same)
    assert spec_fingerprint(one) != spec_fingerprint({**one, "bagno1": _spec(7)})
    assert spec_fingerprint(one) != spec_fingerprint({"bagno1": _spec(6)})
    assert spec_fingerprint({}) == spec_fingerprint({})


# ── Archived by the client (PR 3 of the card fixes, D7) ───────────────────────

async def _archived_room(store: SpecStore, label: str = "Bagno") -> str:
    room = await RoomRepository().create_room(PID, RoomCreate(label=label, room_type="bagno"))
    await _put(store, room.room_id, _spec(8))
    with patch.object(room_repository, "utc_now", return_value=T0 + timedelta(hours=1)):
        await RoomRepository().reset_brief(PID, room.room_id)
    return room.room_id


async def test_an_archived_room_spec_is_out_of_the_card_and_the_draft(db: FakeDb, store: SpecStore) -> None:
    bagno = await _archived_room(store)
    cucina = await RoomRepository().create_room(PID, RoomCreate(label="Cucina", room_type="cucina"))
    await _put(store, cucina.room_id, _spec(12))

    assert set(await store.load_all(PID)) == {cucina.room_id}
    # The team keeps it.
    assert (await store.load_all(PID, include_archived=True))[bagno] == _spec(8)


async def test_a_new_analysis_starts_the_archived_room_again_without_its_old_confirmations(
    db: FakeDb, store: SpecStore
) -> None:
    bagno = await _archived_room(store)
    seen: list[RoomInterventionSpec | None] = []

    def change(current: RoomInterventionSpec | None) -> RoomInterventionSpec:
        seen.append(current)
        return _spec(6)

    assert await store.update(PID, bagno, change) == _spec(6)
    assert seen == [None]  # the client restarted the room: what it confirmed before does not count
    assert db.get_data("projects", PID, "rooms", bagno)["cleared_at"] is None
    assert (await store.load_all(PID))[bagno] == _spec(6)


async def test_an_archived_generale_room_hides_its_project_copy_too(db: FakeDb, store: SpecStore) -> None:
    await _put(store, DEFAULT_ROOM_ID, _spec(20))  # before its room exists: the project copy
    db.put("projects", PID, "rooms", DEFAULT_ROOM_ID, {
        "room_id": DEFAULT_ROOM_ID, "label": "Generale", "room_type": "altro", "created_at": T0, "updated_at": T0,
    })
    with patch.object(room_repository, "utc_now", return_value=T0):
        await RoomRepository().reset_all_briefs(PID)

    assert DEFAULT_ROOM_ID not in await store.load_all(PID)


async def test_the_chat_of_a_project_without_rooms_is_archived_in_the_project_specs(
    db: FakeDb, store: SpecStore
) -> None:
    await _put(store, CHAT_SPEC_KEY, _spec(7))
    await store.archive_project_specs(PID, now=T0)

    assert await store.load_all(PID) == {}
    assert (await store.load_all(PID, include_archived=True))[CHAT_SPEC_KEY] == _spec(7)

    seen: list[RoomInterventionSpec | None] = []
    await store.update(PID, CHAT_SPEC_KEY, lambda current: seen.append(current) or _spec(9))
    assert seen == [None]
    assert (await store.load_all(PID))[CHAT_SPEC_KEY] == _spec(9)


async def test_archiving_an_empty_project_writes_nothing_harmful(db: FakeDb, store: SpecStore) -> None:
    await store.archive_project_specs(PID, now=T0)
    assert await store.load_all(PID) == {}
