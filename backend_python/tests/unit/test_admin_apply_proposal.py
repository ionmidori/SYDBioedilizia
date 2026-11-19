"""The team applies the AI revision proposal to the draft (relay plan, PR 4).

`apply_proposal_tx` replaces the quote content with the proposal like an edit
(If-Match, review lock, state machine), writes an AI revision with the specs,
and marks the proposal applied. A proposal made on an older version is refused.
"""
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from google.api_core.exceptions import ServiceUnavailable
from src.core.exceptions import (
    ProposalNotFoundError,
    ProposalOutdatedError,
    QuoteLockedError,
    QuoteVersionConflictError,
)
from src.schemas.admin_quote import QuoteProposal
from src.schemas.intervention_spec import RoomInterventionSpec
from src.schemas.price_range import PriceEstimate
from src.schemas.quote import (
    ManualWorkItem,
    QuoteFinancials,
    QuoteItem,
    QuoteRoom,
    RevisionRoomSpec,
)
from src.services import admin_quotes as svc
from src.services import quote_proposal
from src.services.quote_proposal import PROPOSAL_APPLIED_REASON, proposal_payload
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

PID = "p1"
QUOTE = ("projects", PID, "private_data", "quote")
PROPOSAL = ("projects", PID, "private_data", "quote_proposal")
NOW = datetime(2026, 11, 20, 9, 0, tzinfo=UTC)
ADMIN = "admin-a"


def _seed(db: FakeDb, **overrides) -> None:
    doc = {
        "doc_type": "quote", "project_id": PID, "user_id": "uid-1", "status": "in_review",
        "quote_number": "PRV-2026-0042", "version": 3, "admin_notes": "Sopralluogo fatto",
        "items": [{"sku": "ADMIN-EDIT", "description": "Voce admin", "unit": "pz", "qty": 1.0,
                   "unit_price": 50.0, "total": 50.0, "manual_override": True, "room_id": "bagno1"}],
        "rooms": [{"room_id": "bagno1", "room_label": "Bagno", "room_type": "bagno"}],
        "financials": {"subtotal": 50.0, "vat_rate": 0.10, "vat_amount": 5.0, "grand_total": 55.0},
        "request": {"summary": "Bagno", "manual_work": [{"work": "Vecchio", "origin": "package"}]},
        "review": {"locked_by": ADMIN, "locked_at": NOW},
    }
    doc.update(overrides)
    db.put(*QUOTE, doc)


def _proposal(**overrides) -> QuoteProposal:
    fields = {
        "based_on_version": 3, "created_at": NOW - timedelta(hours=1), "summary": "Aggiunto il salone",
        "items": [
            QuoteItem(sku="BAG-RIV-001", description="Rivestimento", unit="mq", qty=10, unit_price=40,
                      total=Decimal("400.00"), room_id="bagno1"),
            QuoteItem(sku="PIT-001", description="Pittura", unit="mq", qty=30, unit_price=12,
                      total=Decimal("360.00"), room_id="salone1"),
        ],
        "rooms": [QuoteRoom(room_id="bagno1", room_label="Bagno", room_type="bagno"),
                  QuoteRoom(room_id="salone1", room_label="Salone", room_type="soggiorno", floor_mq=30)],
        "financials": QuoteFinancials(subtotal=Decimal("760.00"), vat_rate=0.22, vat_amount=Decimal("167.20"),
                                      grand_total=Decimal("927.20")),
        "estimate": PriceEstimate(low=Decimal("800.00"), high=Decimal("1100.00"), precision=70, policy_version="v1"),
        "manual_work": [ManualWorkItem(work="Rasatura", origin="package")],
        "specs": [RevisionRoomSpec(room_id="salone1",
                                   spec=RoomInterventionSpec(library_version="v1", generated_at=NOW))],
    }
    fields.update(overrides)
    return QuoteProposal(**fields)


def _store(db: FakeDb, proposal: QuoteProposal) -> None:
    db.put(*PROPOSAL, proposal_payload(proposal))


async def _apply(db: FakeDb, expected: int = 3, admin: str = ADMIN):
    stored = db.get_data(*PROPOSAL)
    seen = stored["created_at"] if stored else NOW
    return await svc.apply_proposal_tx(FakeTransaction(db), db, PID, admin, expected, NOW, proposal_created_at=seen)


async def test_the_proposal_replaces_the_draft_as_a_new_version():
    db = FakeDb()
    _seed(db)
    _store(db, _proposal())

    result = await _apply(db)

    doc = db.get_data(*QUOTE)
    assert result.version == 4 and doc["version"] == 4 and doc["status"] == "in_review"
    assert [i["sku"] for i in doc["items"]] == ["BAG-RIV-001", "PIT-001"]
    assert not any(i["manual_override"] for i in doc["items"])  # AI lines, not the admin's
    assert [r["room_id"] for r in doc["rooms"]] == ["bagno1", "salone1"]
    assert doc["estimate"]["low"] == 800.0
    assert doc["request"]["manual_work"] == [{"work": "Rasatura", "origin": "package"}]
    assert doc["request"]["summary"] == "Bagno"  # the rest of the request is kept
    assert doc["admin_notes"] == "Sopralluogo fatto"


