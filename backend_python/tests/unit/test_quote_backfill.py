"""Fase 2 backfill (src/services/quote_backfill.py): numbers and dossier for
quotes created before Phase 128, only missing fields, journaled, undoable."""
from datetime import UTC, datetime

from src.schemas.quote import ClientSnapshot, QuoteSchema
from src.services.quote_backfill import QuotePlan, apply_plan, compute_updates, plan_all, undo_all
from src.services.quote_dossier import BlobInfo, DossierInputs, build_media
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

JUL = datetime(2026, 7, 23, 10, tzinfo=UTC)
OCT = datetime(2026, 10, 9, 10, tzinfo=UTC)
ITEM = {
    "sku": "PIT-001",
    "description": "Pittura",
    "unit": "mq",
    "qty": 10.0,
    "unit_price": 12.0,
    "total": 120.0,
    "manual_override": False,
}
FIN = {"subtotal": 120.0, "vat_rate": 0.22, "vat_amount": 26.4, "grand_total": 146.4}


def _quote_path(pid: str) -> tuple[str, ...]:
    return ("projects", pid, "private_data", "quote")


def _seed(db: FakeDb) -> None:
    # Legacy approved quote of a guest (July) and legacy pending one (October).
    db.put("projects", "p-jul", {"userId": "guest_abcd"})
    db.put(
        *_quote_path("p-jul"),
        {
            "status": "approved",
            "items": [ITEM],
            "financials": FIN,
            "created_at": JUL,
            "project_id": "p-jul",
            "user_id": "guest_abcd",
            "admin_notes": "ok",
            "pdf_url": "x",
        },
    )
    db.put("projects", "p-oct", {"userId": "uid-1"})
    db.put(
        *_quote_path("p-oct"),
        {"status": "pending_review", "items": [ITEM], "financials": FIN, "created_at": OCT, "updated_at": OCT, "version": 1},
    )
    # Already numbered by the new pipeline: counter at 2.
    new = QuoteSchema(
        project_id="p-new",
        user_id="uid-1",
        items=[ITEM],
        financials=FIN,
        quote_number="PRV-2026-0001",
        quote_year=2026,
        quote_seq=1,
        created_at=datetime(2026, 10, 10, tzinfo=UTC),
        request={"summary": "Cucina", "session_id": "p-new"},
        client_snapshot={"uid": "uid-1", "email": "a@b.it"},
        media=[{"media_id": "m1", "kind": "input_photo", "blob_path": "user-uploads/p-new/a.jpg", "label": "Foto 1"}],
        search_keys=["prv-2026-0001"],
    )
    db.put("projects", "p-new", {"userId": "uid-1"})
    db.put(*_quote_path("p-new"), new.model_dump(exclude_none=True))
    db.put(*_quote_path("p-new"), "revisions", "1", {"version": 1})
    db.put("counters", "quote_2026", {"next": 2})
    # Seed/test data that can never validate.
    db.put("projects", "proj_test", {"userId": "test_user_123"})
    db.put(
        *_quote_path("proj_test"),
        {"status": "pending_review", "items": [{"name": "x", "total": 1}], "financials": FIN, "created_at": JUL},
    )
    db.put("projects", "p-del", {"userId": "uid-1"})
    db.put(*_quote_path("p-del"), {"status": "deleted", "created_at": JUL})


async def _gather(db, pid, uid, now):
    snap = ClientSnapshot(uid=uid, display_name="Mario Rossi", email="m@example.it", captured_at=now)
    media = build_media([BlobInfo(f"user-uploads/{pid}/a.jpg", "image/jpeg", JUL)], pid, {})
    return DossierInputs(client_snapshot=snap, request_details={"address": "Via Roma 1"}, media=media)


async def _plans(db: FakeDb) -> list[QuotePlan]:
    return await plan_all(db, now=OCT, gather=_gather)


async def _apply(db: FakeDb, plan: QuotePlan) -> str | None:
    return await apply_plan(FakeTransaction(db), db, plan, OCT)


