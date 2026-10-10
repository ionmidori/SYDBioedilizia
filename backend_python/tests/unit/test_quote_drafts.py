"""AI draft persistence never clobbers the admin's work (Phase 128).

Regression for quote_tools.py doing a plain `set()`: a second chat request
replaced admin-edited items and even reset approved quotes to `draft`.
"""
from datetime import UTC, datetime

import pytest
from src.schemas.quote import QuoteFinancials, QuoteItem, QuoteRequest, QuoteSchema
from src.services.quote_drafts import DraftSaveOutcome, apply_ai_draft
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

PID = "proj-123"
QUOTE_PATH = ("projects", PID, "private_data", "quote")
NOW = datetime(2026, 10, 10, 9, 30, tzinfo=UTC)


def _ai_quote(sku: str = "PAV-001", qty: float = 20.0) -> QuoteSchema:
    item = QuoteItem(sku=sku, description="Pavimento", unit="mq", qty=qty, unit_price=50.0, total=qty * 50)
    return QuoteSchema(
        project_id=PID,
        user_id="uid-1",
        items=[item],
        financials=QuoteFinancials(subtotal=qty * 50, vat_amount=qty * 11, grand_total=qty * 61),
    )


def _request(summary: str = "Rifacimento pavimento soggiorno") -> QuoteRequest:
    return QuoteRequest(summary=summary, channel="chat", session_id=PID)


async def _save(db: FakeDb, quote: QuoteSchema | None = None, request: QuoteRequest | None = None):
    return await apply_ai_draft(FakeTransaction(db), db, PID, quote or _ai_quote(), request or _request(), NOW)


async def test_first_draft_is_created_with_number_and_request():
    db = FakeDb()
    result = await _save(db)

    assert result.outcome is DraftSaveOutcome.CREATED
    assert result.quote_number == "PRV-2026-0001"
    doc = db.get_data(*QUOTE_PATH)
    assert doc["status"] == "draft"
    assert doc["doc_type"] == "quote"
    assert doc["version"] == 1
    assert (doc["quote_number"], doc["quote_year"], doc["quote_seq"]) == ("PRV-2026-0001", 2026, 1)
    assert doc["request"] == {"summary": "Rifacimento pavimento soggiorno", "channel": "chat", "session_id": PID}
    assert doc["created_at"] == NOW
    # The stored document is readable by the API schema (extra="forbid").
    QuoteSchema(**doc)


async def test_regenerating_a_draft_keeps_number_notes_and_creation_date():
    db = FakeDb()
    await _save(db)
    db.docs[QUOTE_PATH]["admin_notes"] = "Chiamare prima del sopralluogo"
    db.docs[QUOTE_PATH]["request"]["address"] = "Via Roma 1"

    later = _ai_quote(sku="PAV-002", qty=30.0)
    result = await apply_ai_draft(
        FakeTransaction(db), db, PID, later, _request("Pavimento e battiscopa"), datetime(2026, 10, 11, tzinfo=UTC)
    )

    assert result.outcome is DraftSaveOutcome.UPDATED
    assert result.quote_number == "PRV-2026-0001"
    doc = db.get_data(*QUOTE_PATH)
    assert [i["sku"] for i in doc["items"]] == ["PAV-002"]
    assert doc["version"] == 2
    assert doc["admin_notes"] == "Chiamare prima del sopralluogo"
    assert doc["created_at"] == NOW
    assert doc["request"]["summary"] == "Pavimento e battiscopa"
    assert doc["request"]["address"] == "Via Roma 1"  # dotted update, not a replace
    assert db.get_data("counters", "quote_2026")["next"] == 2  # no second number burnt


@pytest.mark.parametrize("status", ["pending_review", "in_review", "approved", "sent", "rejected"])
async def test_quote_owned_by_the_admin_is_never_written(status):
    db = FakeDb()
    original = {
        "status": status,
        "quote_number": "PRV-2026-0007",
        "items": [{"sku": "ADMIN-EDIT", "qty": 3}],
        "version": 5,
    }
    db.put(*QUOTE_PATH, original)
    tx = FakeTransaction(db)

    result = await apply_ai_draft(tx, db, PID, _ai_quote(), _request(), NOW)

    assert result.outcome is DraftSaveOutcome.SKIPPED
    assert result.status == status
    assert result.quote_number == "PRV-2026-0007"
    assert tx.writes == []
    assert db.get_data(*QUOTE_PATH) == original


async def test_legacy_draft_without_number_gets_one_on_update():
    db = FakeDb()
    db.put(*QUOTE_PATH, {"status": "draft", "items": [], "version": 1, "project_id": PID, "user_id": "uid-1"})

    result = await _save(db)

    assert result.outcome is DraftSaveOutcome.UPDATED
    assert result.quote_number == "PRV-2026-0001"
    assert db.get_data(*QUOTE_PATH)["quote_seq"] == 1


async def test_soft_deleted_quote_is_replaced_by_a_new_request_with_a_new_number():
    db = FakeDb()
    db.put("counters", "quote_2026", {"next": 8})
    db.put(*QUOTE_PATH, {"status": "deleted", "quote_number": "PRV-2026-0003", "admin_notes": "old"})

    result = await _save(db)

    assert result.outcome is DraftSaveOutcome.CREATED
    assert result.quote_number == "PRV-2026-0008"
    doc = db.get_data(*QUOTE_PATH)
    assert doc["status"] == "draft"
    assert "admin_notes" not in doc


async def test_numbers_are_sequential_across_projects():
    db = FakeDb()
    first = await apply_ai_draft(FakeTransaction(db), db, "p1", _ai_quote(), _request(), NOW)
    second = await apply_ai_draft(FakeTransaction(db), db, "p2", _ai_quote(), _request(), NOW)
    assert (first.quote_number, second.quote_number) == ("PRV-2026-0001", "PRV-2026-0002")