async def test_the_quote_vat_rate_is_kept():
    db = FakeDb()
    _seed(db)
    _store(db, _proposal())

    await _apply(db)

    financials = db.get_data(*QUOTE)["financials"]
    assert financials["vat_rate"] == 0.10
    assert financials["subtotal"] == 760.0 and financials["grand_total"] == 836.0


async def test_the_revision_is_the_ai_proposal_applied_by_the_admin():
    """An AI revision: the learning ledger compares the approved quote with it."""
    db = FakeDb()
    _seed(db)
    _store(db, _proposal())

    await _apply(db)

    revision = db.get_data(*QUOTE, "revisions", "4")
    assert revision["actor_kind"] == "ai" and revision["actor_uid"] == ADMIN
    assert revision["reason"] == PROPOSAL_APPLIED_REASON
    assert revision["specs"][0]["room_id"] == "salone1"
    assert revision["estimate"]["high"] == 1100.0
    assert {c["change"] for c in revision["diff"]} >= {"added", "removed"}


async def test_the_proposal_is_marked_applied():
    db = FakeDb()
    _seed(db)
    _store(db, _proposal())

    await _apply(db)

    assert db.get_data(*PROPOSAL)["applied_at"] == NOW


async def test_a_proposal_without_an_estimate_clears_the_old_range():
    db = FakeDb()
    _seed(db, estimate={"low": 1.0, "high": 2.0, "precision": 10, "policy_version": "v0"})
    _store(db, _proposal(estimate=None))

    await _apply(db)

    assert "estimate" not in db.get_data(*QUOTE)


async def test_a_proposal_made_on_an_older_version_is_refused():
    db = FakeDb()
    _seed(db)
    _store(db, _proposal(based_on_version=2))

    with pytest.raises(ProposalOutdatedError) as exc:
        await _apply(db)

    assert exc.value.status_code == 409 and exc.value.error_code == "PROPOSAL_OUTDATED"
    assert db.get_data(*QUOTE)["version"] == 3


async def test_an_applied_proposal_cannot_be_applied_again():
    db = FakeDb()
    _seed(db)
    _store(db, _proposal(applied_at=NOW - timedelta(minutes=5)))

    with pytest.raises(ProposalOutdatedError):
        await _apply(db)


async def test_no_proposal_is_404():
    db = FakeDb()
    _seed(db)

    with pytest.raises(ProposalNotFoundError) as exc:
        await _apply(db)

    assert exc.value.status_code == 404 and exc.value.error_code == "PROPOSAL_NOT_FOUND"


async def test_the_version_the_admin_saw_is_required():
    db = FakeDb()
    _seed(db)
    _store(db, _proposal())

    with pytest.raises(QuoteVersionConflictError):
        await _apply(db, expected=2)

    assert db.get_data(*PROPOSAL).get("applied_at") is None


async def test_another_admin_lock_blocks_the_apply():
    db = FakeDb()
    _seed(db)
    _store(db, _proposal())

    with pytest.raises(QuoteLockedError):
        await _apply(db, admin="admin-b")


async def test_a_proposal_replaced_after_the_admin_saw_it_is_refused():
    """The chat replaced the proposal (same version) while the admin confirmed the old one."""
    db = FakeDb()
    _seed(db)
    _store(db, _proposal(created_at=NOW - timedelta(minutes=1)))

    with pytest.raises(ProposalOutdatedError):
        await svc.apply_proposal_tx(FakeTransaction(db), db, PID, ADMIN, 3, NOW,
                                    proposal_created_at=NOW - timedelta(hours=1))

    assert db.get_data(*QUOTE)["version"] == 3


async def test_a_proposal_without_rooms_clears_the_quote_sections():
    db = FakeDb()
    _seed(db)
    _store(db, _proposal(rooms=[], items=[QuoteItem(sku="PIT-001", description="Pittura", unit="mq", qty=30,
                                                    unit_price=12, total=Decimal("360.00"))]))

    await _apply(db)

    assert db.get_data(*QUOTE)["rooms"] == []
    assert db.get_data(*QUOTE, "revisions", "4").get("rooms", []) == []


async def test_a_line_of_an_unknown_room_goes_to_the_general_section():
    db = FakeDb()
    _seed(db)
    proposal = _proposal()
    stray = proposal.items[1].model_copy(update={"room_id": "ghost"})
    _store(db, proposal.model_copy(update={"items": [proposal.items[0], stray]}))

    await _apply(db)

    room_ids = {i.get("room_id") for i in db.get_data(*QUOTE)["items"]}
    assert "ghost" not in room_ids


async def test_a_transient_read_error_is_not_a_missing_proposal(monkeypatch):
    """Inside the transaction a Firestore error propagates (retried), never a 404."""
    db = FakeDb()
    _seed(db)
    _store(db, _proposal())

    class _Broken:
        async def get(self, transaction=None):
            raise ServiceUnavailable("down")

    monkeypatch.setattr(quote_proposal, "proposal_ref", lambda _db, _pid: _Broken())
    with pytest.raises(ServiceUnavailable):
        await _apply(db)
