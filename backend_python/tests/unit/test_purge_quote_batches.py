"""scripts/purge_quote_batches.py — removes the quote batches (Phase 138 PR-4)
only when no project is reachable by the GDPR erasure solely through a batch."""
import importlib.util
from pathlib import Path

import pytest
from tests.unit.firestore_fakes import FakeDb

_SPEC = importlib.util.spec_from_file_location(
    "purge_quote_batches",
    Path(__file__).resolve().parents[2] / "scripts" / "purge_quote_batches.py",
)
assert _SPEC and _SPEC.loader
purge = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(purge)

UID = "uid-1"


def _batch(db: FakeDb, batch_id: str, *project_ids: str, uid: str = UID) -> None:
    db.put("quote_batches", batch_id, {"user_id": uid, "projects": [{"project_id": p} for p in project_ids]})


def _quote(db: FakeDb, project_id: str, batch_id: str | None) -> None:
    request = {"summary": "Bagno", **({"batch_id": batch_id} if batch_id else {})}
    db.put("projects", project_id, "private_data", "quote", {"doc_type": "quote", "request": request})


async def test_owned_projects_are_purged_with_their_batch_id():
    db = FakeDb()
    db.put("projects", "p1", {"userId": UID})
    db.put("sessions", "p2", {"userId": UID})
    _batch(db, "b1", "p1", "p2")
    _quote(db, "p1", "b1")
    _quote(db, "p2", None)

    plan = await purge.plan_purge(db)
    assert plan.batch_ids == ["b1"] and plan.only_via_batch == []
    assert len(plan.quote_refs) == 1

    await purge.apply_purge(db, plan)
    assert db.get_data("quote_batches", "b1") is None
    assert db.get_data("projects", "p1", "private_data", "quote")["request"] == {"summary": "Bagno"}


async def test_a_quote_left_by_an_already_deleted_batch_is_cleared_too():
    db = FakeDb()
    db.put("projects", "p-old", "private_data", "quote",
           {"doc_type": "quote", "updated_at": "2026-10-10T09:00:00Z", "request": {"batch_id": "gone"}})

    plan = await purge.plan_purge(db)
    assert plan.batch_ids == [] and len(plan.quote_refs) == 1
    await purge.apply_purge(db, plan)
    assert db.get_data("projects", "p-old", "private_data", "quote")["request"] == {}


async def test_a_project_reachable_through_a_lead_or_owned_by_someone_else_does_not_block():
    db = FakeDb()
    db.put("leads", "l1", {"uid": UID, "session_id": "p-lead"})
    db.put("projects", "p-other", {"userId": "someone-else"})
    _batch(db, "b1", "p-lead", "p-other")
    assert (await purge.plan_purge(db)).only_via_batch == []


@pytest.mark.parametrize("owner", [None, "guest_abc"])
async def test_a_project_reachable_only_through_the_batch_blocks_the_purge(owner):
    db = FakeDb()
    db.put("sessions", "p-guest", {"userId": owner} if owner else {"title": "Cucina"})
    _batch(db, "b1", "p-guest")

    plan = await purge.plan_purge(db)
    assert plan.only_via_batch == [(UID, "p-guest")]
    with pytest.raises(RuntimeError):
        await purge.apply_purge(db, plan)
    assert db.get_data("quote_batches", "b1") is not None


async def test_dry_run_writes_nothing(monkeypatch, capsys):
    db = FakeDb()
    db.put("projects", "p1", {"userId": UID})
    _batch(db, "b1", "p1")
    monkeypatch.setattr(purge, "get_async_firestore_client", lambda: db)
    assert await purge._run(apply=False) == 0
    assert db.get_data("quote_batches", "b1") is not None
    assert "Dry run" in capsys.readouterr().out
