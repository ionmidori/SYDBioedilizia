"""BatchWriter: queued Firestore writes committed in bounded batches, in order."""
import pytest
from src.db import batching
from src.db.batching import BatchWriter
from tests.unit.firestore_fakes import FakeDb


def _ref(db: FakeDb, doc_id: str):
    return db.collection("c").document(doc_id)


async def test_commits_every_full_batch_and_the_rest_on_exit(monkeypatch):
    monkeypatch.setattr(batching, "WRITE_BATCH_SIZE", 2)
    db = FakeDb()

    async with BatchWriter(db) as writer:
        for i in range(5):
            await writer.set(_ref(db, f"d{i}"), {"n": i})

    assert db.batches == 3  # 2 + 2 + 1
    assert writer.written == 5
    assert [db.get_data("c", f"d{i}") for i in range(5)] == [{"n": i} for i in range(5)]


async def test_update_merge_and_delete():
    db = FakeDb()
    db.put("c", "a", {"x": 1, "y": 1})
    db.put("c", "b", {"x": 1})

    async with BatchWriter(db) as writer:
        await writer.update(_ref(db, "a"), {"x": 2})
        await writer.set(_ref(db, "c"), {"z": 1}, merge=True)
        await writer.delete(_ref(db, "b"))

    assert db.get_data("c", "a") == {"x": 2, "y": 1}
    assert db.get_data("c", "c") == {"z": 1}
    assert db.get_data("c", "b") is None


async def test_nothing_queued_opens_no_batch():
    db = FakeDb()
    async with BatchWriter(db):
        pass
    assert db.batches == 0


async def test_an_error_inside_the_block_drops_the_pending_batch(monkeypatch):
    monkeypatch.setattr(batching, "WRITE_BATCH_SIZE", 2)
    db = FakeDb()

    with pytest.raises(RuntimeError):
        async with BatchWriter(db) as writer:
            for i in range(3):
                await writer.set(_ref(db, f"d{i}"), {"n": i})
            raise RuntimeError("boom")

    # The full batch was committed; the half-filled one is not.
    assert db.get_data("c", "d0") == {"n": 0}
    assert db.get_data("c", "d1") == {"n": 1}
    assert db.get_data("c", "d2") is None
