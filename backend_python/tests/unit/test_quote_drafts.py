"""AI draft persistence never clobbers the admin's work (Phase 128).

Regression for quote_tools.py doing a plain `set()`: a second chat request
replaced admin-edited items and even reset approved quotes to `draft`.
"""
from datetime import UTC, datetime

import pytest
from src.schemas.intervention_spec import RoomInterventionSpec, StoredMeasure, StoredPackage
from src.schemas.price_range import PriceEstimate
from src.schemas.quote import (
    ManualWorkItem,
    QuoteAiWarning,
    QuoteFinancials,
    QuoteItem,
    QuoteRequest,
    QuoteRevision,
    QuoteSchema,
    RevisionRoomSpec,
)
from src.services.quote_drafts import DraftSaveOutcome, QuoteStatusView, apply_ai_draft, read_quote_status
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
    assert doc["request"] == {
        "summary": "Rifacimento pavimento soggiorno", "channel": "chat", "session_id": PID,
        "manual_work": [], "ai_warnings": [],
    }
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


@pytest.mark.parametrize(
    "status,delivery",
    [("pending_review", None), ("in_review", None), ("approved", None), ("delivered", None), ("sent", "queued")],
)
async def test_quote_the_team_is_working_on_is_never_written(status, delivery):
    db = FakeDb()
    original = {
        "status": status,
        "quote_number": "PRV-2026-0007",
        "items": [{"sku": "ADMIN-EDIT", "qty": 3}],
        "version": 5,
    }
    if delivery:
        original["delivery_status"] = delivery
    db.put(*QUOTE_PATH, original)
    tx = FakeTransaction(db)

    result = await apply_ai_draft(tx, db, PID, _ai_quote(), _request(), NOW)

    assert result.outcome is DraftSaveOutcome.WITH_THE_TEAM
    assert result.status == status
    assert result.quote_number == "PRV-2026-0007"
    assert result.version == 5
    assert tx.writes == []
    assert db.get_data(*QUOTE_PATH) == original


SENT_AT = datetime(2026, 10, 5, 8, 0, tzinfo=UTC)


def _seed_sent(db: FakeDb, status: str = "sent") -> dict:
    sent = {
        "project_id": PID,
        "user_id": "uid-1",
        "doc_type": "quote",
        "status": status,
        "quote_number": "PRV-2026-0007",
        "quote_year": 2026,
        "quote_seq": 7,
        "version": 3,
        "items": [
            {"sku": "PAV-001", "description": "Pavimento", "unit": "mq", "qty": 20.0, "unit_price": 55.0,
             "total": 1100.0, "manual_override": True},
        ],
        "financials": {"subtotal": 1100.0, "vat_rate": 0.22, "vat_amount": 242.0, "grand_total": 1342.0},
        "admin_notes": "Sopralluogo fatto",
        "admin_decision": "approve",
        "review": {"approved_revision": 3, "approved_by": "admin-1", "approved_at": SENT_AT, "reason": "ok"},
        "pdf_blob_path": "quotes/PRV-2026-0007_r3.pdf",
        "pdf_revision": 3,
        "last_delivery_id": "d1",
        "delivery_status": "delivered",
        "sent_at": SENT_AT,
        "request": {"summary": "Pavimento soggiorno", "address": "Via Roma 1"},
        "created_at": SENT_AT,
    }
    db.put(*QUOTE_PATH, sent)
    db.put("counters", "quote_2026", {"next": 8})
    return sent


