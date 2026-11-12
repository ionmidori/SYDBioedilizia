"""Admin quote review domain (src/services/admin_quotes.py) — Phase 128 PR 3.1.

Transaction bodies run against the in-memory Firestore fake: version checks,
review lock, state machine, revisions with diff, server-side totals.
"""
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from google.api_core.exceptions import GoogleAPICallError
from src.core.exceptions import (
    InvalidQuoteTransitionError,
    MediaNotFoundError,
    PreconditionRequiredError,
    QuoteLockedError,
    QuoteNotFoundError,
    QuoteVersionConflictError,
)
from src.schemas.quote import QuoteFinancials, QuoteItem, QuoteSchema
from src.services import admin_quotes as svc
from src.services import learning_ledger
from src.services.quote_diff import diff_items
from src.services.quote_drafts import build_revision
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

PID = "p1"
QUOTE = ("projects", PID, "private_data", "quote")
NOW = datetime(2026, 10, 11, 9, 0, tzinfo=UTC)
ADMIN = "admin-a"
OTHER = "admin-b"


def _item(sku="PIT-001", qty=10.0, price=12.0, override=False, desc="Pittura"):
    return {"sku": sku, "description": desc, "unit": "mq", "qty": qty, "unit_price": price,
            "total": round(qty * price, 2), "manual_override": override}


def _seed(db: FakeDb, **overrides) -> None:
    doc = {
        "doc_type": "quote", "project_id": PID, "user_id": "uid-1", "status": "pending_review",
        "quote_number": "PRV-2026-0001", "version": 2,
        "items": [_item(), _item("PAV-001", 20.0, 40.0)],
        "financials": {"subtotal": 920.0, "vat_rate": 0.22, "vat_amount": 202.4, "grand_total": 1122.4},
        "created_at": NOW - timedelta(days=1), "updated_at": NOW - timedelta(days=1),
    }
    doc.update(overrides)
    db.put(*QUOTE, doc)


def tx(db):
    return FakeTransaction(db)


# ── If-Match ──────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("header,version", [('"v3"', 3), ("v3", 3), ('W/"v12"', 12)])
def test_if_match_parsing(header, version):
    assert svc.parse_if_match(header) == version


@pytest.mark.parametrize("header", [None, "", "*", '"3"', "abc"])
def test_missing_or_malformed_if_match_is_428(header):
    with pytest.raises(PreconditionRequiredError) as exc:
        svc.parse_if_match(header)
    assert exc.value.status_code == 428


# ── Claim / release / lock ────────────────────────────────────────────────────

async def test_claim_moves_to_in_review_and_locks():
    db = FakeDb()
    _seed(db)
    result = await svc.claim_tx(tx(db), db, PID, ADMIN, NOW)
    doc = db.get_data(*QUOTE)
    assert result.status == "in_review" and doc["status"] == "in_review"
    assert doc["review"]["locked_by"] == ADMIN


async def test_fresh_lock_of_another_admin_blocks_writes_but_expires():
    db = FakeDb()
    _seed(db, status="in_review", review={"locked_by": OTHER, "locked_at": NOW - timedelta(minutes=5)})
    with pytest.raises(QuoteLockedError):
        await svc.edit_tx(tx(db), db, PID, ADMIN, 2, NOW, admin_notes="x")
    with pytest.raises(QuoteLockedError):
        await svc.approve_tx(tx(db), db, PID, ADMIN, 2, NOW)
    # 31 minutes later the lease has expired
    later = NOW + timedelta(minutes=26)
    result = await svc.claim_tx(tx(db), db, PID, ADMIN, later)
    assert db.get_data(*QUOTE)["review"]["locked_by"] == ADMIN and result.status == "in_review"


async def test_release_returns_to_queue_and_clears_lock():
    db = FakeDb()
    _seed(db, status="in_review", review={"locked_by": ADMIN, "locked_at": NOW})
    result = await svc.release_tx(tx(db), db, PID, ADMIN, NOW)
    doc = db.get_data(*QUOTE)
    assert result.status == "pending_review" and "locked_by" not in doc["review"]


# ── Edit ──────────────────────────────────────────────────────────────────────

