"""The client keeps the quote they received while the admin revises it.

A sent quote reopened in the admin console (sent → in_review → approved → sent
again) must not show the client the revision in progress: list, detail and PDF
keep serving the last revision that went out, until the new one is sent.
"""
from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import firebase_admin.storage
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from src.api.routes import quote_routes
from src.auth.jwt_handler import verify_token
from src.core.rate_limit import limiter
from src.schemas.internal import UserSession
from src.services import client_quote_view
from tests.unit.firestore_fakes import FakeDb

OWNER = "owner-1"
PID = "p-rev"
QUOTE = ("projects", PID, "private_data", "quote")
T_SENT = datetime(2026, 10, 11, 10, 25, tzinfo=UTC)

SENT_ITEMS = [{"sku": "PIT-001", "description": "Pittura", "unit": "mq", "qty": 10.0, "unit_price": 12.0, "total": 120.0}]
NEW_ITEMS = [{"sku": "PIT-001", "description": "Pittura", "unit": "mq", "qty": 15.0, "unit_price": 13.0, "total": 195.0}]
SENT_FIN = {"subtotal": 120.0, "vat_rate": 0.22, "vat_amount": 26.4, "grand_total": 146.4}
NEW_FIN = {"subtotal": 195.0, "vat_rate": 0.22, "vat_amount": 42.9, "grand_total": 237.9}


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(quote_routes, "get_async_firestore_client", lambda: fake)
    limiter.reset()
    fake.put("projects", PID, {"userId": OWNER, "name": "Bagno"})
    return fake


def _client(role: str | None = None) -> TestClient:
    app = FastAPI()
    app.include_router(quote_routes.router)

    async def override() -> UserSession:
        return UserSession(uid=OWNER, email="o@x.it", claims={"role": role} if role else {})

    app.dependency_overrides[verify_token] = override
    return TestClient(app)


def _seed_revised(db: FakeDb, status: str = "in_review") -> None:
    """Sent at v2 (r2.pdf), then revised: now v4 with new prices, not yet sent."""
    db.put(*QUOTE, {
        "project_id": PID, "user_id": OWNER,
        "status": status, "quote_number": "PRV-2026-0001", "version": 4,
        "items": NEW_ITEMS, "financials": NEW_FIN, "admin_notes": "nota nuova",
        "pdf_blob_path": f"projects/{PID}/quotes/PRV-2026-0001_r4.pdf", "pdf_revision": 4,
        "sent_at": T_SENT, "delivery_status": "delivered", "created_at": T_SENT, "updated_at": T_SENT,
    })
    db.put(*QUOTE, "revisions", "2", {"version": 2, "items": SENT_ITEMS, "financials": SENT_FIN,
                                      "admin_notes": "nota inviata"})
    db.put(*QUOTE, "deliveries", "d1", {
        "revision": 2, "pdf_blob_path": f"projects/{PID}/quotes/PRV-2026-0001_r2.pdf",
        "status": "delivered", "sent_at": T_SENT,
    })


@pytest.mark.parametrize("status", ["in_review", "approved", "pending_review", "rejected"])
def test_the_owner_sees_the_version_they_were_sent(db, status):
    _seed_revised(db, status=status)
    body = _client().get(f"/api/quote/{PID}").json()
    assert body["status"] == "sent"
    assert body["items"][0]["qty"] == 10.0 and body["items"][0]["unit_price"] == 12.0
    assert body["financials"]["grand_total"] == 146.4
    assert body["admin_notes"] == "nota inviata"
    assert body["version"] == 2


def test_the_admin_still_sees_the_revision_in_progress(db):
    _seed_revised(db)
    body = _client(role="admin").get(f"/api/quote/{PID}").json()
    assert body["status"] == "in_review" and body["financials"]["grand_total"] == 237.9


def test_the_list_shows_the_total_and_pdf_they_were_sent(db):
    _seed_revised(db)
    rows = _client().get(f"/api/quote/user/{OWNER}").json()
    assert len(rows) == 1
    assert rows[0]["status"] == "sent" and rows[0]["grand_total"] == 146.4
    assert rows[0]["item_count"] == 1 and rows[0]["pdf_available"] is True


def test_the_pdf_link_is_the_one_they_were_sent(db, monkeypatch):
    _seed_revised(db, status="approved")  # re-approved, new r4.pdf exists, not sent yet
    asked: list[str] = []

    def blob(path: str):
        asked.append(path)
        return SimpleNamespace(exists=lambda: True, generate_signed_url=lambda **_: f"https://signed/{path}")

    monkeypatch.setattr(firebase_admin.storage, "bucket", lambda: SimpleNamespace(blob=blob))
    resp = _client().get(f"/api/quote/{PID}/pdf")
    assert resp.status_code == 200
    assert asked == [f"projects/{PID}/quotes/PRV-2026-0001_r2.pdf"]


def test_once_the_new_revision_is_sent_the_owner_sees_it(db):
    _seed_revised(db, status="sent")
    body = _client().get(f"/api/quote/{PID}").json()
    assert body["financials"]["grand_total"] == 237.9 and body["version"] == 4


def test_a_bounced_send_is_not_what_the_client_has(db):
    _seed_revised(db)
    db.put(*QUOTE, "revisions", "3", {"version": 3, "items": NEW_ITEMS, "financials": NEW_FIN})
    db.put(*QUOTE, "deliveries", "d2", {"revision": 3, "pdf_blob_path": "x_r3.pdf", "status": "bounced",
                                        "sent_at": datetime(2026, 10, 12, tzinfo=UTC)})
    assert _client().get(f"/api/quote/{PID}").json()["version"] == 2


def test_without_the_sent_revision_nothing_of_the_draft_leaks(db):
    _seed_revised(db)
    db.docs.pop((*QUOTE, "revisions", "2"))
    body = _client().get(f"/api/quote/{PID}").json()
    assert body["status"] == "in_review"
    assert not (body.get("financials") or {}).get("grand_total")
    assert all(item["unit_price"] == 0.0 for item in body["items"])
    assert _client().get(f"/api/quote/{PID}/pdf").status_code == 404
    rows = _client().get(f"/api/quote/user/{OWNER}").json()
    assert rows[0]["grand_total"] == 0.0 and rows[0]["pdf_available"] is False


def test_the_owner_cannot_delete_a_quote_they_were_sent_while_it_is_revised(db):
    _seed_revised(db)
    assert _client().delete(f"/api/quote/{PID}").status_code == 409
    assert db.get_data(*QUOTE)["status"] == "in_review"


def test_only_a_sent_quote_under_revision_is_swapped():
    assert not client_quote_view.serves_sent_copy({"status": "in_review"})
    assert not client_quote_view.serves_sent_copy({"status": "sent", "sent_at": T_SENT})
    assert not client_quote_view.serves_sent_copy({"status": "deleted", "sent_at": T_SENT})
    assert client_quote_view.serves_sent_copy({"status": "in_review", "sent_at": T_SENT})