@pytest.mark.parametrize("status", ["sent", "rejected"])
async def test_a_new_request_opens_the_next_revision_of_the_same_quote(status):
    db = FakeDb()
    sent = _seed_sent(db, status)
    later = datetime(2026, 10, 20, tzinfo=UTC)

    result = await apply_ai_draft(
        FakeTransaction(db), db, PID, _ai_quote(sku="PAV-002", qty=30.0), _request("Anche il bagno"), later
    )

    assert result.outcome is DraftSaveOutcome.REVISED
    assert (result.status, result.quote_number, result.version) == ("draft", "PRV-2026-0007", 4)
    doc = db.get_data(*QUOTE_PATH)
    assert doc["status"] == "draft"
    assert doc["version"] == 4
    assert [i["sku"] for i in doc["items"]] == ["PAV-002"]
    assert doc["quote_number"] == "PRV-2026-0007"
    assert db.get_data("counters", "quote_2026")["next"] == 8  # no new PRV
    # What the client received stays: the sent copy is served from it.
    for key in ("sent_at", "pdf_blob_path", "pdf_revision", "last_delivery_id", "delivery_status", "created_at"):
        assert doc[key] == sent[key]
    # Not approved any more: the new revision needs the team again.
    assert "admin_decision" not in doc
    assert doc["client_revision"] is True  # opened from the chat: the client history shows it
    assert doc["review"] == {"reason": "ok"}
    assert doc["admin_notes"] == "Sopralluogo fatto"
    assert doc["request"]["summary"] == "Anche il bagno"
    assert doc["request"]["address"] == "Via Roma 1"
    QuoteSchema(**doc)

    revision = db.get_data(*QUOTE_PATH, "revisions", "4")
    assert revision["actor_kind"] == "ai"
    assert revision["reason"] == "Nuova richiesta del cliente in chat"
    assert {(c["change"], c["sku"]) for c in revision["diff"]} == {("added", "PAV-002"), ("removed", "PAV-001")}


async def test_a_draft_of_a_revision_is_updated_in_place():
    db = FakeDb()
    _seed_sent(db)
    await apply_ai_draft(FakeTransaction(db), db, PID, _ai_quote(sku="PAV-002"), _request(), NOW)

    result = await apply_ai_draft(FakeTransaction(db), db, PID, _ai_quote(sku="PAV-003"), _request(), NOW)

    assert result.outcome is DraftSaveOutcome.UPDATED
    doc = db.get_data(*QUOTE_PATH)
    assert (doc["version"], doc["sent_at"]) == (5, SENT_AT)


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


async def test_the_result_tells_whether_the_client_already_received_a_quote():
    db = FakeDb()
    _seed_sent(db, "sent")
    revised = await _save(db)
    assert revised.sent_before

    other = FakeDb()
    _seed_sent(other, "rejected")
    other.docs[QUOTE_PATH].pop("sent_at")  # rejected before it was ever sent
    assert not (await _save(other)).sent_before
    assert not (await _save(FakeDb())).sent_before


async def test_read_quote_status_is_a_plain_read():
    db = FakeDb()
    assert await read_quote_status(db, PID) is None
    _seed_sent(db)
    db.docs[QUOTE_PATH]["delivery_status"] = "queued"

    current = await read_quote_status(db, PID)

    assert current == QuoteStatusView(status="sent", delivery_status="queued", quote_number="PRV-2026-0007",
                                      version=3, sent_before=True)
    db.docs[QUOTE_PATH]["status"] = "deleted"
    assert await read_quote_status(db, PID) is None


async def test_a_later_draft_replaces_the_work_quoted_by_hand_and_the_warnings():
    """Phase 140: what the AI could not price reaches the admin, and only the latest draft's."""
    db = FakeDb()
    first = QuoteRequest(
        summary="Bagno", channel="chat", session_id=PID,
        manual_work=[ManualWorkItem(work="Rubinetteria (fornitura)", room_id="bagno1", origin="package")],
        ai_warnings=[QuoteAiWarning(kind="admin_check", message="Parete portante", room_id="bagno1", skus=["MUR-003"])],
    )
    await _save(db, request=first)
    doc = db.get_data(*QUOTE_PATH)
    assert doc["request"]["manual_work"] == [{"work": "Rubinetteria (fornitura)", "room_id": "bagno1", "origin": "package"}]
    assert doc["request"]["ai_warnings"] == [
        {"kind": "admin_check", "message": "Parete portante", "room_id": "bagno1", "skus": ["MUR-003"]}
    ]
    QuoteSchema(**doc)

    await _save(db, request=_request("Solo pavimento"))
    doc = db.get_data(*QUOTE_PATH)
    assert doc["request"]["manual_work"] == [] and doc["request"]["ai_warnings"] == []


