"""scripts/repair_project_projections.py — repairs dashboard projects whose
`projects/{id}` projection had no owner (quote submission rejected them)."""
import importlib.util
from datetime import UTC, datetime
from pathlib import Path

from tests.unit.firestore_fakes import FakeDb

_SPEC = importlib.util.spec_from_file_location(
    "repair_project_projections",
    Path(__file__).resolve().parents[2] / "scripts" / "repair_project_projections.py",
)
assert _SPEC and _SPEC.loader
repair = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(repair)

T0 = datetime(2026, 10, 10, 14, 6, tzinfo=UTC)
SESSION = {"userId": "uid-1", "title": "Cucina", "createdAt": T0, "updatedAt": T0, "is_deleted": False}


def test_projection_without_owner_gets_only_the_missing_fields():
    action, fields = repair.plan_repair("p1", SESSION, {"thumbnailUrl": "https://x", "updatedAt": T0})
    assert action == "repair"
    assert fields == {"id": "p1", "name": "Cucina", "userId": "uid-1", "createdAt": T0, "status": "active"}


def test_complete_projection_is_left_alone():
    projection = {"id": "p1", "name": "Bagno", "userId": "uid-1", "createdAt": T0, "updatedAt": T0, "status": "active"}
    assert repair.plan_repair("p1", SESSION, projection) == ("ok", {})


def test_different_owner_is_a_conflict_never_overwritten():
    assert repair.plan_repair("p1", SESSION, {"userId": "someone-else"}) == ("conflict", {})


def test_deleted_or_ownerless_sessions_are_skipped():
    assert repair.plan_repair("p1", {**SESSION, "is_deleted": True}, None)[0] == "skip"
    assert repair.plan_repair("p1", {"title": "x"}, None)[0] == "skip"


async def test_dry_run_writes_nothing_apply_repairs():
    db = FakeDb()
    db.put("sessions", "p1", SESSION)
    db.put("projects", "p1", {"thumbnailUrl": "https://x"})

    counts = await repair.run(db, apply=False)
    assert counts["repair"] == 1
    assert db.get_data("projects", "p1") == {"thumbnailUrl": "https://x"}

    await repair.run(db, apply=True)
    projection = db.get_data("projects", "p1")
    assert projection["userId"] == "uid-1"
    assert projection["thumbnailUrl"] == "https://x"  # merge, nothing lost
    assert (await repair.run(db, apply=False))["repair"] == 0  # idempotent