async def test_edit_requires_the_version_the_admin_saw():
    db = FakeDb()
    _seed(db)
    with pytest.raises(QuoteVersionConflictError) as exc:
        await svc.edit_tx(tx(db), db, PID, ADMIN, 1, NOW, admin_notes="x")
    assert exc.value.detail["current_version"] == 2


async def test_edit_recomputes_totals_server_side_and_writes_revision_with_diff():
    db = FakeDb()
    _seed(db)
    tampered = QuoteItem(**{**_item(qty=15.0), "total": 1.0})  # client-sent total ignored
    unchanged = QuoteItem(**_item("PAV-001", 20.0, 40.0))
    new_line = QuoteItem(**_item("DEM-001", 5.0, 30.0, desc="Demolizione"))

    result = await svc.edit_tx(
        tx(db), db, PID, ADMIN, 2, NOW, items=[tampered, unchanged, new_line], reason="sopralluogo"
    )

    doc = db.get_data(*QUOTE)
    assert result.version == 3 and doc["version"] == 3 and doc["status"] == "in_review"
    assert [i["total"] for i in doc["items"]] == [180.0, 800.0, 150.0]
    assert [i["manual_override"] for i in doc["items"]] == [True, False, True]
    assert doc["financials"]["subtotal"] == 1130.0
    assert doc["financials"]["grand_total"] == round(1130.0 * 1.22, 2)
    assert doc["review"]["locked_by"] == ADMIN
    QuoteSchema(**doc)

    revision = db.get_data(*QUOTE, "revisions", "3")
    assert revision["actor_kind"] == "admin" and revision["actor_uid"] == ADMIN
    assert revision["reason"] == "sopralluogo"
    assert revision["specs"] == [], "the technician's revision has no spec of its own"
    changes = {(c["change"], c["sku"]) for c in revision["diff"]}
    assert changes == {("changed", "PIT-001"), ("added", "DEM-001")}


async def test_removed_line_appears_in_diff_and_notes_only_edit_keeps_items():
    db = FakeDb()
    _seed(db)
    await svc.edit_tx(tx(db), db, PID, ADMIN, 2, NOW, items=[QuoteItem(**_item())])
    assert db.get_data(*QUOTE, "revisions", "3")["diff"][0]["change"] == "removed"

    await svc.edit_tx(tx(db), db, PID, ADMIN, 3, NOW, admin_notes="Valido 30 giorni")
    doc = db.get_data(*QUOTE)
    assert doc["admin_notes"] == "Valido 30 giorni" and len(doc["items"]) == 1
    assert db.get_data(*QUOTE, "revisions", "4")["diff"] == []


async def test_vat_rate_change_recomputes_financials():
    db = FakeDb()
    _seed(db)
    await svc.edit_tx(tx(db), db, PID, ADMIN, 2, NOW, vat_rate=0.10)
    fin = db.get_data(*QUOTE)["financials"]
    assert fin["vat_rate"] == 0.10 and fin["vat_amount"] == 92.0


# ── Approve / reject / reopen ─────────────────────────────────────────────────

async def test_approve_freezes_the_reviewed_version():
    db = FakeDb()
    _seed(db, status="in_review", review={"locked_by": ADMIN, "locked_at": NOW})
    result, approved = await svc.approve_tx(tx(db), db, PID, ADMIN, 2, NOW)
    doc = db.get_data(*QUOTE)
    assert result.status == "approved" and doc["status"] == "approved"
    assert doc["review"]["approved_by"] == ADMIN and doc["review"]["approved_revision"] == 2
    assert "locked_by" not in doc["review"]
    assert approved["quote_number"] == "PRV-2026-0001"
    QuoteSchema(**doc)


async def test_a_draft_can_be_approved_directly():
    db = FakeDb()
    _seed(db, status="draft")
    result, _ = await svc.approve_tx(tx(db), db, PID, ADMIN, 2, NOW)
    assert result.status == "approved"


