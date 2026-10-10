"""Admin quote review domain (src/services/admin_quotes.py) — Phase 128 PR 3.1.

Transaction bodies run against the in-memory Firestore fake: version checks,
review lock, state machine, revisions with diff, server-side totals.
"""
from datetime import UTC, datetime, timedelta

import pytest
from src.core.exceptions import (
    InvalidQuoteTransitionError,
    MediaNotFoundError,
    PreconditionRequiredError,
    QuoteLockedError,
    QuoteNotFoundError,
    QuoteVersionConflictError,
)
from src.schemas.quote import QuoteItem, QuoteSchema
from src.services import admin_quotes as svc
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
    assert row["grand_total"] == 816.91 and row["item_count"] == 2
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