async def _apply_all(db: FakeDb) -> list[str | None]:
    return [await _apply(db, p) for p in await _plans(db) if p.action == "backfill"]


async def test_plan_classifies_every_quote_and_writes_nothing():
    db = FakeDb()
    _seed(db)
    plans = {p.project_id: p for p in await _plans(db)}

    assert plans["p-jul"].action == "backfill" and plans["p-jul"].needs_number
    assert plans["p-oct"].action == "backfill"
    assert plans["p-new"].action == "ok"
    assert plans["proj_test"].action == "invalid"
    assert any("items" in issue for issue in plans["proj_test"].issues)
    assert plans["p-del"].action == "skip"
    assert "quote_number" not in db.get_data(*_quote_path("p-jul"))


def test_only_missing_fields_are_added():
    quote = {"status": "approved", "admin_notes": "keep", "user_id": "u", "request": {"summary": "s"}}
    updates = compute_updates("p1", quote, {"userId": "other"}, DossierInputs())
    assert "user_id" not in updates and "admin_notes" not in updates and "request" not in updates
    assert updates["project_id"] == "p1" and updates["doc_type"] == "quote"


def test_legacy_delivered_status_becomes_sent_and_delivered():
    updates = compute_updates("p1", {"status": "delivered"}, {}, DossierInputs())
    assert updates["status"] == "sent" and updates["delivery_status"] == "delivered"


async def test_apply_numbers_after_existing_ones_in_creation_order_and_journals():
    db = FakeDb()
    _seed(db)
    assert await _apply_all(db) == ["PRV-2026-0002", "PRV-2026-0003"]  # July first, then October

    jul = db.get_data(*_quote_path("p-jul"))
    assert jul["admin_notes"] == "ok" and jul["status"] == "approved" and jul["pdf_url"] == "x"
    assert jul["client_snapshot"]["display_name"] == "Mario Rossi"
    assert jul["request"] == {"session_id": "p-jul", "address": "Via Roma 1"}
    assert [m["label"] for m in jul["media"]] == ["Foto 1"]
    assert "mario" in jul["search_keys"]
    QuoteSchema(**jul)  # readable by the API

    revision = db.get_data(*_quote_path("p-jul"), "revisions", "1")
    assert revision["actor_kind"] == "system" and revision["admin_notes"] == "ok"
    journal = db.get_data("migrations", "quote_dossier_backfill", "entries", "p-jul")
    assert journal["quote_number"] == "PRV-2026-0002" and journal["revision_created"] is True

    assert db.get_data(*_quote_path("proj_test"))["items"] == [{"name": "x", "total": 1}]
    assert db.get_data(*_quote_path("p-new"))["quote_number"] == "PRV-2026-0001"


async def test_second_run_is_a_no_op():
    db = FakeDb()
    _seed(db)
    await _apply_all(db)
    assert [p.project_id for p in await _plans(db) if p.action == "backfill"] == []


async def test_concurrent_numbering_is_never_overwritten():
    db = FakeDb()
    _seed(db)
    plan = next(p for p in await _plans(db) if p.project_id == "p-oct")
    db.docs[_quote_path("p-oct")]["quote_number"] = "PRV-2026-0009"  # numbered meanwhile

    assert await _apply(db, plan) == "PRV-2026-0009"
    assert db.get_data("counters", "quote_2026")["next"] == 2  # no number burnt


async def test_undo_removes_exactly_what_was_added():
    db = FakeDb()
    _seed(db)
    before = db.get_data(*_quote_path("p-jul"))
    await _apply_all(db)

    assert await undo_all(db) == 2
    assert db.get_data(*_quote_path("p-jul")) == before
    assert db.get_data(*_quote_path("p-jul"), "revisions", "1") is None
    assert db.get_data("migrations", "quote_dossier_backfill", "entries", "p-jul") is None
    assert db.get_data(*_quote_path("p-new"))["quote_number"] == "PRV-2026-0001"