async def test_approved_quote_cannot_be_edited_until_reopened():
    db = FakeDb()
    _seed(db, status="approved")
    with pytest.raises(InvalidQuoteTransitionError):
        await svc.edit_tx(tx(db), db, PID, ADMIN, 2, NOW, admin_notes="x")

    result = await svc.reopen_tx(tx(db), db, PID, ADMIN, "Il cliente vuole il parquet", NOW)
    doc = db.get_data(*QUOTE)
    assert result.status == "in_review" and doc["review"]["reason"] == "Il cliente vuole il parquet"
    assert "approved_by" not in doc["review"]
    await svc.edit_tx(tx(db), db, PID, ADMIN, 2, NOW, admin_notes="ok")


async def test_reject_records_reason():
    db = FakeDb()
    _seed(db)
    result = await svc.reject_tx(tx(db), db, PID, ADMIN, "Fuori zona", NOW)
    doc = db.get_data(*QUOTE)
    assert result.status == "rejected" and doc["review"]["reason"] == "Fuori zona"
    assert doc["admin_decision"] == "reject"


async def test_missing_or_deleted_quote_is_404():
    db = FakeDb()
    with pytest.raises(QuoteNotFoundError):
        await svc.claim_tx(tx(db), db, PID, ADMIN, NOW)
    _seed(db, status="deleted")
    with pytest.raises(QuoteNotFoundError):
        await svc.claim_tx(tx(db), db, PID, ADMIN, NOW)


# ── Reads ─────────────────────────────────────────────────────────────────────

def test_list_row_shows_who_and_what():
    quote = {
        "quote_number": "PRV-2026-0001", "status": "pending_review",
        "client_snapshot": {"display_name": "Mario Rossi", "email": "m@x.it"},
        "request": {"summary": "Cucina " * 50, "channel": "chat"},
        "media": [{"media_id": "r1", "kind": "render"}, {"media_id": "f1", "kind": "input_photo"}],
        "items": [{}, {}], "financials": {"grand_total": 816.91},
    }
    row = svc.list_row(PID, quote)
    assert row["client_display_name"] == "Mario Rossi" and row["quote_number"] == "PRV-2026-0001"
    assert row["thumbnail_media_id"] == "f1"  # the client's photo first
    assert row["grand_total"] == Decimal("816.91") and row["item_count"] == 2
    assert len(row["summary"]) <= 161


def test_cursor_roundtrip_and_tampering():
    path = f"projects/{PID}/private_data/quote"
    assert svc.decode_cursor(svc.encode_cursor(path)) == path
    assert svc.decode_cursor(svc.encode_cursor("users/x")) is None
    assert svc.decode_cursor("not-base64!!") is None


@pytest.mark.parametrize(
    "number,label,path,expected",
    [
        ("PRV-2026-0042", "Foto 1", "user-uploads/p1/ab12.jpg", "PRV-2026-0042_foto-1.jpg"),
        ("PRV-2026-0042", "Render 2", "renders/p1/1700-x.png", "PRV-2026-0042_render-2.png"),
        (None, "Foto 1", "projects/p1/uploads/1700_IMG.JPEG", "preventivo_foto-1.jpeg"),
    ],
)
def test_download_filename_is_readable_and_has_no_personal_data(number, label, path, expected):
    assert svc.download_filename(number, label, path) == expected


async def test_media_url_rejects_foreign_paths_and_unknown_ids(monkeypatch):
    monkeypatch.setattr(svc, "sign_url_sync", lambda path, disposition: f"https://signed/{path}?{disposition}")
    quote = {
        "quote_number": "PRV-2026-0001",
        "media": [
            {"media_id": "ok", "kind": "input_photo", "blob_path": f"user-uploads/{PID}/a.jpg", "label": "Foto 1"},
            {"media_id": "evil", "kind": "input_photo", "blob_path": "user-uploads/other/a.jpg", "label": "Foto 2"},
            {"media_id": "lnk", "kind": "link", "external_url": "https://example.com/x", "label": "Link 1"},
        ],
    }
    url, filename = await svc.media_url(quote, PID, "ok", attachment=True)
    assert filename == "PRV-2026-0001_foto-1.jpg" and 'attachment; filename="PRV-2026-0001_foto-1.jpg"' in url
    assert (await svc.media_url(quote, PID, "lnk", attachment=False))[0] == "https://example.com/x"
    for media_id in ("evil", "missing"):
        with pytest.raises(MediaNotFoundError):
            await svc.media_url(quote, PID, media_id, attachment=False)


