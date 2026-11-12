"""Learning ledger entry (Phase 140 step 2): the net correction of the technician
to the AI draft, anonymous, built by a pure function that never raises."""
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError
from src.schemas.intervention_spec import RoomInterventionSpec, StoredPackage
from src.schemas.learning_ledger import LearningLedgerEntry
from src.schemas.quote import QuoteFinancials, QuoteItem, QuoteRoom, RevisionRoomSpec
from src.services import learning_ledger as ledger
from src.services.quote_diff import diff_items
from src.services.quote_drafts import build_revision

NOW = datetime(2026, 11, 12, 9, 0, tzinfo=UTC)
AI_AT = NOW - timedelta(days=1)
ADMIN = "admin-a"


def _item(sku: str, qty: float = 10.0, price: float = 12.0, room_id: str | None = "bagno1") -> dict:
    return {"sku": sku, "description": sku, "unit": "mq", "qty": qty, "unit_price": price,
            "total": round(qty * price, 2), "room_id": room_id,
            "ai_reasoning": "Macerie di tutta la casa (Bagno di Mario Rossi)"}


def _ai_revision(items: list[dict], version: int = 1) -> dict:
    spec = RevisionRoomSpec(room_id="bagno1", spec=RoomInterventionSpec(
        packages=[StoredPackage(assembly_id="ASM-BAGNO-FULL")], library_version="2.0.0", generated_at=AI_AT,
    ))
    room = QuoteRoom(room_id="bagno1", room_label="Bagno di Mario Rossi", room_type="bagno", floor_mq=6.0)
    return build_revision(
        version, [QuoteItem(**i) for i in items], QuoteFinancials(), "nota interna", "ai", None, AI_AT,
        rooms=[room], specs=[spec],
    )


def _quote(items: list[dict], **overrides) -> dict:
    quote = {
        "quote_number": "PRV-2026-0001", "project_id": "session-token", "items": items,
        "admin_notes": "Il cliente paga in contanti",
        "client_snapshot": {"uid": "u1", "display_name": "Mario Rossi", "email": "m@example.com"},
        "request": {
            "address": "Via Roma 1, Milano", "summary": "Bagno",
            "manual_work": [{"work": "Smaltimento eternit", "room_id": "bagno1",
                             "room_label": "Bagno di Mario Rossi", "origin": "package"}],
            "ai_warnings": [{"kind": "missing_measure", "message": "Controlla i mq", "room_id": "bagno1",
                             "room_label": "Bagno di Mario Rossi", "skus": ["PAV-001"]}],
        },
    }
    return quote | overrides


def _build(quote: dict, ai_revision: dict, approved_version: int = 3) -> LearningLedgerEntry | None:
    return ledger.build_entry(
        quote=quote, ai_revision=ai_revision, approved_version=approved_version, admin_uid=ADMIN, now=NOW
    )


def test_the_entry_id_is_the_quote_number_and_the_approved_version():
    assert ledger.entry_id("PRV-2026-0001", 3) == "PRV-2026-0001_r3"


def test_the_entry_keeps_the_net_correction_and_the_context_of_the_draft():
    ai_items = [_item("PIT-001"), _item("PAV-001", 6.0, 40.0)]
    approved = [_item("PIT-001", 12.0), _item("DEM-001", 1.0, 150.0)]

    entry = _build(_quote(approved), _ai_revision(ai_items))

    assert entry is not None
    assert (entry.quote_number, entry.ai_version, entry.approved_version) == ("PRV-2026-0001", 1, 3)
    assert (entry.approved_by, entry.approved_at, entry.ai_created_at) == (ADMIN, NOW, AI_AT)
    assert entry.changes == diff_items(ai_items, approved)
    assert [i.sku for i in entry.ai_items] == ["PIT-001", "PAV-001"]
    assert [i.sku for i in entry.approved_items] == ["PIT-001", "DEM-001"]
    assert entry.ai_subtotal == Decimal("360.00") and entry.approved_subtotal == Decimal("294.00")
    assert entry.specs[0].spec.packages[0].assembly_id == "ASM-BAGNO-FULL"
    assert [(r.room_id, r.room_type, r.floor_mq) for r in entry.rooms] == [("bagno1", "bagno", 6.0)]
    assert entry.manual_work[0].work == "Smaltimento eternit"
    assert entry.ai_warnings[0].skus == ["PAV-001"]


def test_an_approval_without_edits_has_no_changes():
    items = [_item("PIT-001")]
    entry = _build(_quote(items), _ai_revision(items), approved_version=1)
    assert entry is not None and entry.changes == []


def _keys(node: object) -> set[str]:
    if isinstance(node, dict):
        return set(node) | {k for v in node.values() for k in _keys(v)}
    if isinstance(node, list):
        return {k for v in node for k in _keys(v)}
    return set()


def test_ledger_entry_has_no_client_data():
    entry = _build(_quote([_item("PIT-001")]), _ai_revision([_item("PIT-001")]))
    assert entry is not None
    dumped = entry.model_dump()

    assert not _keys(dumped) & {"project_id", "client_snapshot", "admin_notes", "address", "session_id"}
    text = json.dumps(dumped, default=str)
    for secret in ("Mario Rossi", "Via Roma", "session-token", "contanti", "nota interna", "example.com"):
        assert secret not in text
    assert all(w.room_label is None for w in [*entry.manual_work, *entry.ai_warnings])
    assert all(i.ai_reasoning is None for i in [*entry.ai_items, *entry.approved_items])


def test_the_entry_rejects_a_field_it_does_not_know():
    entry = _build(_quote([_item("PIT-001")]), _ai_revision([_item("PIT-001")]))
    assert entry is not None
    with pytest.raises(ValidationError):
        LearningLedgerEntry(**entry.model_dump(), project_id="session-token")


@pytest.mark.parametrize("quote_overrides,revision_overrides", [
    ({"quote_number": None}, {}),
    ({}, {"items": [{"sku": "PIT-001"}]}),  # a legacy revision that no longer validates
    ({"items": [{"sku": "PIT-001", "qty": -1}]}, {}),
])
def test_an_entry_that_cannot_be_built_is_none(quote_overrides, revision_overrides):
    revision = _ai_revision([_item("PIT-001")]) | revision_overrides
    assert _build(_quote([_item("PIT-001")]) | quote_overrides, revision) is None