# ── Phase 140 step 2: the AI revision keeps the spec it was made from ─────────


def _spec(room_id: str | None) -> RevisionRoomSpec:
    return RevisionRoomSpec(room_id=room_id, spec=RoomInterventionSpec(
        packages=[StoredPackage(assembly_id="ASM-BAGNO-FULL")],
        measures=[StoredMeasure(name="mq", value=6, source="declared")],
        library_version="2.0.0", generated_at=NOW,
    ))


async def test_the_ai_revision_keeps_the_specs_it_was_made_from():
    db = FakeDb()
    specs = [_spec("bagno1"), _spec(None)]
    await apply_ai_draft(FakeTransaction(db), db, PID, _ai_quote(), _request(), NOW, specs=specs)
    await apply_ai_draft(FakeTransaction(db), db, PID, _ai_quote(qty=30.0), _request(), NOW, specs=specs[:1])

    first = db.get_data(*QUOTE_PATH, "revisions", "1")
    assert [s["room_id"] for s in first["specs"]] == ["bagno1", None], "a chat without rooms has no room id"
    assert QuoteRevision(**first).specs == specs
    assert QuoteRevision(**db.get_data(*QUOTE_PATH, "revisions", "2")).specs == specs[:1]
    assert "specs" not in db.get_data(*QUOTE_PATH), "the spec belongs to the revision, not the quote"


async def test_a_revision_saved_before_the_specs_still_reads():
    db = FakeDb()
    await _save(db)

    revision = db.get_data(*QUOTE_PATH, "revisions", "1")
    assert revision["specs"] == []
    del revision["specs"]
    assert QuoteRevision(**revision).specs == []


# ── Phase 140 step 3: the card recalculates only a draft the client can still change ──


@pytest.mark.parametrize("status", ["sent", "rejected", "pending_review", "in_review", "approved"])
async def test_editable_only_blocks_revise_and_relay(status):
    db = FakeDb()
    seeded = _seed_sent(db, status)
    tx = FakeTransaction(db)

    result = await apply_ai_draft(tx, db, PID, _ai_quote(), _request(), NOW, editable_only=True)

    assert result.outcome is DraftSaveOutcome.NOT_EDITABLE
    assert (result.status, result.quote_number) == (status, "PRV-2026-0007")
    assert tx.writes == []
    assert db.get_data(*QUOTE_PATH) == seeded


async def test_editable_only_creates_and_updates_a_draft():
    db = FakeDb()
    created = await apply_ai_draft(FakeTransaction(db), db, PID, _ai_quote(), _request(), NOW, editable_only=True)
    updated = await apply_ai_draft(
        FakeTransaction(db), db, PID, _ai_quote(qty=30.0), _request(), NOW, editable_only=True
    )
    assert (created.outcome, updated.outcome) == (DraftSaveOutcome.CREATED, DraftSaveOutcome.UPDATED)


def _estimated(quote: QuoteSchema, precision: int) -> QuoteSchema:
    estimate = PriceEstimate(low=1100, high=1400, precision=precision, policy_version="1.0.0")
    return quote.model_copy(update={"estimate": estimate})


async def test_the_estimate_is_stored_on_the_draft_and_its_revision():
    db = FakeDb()
    await _save(db, _estimated(_ai_quote(), 90))

    doc = db.get_data(*QUOTE_PATH)
    assert doc["estimate"] == {"low": 1100.0, "high": 1400.0, "precision": 90, "policy_version": "1.0.0"}
    assert QuoteSchema(**doc).estimate == QuoteRevision(**db.get_data(*QUOTE_PATH, "revisions", "1")).estimate

    await _save(db, _estimated(_ai_quote(qty=30.0), 80))
    assert db.get_data(*QUOTE_PATH)["estimate"]["precision"] == 80
    assert db.get_data(*QUOTE_PATH, "revisions", "2")["estimate"]["precision"] == 80

    await _save(db, _ai_quote(qty=40.0))  # no range (no library): the old one goes
    assert "estimate" not in db.get_data(*QUOTE_PATH)