def test_pdf_never_named_or_titled_with_personal_data():
    assert svc.pdf_blob_path(PID, "PRV-2026-0001", 3) == f"projects/{PID}/quotes/PRV-2026-0001_r3.pdf"
    data = svc.pdf_input({"user_id": "uid-1", "client_snapshot": {"display_name": "Mario Rossi"}}, PID)
    assert data["client_name"] == "Mario Rossi"
    assert svc.pdf_input({"user_id": "uid-1"}, PID)["client_name"] == "Cliente"  # never the uid


async def test_edit_rounds_half_cents_up_and_stores_numbers():
    """The admin preview (web_client/lib/admin/quote-math.ts) shows 11,13 € for 0.5 × 22.25:
    the saved quote must say the same, and Firestore gets floats, never Decimal."""
    db = FakeDb()
    _seed(db)
    await svc.edit_tx(tx(db), db, PID, ADMIN, 2, NOW, items=[QuoteItem(**_item("POS-001", 0.5, 22.25))])
    doc = db.get_data(*QUOTE)
    assert doc["items"][0]["total"] == 11.13
    assert doc["financials"] == {"subtotal": 11.13, "vat_rate": 0.22, "vat_amount": 2.45, "grand_total": 13.58}
    assert all(type(v) is float for v in doc["financials"].values())


async def test_an_edit_without_items_still_recomputes_every_line():
    """A VAT- or notes-only edit sends no items. Lines saved with the old
    float rounding (0.5 × 22.25 → 11.12) are recomputed anyway, so the saved
    quote matches the admin preview, which always recomputes them (11.13)."""
    db = FakeDb()
    _seed(db, items=[{**_item("POS-001", 0.5, 22.25), "total": 11.12}])
    await svc.edit_tx(tx(db), db, PID, ADMIN, 2, NOW, vat_rate=0.10)
    doc = db.get_data(*QUOTE)
    assert doc["items"][0]["total"] == 11.13
    assert doc["items"][0]["manual_override"] is False  # an unchanged line keeps its flag
    assert doc["financials"]["grand_total"] == 12.24  # 11.13 + 1.11 (1.113)
    (change,) = db.get_data(*QUOTE, "revisions", "3")["diff"]
    assert change["change"] == "changed" and change["before"]["total"] == 11.12


# ── Multi-room quotes (Phase 138) ─────────────────────────────────────────────

_ROOMS = [
    {"room_id": "bagno1", "room_label": "Bagno", "room_type": "bagno", "room_subtotal": 120.0},
    {"room_id": "cucina1", "room_label": "Cucina", "room_type": "cucina", "room_subtotal": 120.0},
    {"room_id": "generale", "room_label": "Generale", "room_type": "altro", "room_subtotal": 0.0},
]


def _room_item(room_id, sku="PIT-001", qty=10.0, price=12.0):
    return {**_item(sku, qty, price), "room_id": room_id}


async def test_editing_a_multi_room_quote_recomputes_the_room_subtotals():
    db = FakeDb()
    _seed(db, rooms=_ROOMS, items=[_room_item("bagno1"), _room_item("cucina1")])
    items = [
        QuoteItem(**_room_item("bagno1", qty=20.0)),
        QuoteItem(**_room_item("cucina1")),
        # A line added without a room (or with an unknown one) goes to "Generale".
        QuoteItem(**{**_item("MANUALE-001", 1.0, 50.0), "room_id": "cantina"}),
    ]

    await svc.edit_tx(tx(db), db, PID, ADMIN, 2, NOW, items=items)

    doc = db.get_data(*QUOTE)
    assert [i["room_id"] for i in doc["items"]] == ["bagno1", "cucina1", "generale"]
    assert [(r["room_id"], r["room_subtotal"]) for r in doc["rooms"]] == [
        ("bagno1", 240.0), ("cucina1", 120.0), ("generale", 50.0),
    ]
    assert sum(r["room_subtotal"] for r in doc["rooms"]) == doc["financials"]["subtotal"]
    QuoteSchema(**doc)
    revision = db.get_data(*QUOTE, "revisions", "3")
    assert [r["room_subtotal"] for r in revision["rooms"]] == [240.0, 120.0, 50.0]


