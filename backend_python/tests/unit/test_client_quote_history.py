"""The house quote for its owner (Phase 139 PR-3): no quote is not an error,
the revision in progress (without prices) and every revision they received."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import firebase_admin.storage
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from src.api.routes import quote_routes
from src.auth.jwt_handler import verify_token
from src.core.exceptions import AppException
from src.core.rate_limit import limiter
from src.schemas.internal import UserSession
from tests.unit.firestore_fakes import FakeDb

OWNER = "owner-1"
PID = "chat-1"
QUOTE = ("projects", PID, "private_data", "quote")
T1 = datetime(2026, 10, 5, 9, 0, tzinfo=UTC)
T2 = T1 + timedelta(days=7)

ITEM = {"sku": "PIT-001", "description": "Pittura", "unit": "mq", "qty": 10.0, "unit_price": 12.0, "total": 120.0,
        "room_id": "r_bagno"}
FIN_R2 = {"subtotal": 120.0, "vat_rate": 0.22, "vat_amount": 26.4, "grand_total": 146.4}
FIN_R3 = {"subtotal": 200.0, "vat_rate": 0.22, "vat_amount": 44.0, "grand_total": 244.0}


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(quote_routes, "get_async_firestore_client", lambda: fake)
    limiter.reset()
    fake.put("projects", PID, {"userId": OWNER})
    return fake


def _client(uid: str = OWNER, role: str | None = None) -> TestClient:
    app = FastAPI()
    app.include_router(quote_routes.router)

    @app.exception_handler(AppException)
    async def _handler(_request: Request, exc: AppException):  # what main.py registers
        return JSONResponse(status_code=exc.status_code, content={"error_code": exc.error_code})

    async def override() -> UserSession:
        return UserSession(uid=uid, email="o@x.it", claims={"role": role} if role else {})

    app.dependency_overrides[verify_token] = override
    return TestClient(app)


def _delivery(db: FakeDb, did: str, revision: int, sent_at: datetime, status: str = "delivered") -> None:
    db.put(*QUOTE, "deliveries", did, {
        "revision": revision, "pdf_blob_path": f"projects/{PID}/quotes/PRV-2026-0001_r{revision}.pdf",
        "status": status, "sent_at": sent_at,
    })


def _seed(db: FakeDb, status: str = "draft", **extra) -> None:
    """Sent as rev. 2, resent once, then rev. 3 sent; now rev. 5 opened from the chat."""
    db.put(*QUOTE, {
        "project_id": PID, "user_id": OWNER, "status": status, "quote_number": "PRV-2026-0001", "version": 5,
        "items": [ITEM], "rooms": [{"room_id": "r_bagno", "room_label": "Bagno", "room_type": "bagno", "room_subtotal": 120.0}],
        "financials": FIN_R3, "sent_at": T2, "delivery_status": "delivered", "created_at": T1, "updated_at": T2,
        "client_revision": True,
        **extra,
    })
    db.put(*QUOTE, "revisions", "2", {"version": 2, "items": [ITEM], "financials": FIN_R2})
    db.put(*QUOTE, "revisions", "3", {"version": 3, "items": [ITEM], "financials": FIN_R3})
    _delivery(db, "d1", 2, T1)
    _delivery(db, "d2", 2, T1 + timedelta(hours=1))  # resent: same revision
    _delivery(db, "d3", 3, T2)
    _delivery(db, "d4", 4, T2 + timedelta(days=1), status="bounced")  # never reached the client


# ── GET /{id}: no quote is a normal state ─────────────────────────────────────


@pytest.mark.parametrize("stored", [None, {"status": "deleted", "project_id": PID, "user_id": OWNER}])
def test_a_house_without_a_quote_answers_null_not_404(db, stored):
    if stored:
        db.put(*QUOTE, stored)
    resp = _client().get(f"/api/quote/{PID}")
    assert resp.status_code == 200
    assert resp.json() is None


def test_the_team_followup_is_not_shown_to_the_client(db):
    _seed(db, "in_review", client_followup={"requested_at": T2, "count": 2, "version": 5})
    assert _client().get(f"/api/quote/{PID}").json()["client_followup"] is None
    admin = _client(uid="admin-1", role="admin").get(f"/api/quote/{PID}").json()
    assert admin["client_followup"]["count"] == 2



@pytest.mark.parametrize("status", ["draft", "approved", "sent"])
def test_the_client_sees_the_precision_not_the_range(db, status):
    """Phase 140 step 3: the range is the team's (amounts before approval); the
    client reads its precision only, the admin reads it all."""
    _seed(db, status, estimate={"low": 1100.0, "high": 1400.0, "precision": 90, "policy_version": "1.0.0"})
    assert _client().get(f"/api/quote/{PID}").json()["estimate"] == {"precision": 90}
    admin = _client(uid="admin-1", role="admin").get(f"/api/quote/{PID}").json()
    assert admin["estimate"]["low"] == 1100.0


def test_a_draft_without_a_range_has_no_estimate(db):
    _seed(db, "draft")
    assert _client().get(f"/api/quote/{PID}").json()["estimate"] is None

# ── GET /{id}/history ─────────────────────────────────────────────────────────


def test_the_history_lists_every_revision_the_client_received_newest_first(db):
    _seed(db)
    body = _client().get(f"/api/quote/{PID}/history").json()
    assert [(r["revision"], r["grand_total"], r["pdf_available"]) for r in body["sent"]] == [
        (3, 244.0, True), (2, 146.4, True),
    ]
    assert body["sent"][1]["sent_at"].startswith("2026-10-05T09:00")  # the first time it was sent


def test_the_revision_the_client_asked_for_is_shown_without_prices(db):
    _seed(db, "draft")
    progress = _client().get(f"/api/quote/{PID}/history").json()["in_progress"]
    assert progress["state"] == "draft"
    assert [(i["sku"], i["room_id"], i["unit_price"], i["total"]) for i in progress["items"]] == [
        ("PIT-001", "r_bagno", 0.0, 0.0),
    ]
    assert [(r["room_id"], r["room_label"], r["room_subtotal"]) for r in progress["rooms"]] == [
        ("r_bagno", "Bagno", 0.0),
    ]


def test_the_revision_in_progress_has_no_line_reasoning(db):
    # The reasoning names library formulas and coefficients: the team's, not the client's.
    _seed(db, "draft", items=[ITEM | {"ai_reasoning": "Pareti: pittura (mq_pareti * 1 con mq_pareti=10)"}])
    progress = _client().get(f"/api/quote/{PID}/history").json()["in_progress"]
    assert [i["ai_reasoning"] for i in progress["items"]] == [None]


@pytest.mark.parametrize(
    ("status", "state"),
    [("pending_review", "with_team"), ("in_review", "with_team"), ("approved", "with_team"), ("rejected", "rejected")],
)
def test_once_the_team_has_the_revision_only_its_state_is_shown(db, status, state):
    # The team may be editing the lines: work in progress stays confidential.
    _seed(db, status)
    progress = _client().get(f"/api/quote/{PID}/history").json()["in_progress"]
    assert (progress["state"], progress["items"], progress["rooms"]) == (state, [], [])


@pytest.mark.parametrize("status", ["in_review", "approved", "rejected"])
def test_a_revision_the_admin_opened_is_not_shown_to_the_client(db, status):
    # "Rivedi preventivo" in the admin console: the client keeps the quote they received, nothing else.
    _seed(db, status, client_revision=None)
    body = _client().get(f"/api/quote/{PID}/history").json()
    assert body["in_progress"] is None
    assert [r["revision"] for r in body["sent"]] == [3, 2]


def test_the_marker_is_not_shown_to_the_client(db):
    _seed(db, "in_review")
    assert _client().get(f"/api/quote/{PID}").json()["client_revision"] is None


@pytest.mark.parametrize("delivery_status", ["delivered", "queued"])
def test_a_sent_quote_has_no_revision_in_progress(db, delivery_status):
    _seed(db, "sent", delivery_status=delivery_status)
    assert _client().get(f"/api/quote/{PID}/history").json()["in_progress"] is None


def test_a_quote_never_sent_has_an_empty_history(db):
    db.put(*QUOTE, {"project_id": PID, "user_id": OWNER, "status": "draft", "items": [ITEM]})
    assert _client().get(f"/api/quote/{PID}/history").json() == {"in_progress": None, "sent": []}


def test_a_house_without_a_quote_has_an_empty_history(db):
    assert _client().get(f"/api/quote/{PID}/history").json() == {"in_progress": None, "sent": []}


def test_the_history_is_only_for_the_owner(db):
    _seed(db)
    assert _client(uid="intruder").get(f"/api/quote/{PID}/history").status_code == 403


# ── GET /{id}/pdf?revision=N ──────────────────────────────────────────────────


@pytest.fixture
def signed(monkeypatch):
    asked: list[str] = []

    def blob(path: str):
        asked.append(path)
        return SimpleNamespace(exists=lambda: True, generate_signed_url=lambda **_: f"https://signed/{path}")

    monkeypatch.setattr(firebase_admin.storage, "bucket", lambda: SimpleNamespace(blob=blob))
    return asked


def test_the_pdf_of_an_older_revision_they_received(db, signed):
    _seed(db)
    resp = _client().get(f"/api/quote/{PID}/pdf", params={"revision": 2})
    assert resp.status_code == 200
    assert signed == [f"projects/{PID}/quotes/PRV-2026-0001_r2.pdf"]


@pytest.mark.parametrize("revision", [4, 5, 99])  # bounced, the draft, never existed
def test_no_pdf_of_a_revision_the_client_never_received(db, signed, revision):
    _seed(db)
    resp = _client().get(f"/api/quote/{PID}/pdf", params={"revision": revision})
    assert resp.status_code == 404
    assert signed == []


def test_the_pdf_of_a_revision_is_only_for_the_owner(db, signed):
    _seed(db)
    assert _client(uid="intruder").get(f"/api/quote/{PID}/pdf", params={"revision": 2}).status_code == 403
    assert signed == []


# ── DELETE /{id} goes through the state machine ───────────────────────────────


def test_a_legacy_status_is_not_deleted_by_hand(db):
    db.put(*QUOTE, {"project_id": PID, "user_id": OWNER, "status": "delivered"})
    assert _client().delete(f"/api/quote/{PID}").status_code == 409
    assert db.get_data(*QUOTE)["status"] == "delivered"


def test_a_draft_is_still_deleted(db):
    db.put(*QUOTE, {"project_id": PID, "user_id": OWNER, "status": "draft"})
    assert _client().delete(f"/api/quote/{PID}").status_code == 204
    assert db.get_data(*QUOTE)["status"] == "deleted"