async def test_the_same_sku_in_two_rooms_is_two_lines_in_the_diff():
    db = FakeDb()
    _seed(db, rooms=_ROOMS, items=[_room_item("bagno1"), _room_item("cucina1")])
    # Kitchen line changed, bathroom line moved to "Generale".
    items = [QuoteItem(**_room_item("generale")), QuoteItem(**_room_item("cucina1", qty=12.0))]

    await svc.edit_tx(tx(db), db, PID, ADMIN, 2, NOW, items=items)

    doc = db.get_data(*QUOTE)
    assert [i["manual_override"] for i in doc["items"]] == [True, True]
    diff = {(c["change"], c["sku"], c["room_id"]) for c in db.get_data(*QUOTE, "revisions", "3")["diff"]}
    assert diff == {
        ("added", "PIT-001", "generale"), ("changed", "PIT-001", "cucina1"), ("removed", "PIT-001", "bagno1"),
    }


async def test_a_quote_without_rooms_keeps_no_sections():
    db = FakeDb()
    _seed(db)
    await svc.edit_tx(tx(db), db, PID, ADMIN, 2, NOW, items=[QuoteItem(**_item())])
    doc = db.get_data(*QUOTE)
    assert doc["rooms"] == [] and doc["items"][0].get("room_id") is None


@pytest.mark.parametrize(
    "seed",
    [
        {"status": "sent", "sent_at": NOW - timedelta(days=2), "delivery_status": "delivered"},  # revise
        {"status": "approved"},  # reopen
        {"status": "rejected"},  # reopen
    ],
)
async def test_a_revision_the_admin_opens_is_not_the_client_revision(seed):
    # Phase 139 PR-3: the client history shows only a revision opened from the chat.
    db = FakeDb()
    _seed(db, client_revision=True, **seed)
    await svc.reopen_tx(tx(db), db, PID, ADMIN, "Prezzi del materiale cambiati", NOW)
    assert "client_revision" not in db.get_data(*QUOTE)


# ── Phase 140 step 2: the learning ledger, written with the approval ──────────

LEDGER = "learning_ledger"
REVISIONS = (*QUOTE, "revisions")


def _revision(version: int, items: list[dict], actor_kind: str = "ai") -> dict:
    return build_revision(
        version, [QuoteItem(**i) for i in items], QuoteFinancials(), None, actor_kind,
        None if actor_kind == "ai" else ADMIN, NOW - timedelta(hours=10 - version),
    )


def _seed_revisions(db: FakeDb, *actors: str, items: list[dict] | None = None) -> None:
    for version, actor in enumerate(actors, start=1):
        db.put(*REVISIONS, str(version), _revision(version, items or [_item()], actor))


def _ledger(db: FakeDb) -> dict[str, dict]:
    return {p[1]: d for p, d in db.docs.items() if p[0] == LEDGER}


async def test_ledger_records_the_net_diff_from_the_last_ai_revision():
    db = FakeDb()
    ai_items = [_item(), _item("PAV-001", 20.0, 40.0)]
    _seed(db, status="in_review", version=1, items=ai_items)
    _seed_revisions(db, "ai", items=ai_items)
    await svc.edit_tx(tx(db), db, PID, ADMIN, 1, NOW, items=[QuoteItem(**_item(qty=15.0))])
    await svc.edit_tx(tx(db), db, PID, ADMIN, 2, NOW, items=[
        QuoteItem(**_item(qty=15.0)), QuoteItem(**_item("DEM-001", 5.0, 30.0))
    ])

    transaction = tx(db)
    await svc.approve_tx(transaction, db, PID, ADMIN, 3, NOW)

    entry = _ledger(db)["PRV-2026-0001_r3"]
    approved_items = db.get_data(*QUOTE)["items"]
    assert (entry["ai_version"], entry["approved_version"], entry["approved_by"]) == (1, 3, ADMIN)
    assert entry["changes"] == [c.model_dump() for c in diff_items(ai_items, approved_items)]
    assert {(c["change"], c["sku"]) for c in entry["changes"]} == {
        ("changed", "PIT-001"), ("removed", "PAV-001"), ("added", "DEM-001")
    }
    assert REVISIONS in transaction.reads, "the AI revision is read inside the approval transaction"
    assert all(path[: len(QUOTE)] == QUOTE for path in transaction.reads), "no room read: no contention"


async def test_an_approval_without_edits_records_no_changes():
    db = FakeDb()
    _seed(db, version=1)
    _seed_revisions(db, "ai", items=db.get_data(*QUOTE)["items"])
    await svc.approve_tx(tx(db), db, PID, ADMIN, 1, NOW)
    assert _ledger(db)["PRV-2026-0001_r1"]["changes"] == []



async def test_the_last_ai_revision_up_to_the_approved_version_wins():
    db = FakeDb()
    _seed(db, version=4)
    _seed_revisions(db, "ai", "admin", "ai", "admin", "ai")  # v5: an AI revision after the approved one
    await svc.approve_tx(tx(db), db, PID, ADMIN, 4, NOW)
    assert _ledger(db)["PRV-2026-0001_r4"]["ai_version"] == 3


async def test_an_ai_revision_beyond_the_lookback_records_nothing_and_says_so(caplog):
    db = FakeDb()
    versions = learning_ledger.AI_REVISION_LOOKBACK + 1
    _seed(db, version=versions)
    _seed_revisions(db, "ai", *["admin"] * learning_ledger.AI_REVISION_LOOKBACK)
    result, _ = await svc.approve_tx(tx(db), db, PID, ADMIN, versions, NOW)
    assert result.status == "approved" and _ledger(db) == {}
    assert "beyond the lookback window" in caplog.text


async def test_approval_without_ai_revision_still_approves():
    db = FakeDb()
    _seed(db)
    _seed_revisions(db, "admin", "admin")
    result, _ = await svc.approve_tx(tx(db), db, PID, ADMIN, 2, NOW)
    assert result.status == "approved" and _ledger(db) == {}


@pytest.mark.parametrize("seed", [
    {"quote_number": None},
    {"items": [{"sku": "PIT-001"}]},  # a legacy quote whose lines no longer validate
])
async def test_an_approval_whose_entry_cannot_be_built_still_approves(seed):
    db = FakeDb()
    _seed(db, **seed)
    _seed_revisions(db, "ai")
    result, _ = await svc.approve_tx(tx(db), db, PID, ADMIN, 2, NOW)
    assert result.status == "approved" and _ledger(db) == {}


async def test_approving_the_same_version_again_overwrites_its_entry_and_a_new_version_adds_one():
    db = FakeDb()
    _seed(db, version=1)
    _seed_revisions(db, "ai")
    await svc.approve_tx(tx(db), db, PID, ADMIN, 1, NOW)
    await svc.reopen_tx(tx(db), db, PID, ADMIN, "ricontrollo", NOW)
    later = NOW + timedelta(hours=1)
    await svc.approve_tx(tx(db), db, PID, ADMIN, 1, later)
    assert list(_ledger(db)) == ["PRV-2026-0001_r1"]
    assert _ledger(db)["PRV-2026-0001_r1"]["approved_at"] == later

    await svc.reopen_tx(tx(db), db, PID, ADMIN, "ancora", later)
    await svc.edit_tx(tx(db), db, PID, ADMIN, 1, later, admin_notes="x")
    await svc.approve_tx(tx(db), db, PID, ADMIN, 2, later)
    assert sorted(_ledger(db)) == ["PRV-2026-0001_r1", "PRV-2026-0001_r2"]


class _FailingLedgerWrite(FakeTransaction):
    def set(self, ref, data, merge=False):
        if ref.path[0] == LEDGER:
            raise GoogleAPICallError("write failed")
        super().set(ref, data, merge=merge)


async def test_a_ledger_write_error_propagates_out_of_the_approval_transaction():
    # Same transaction: in Firestore the commit then fails as a whole (the fake applies
    # writes at once, so only the propagation is checked here).
    db = FakeDb()
    _seed(db)
    _seed_revisions(db, "ai")
    with pytest.raises(GoogleAPICallError):
        await svc.approve_tx(_FailingLedgerWrite(db), db, PID, ADMIN, 2, NOW)
