"""/api/admin quote review routes (Phase 128 PR 3.1): authorisation, If-Match,
dossier, approval + PDF (never an email), list."""
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from src.api.routes import admin_quotes as routes
from src.auth.jwt_handler import verify_token
from src.core.exceptions import AppException
from src.schemas.internal import UserSession
from src.services.client_profile import ClientProfile
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

PID = "p1"
QUOTE = ("projects", PID, "private_data", "quote")
T0 = datetime(2026, 10, 10, 9, tzinfo=UTC)


def _seed(db: FakeDb, **overrides) -> None:
    doc = {
        "doc_type": "quote", "project_id": PID, "user_id": "uid-1", "status": "pending_review",
        "quote_number": "PRV-2026-0001", "version": 2, "created_at": T0, "updated_at": T0,
        "items": [{"sku": "PIT-001", "description": "Pittura", "unit": "mq", "qty": 10.0,
                   "unit_price": 12.0, "total": 120.0, "manual_override": False}],
        "financials": {"subtotal": 120.0, "vat_rate": 0.22, "vat_amount": 26.4, "grand_total": 146.4},
        "client_snapshot": {"uid": "uid-1", "display_name": "Mario Rossi", "email": "m@x.it"},
        "request": {"summary": "Pittura soggiorno", "channel": "chat", "session_id": PID},
        "media": [{"media_id": "f1", "kind": "input_photo", "blob_path": f"user-uploads/{PID}/a.jpg",
                   "label": "Foto 1"}],
    }
    doc.update(overrides)
    db.put(*QUOTE, doc)
    db.put("projects", PID, {"name": "Cucina", "userId": "uid-1"})


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(routes, "get_async_firestore_client", lambda: fake)

    async def run(body):
        return await body(FakeTransaction(fake), fake)

    monkeypatch.setattr(routes, "_run", run)
    monkeypatch.setattr(routes.svc, "sign_url_sync", lambda path, disposition: f"https://signed/{path}")
    monkeypatch.setattr(routes, "emit_audit_event", lambda *a, **k: None)
    return fake


def _client(role: str | None = "admin") -> TestClient:
    app = FastAPI()
    app.include_router(routes.router)

    @app.exception_handler(AppException)
    async def _handler(_request: Request, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content={"error_code": exc.error_code, "detail": exc.detail})

    async def _session():
        claims = {"role": role} if role else {}
        return UserSession(uid="admin-a", email="a@syd.it", is_authenticated=True, claims=claims)

    app.dependency_overrides[verify_token] = _session
    return TestClient(app)


@pytest.mark.parametrize("path", ["/api/admin/me", "/api/admin/quotes", f"/api/admin/quotes/{PID}"])
def test_non_admin_is_refused(db, path):
    resp = _client(role=None).get(path)
    assert resp.status_code == 403 and resp.json()["error_code"] == "ADMIN_REQUIRED"


def test_me(db):
    assert _client().get("/api/admin/me").json() == {"uid": "admin-a", "email": "a@syd.it", "role": "admin", "mfa": False}


def test_dossier_has_client_request_media_and_etag(db):
    _seed(db)
    profile = ClientProfile(name="Mario Rossi", email="nuova@x.it")
    with patch.object(routes, "get_client_profile", new=AsyncMock(return_value=profile)):
        resp = _client().get(f"/api/admin/quotes/{PID}")

    assert resp.status_code == 200 and resp.headers["ETag"] == '"v2"'
    body = resp.json()
    assert body["project_name"] == "Cucina" and body["etag"] == '"v2"'
    assert body["quote"]["client_snapshot"]["display_name"] == "Mario Rossi"
    assert body["quote"]["request"]["summary"] == "Pittura soggiorno"
    assert body["media"][0]["url"] == f"https://signed/user-uploads/{PID}/a.jpg"
    assert body["client_profile_changed"] is True  # email changed since the snapshot


def test_edit_needs_if_match_and_the_current_version(db):
    _seed(db)
    client = _client()
    body = {"admin_notes": "Valido 30 giorni"}

    assert client.patch(f"/api/admin/quotes/{PID}", json=body).status_code == 428
    stale = client.patch(f"/api/admin/quotes/{PID}", json=body, headers={"If-Match": '"v1"'})
    assert stale.status_code == 409 and stale.json()["error_code"] == "VERSION_CONFLICT"

    ok = client.patch(f"/api/admin/quotes/{PID}", json=body, headers={"If-Match": '"v2"'})
    assert ok.status_code == 200 and ok.headers["ETag"] == '"v3"'
    assert ok.json()["status"] == "in_review"
    assert db.get_data(*QUOTE)["admin_notes"] == "Valido 30 giorni"


def test_edit_rejects_unknown_fields(db):
    _seed(db)
    resp = _client().patch(f"/api/admin/quotes/{PID}", json={"status": "approved"}, headers={"If-Match": '"v2"'})
    assert resp.status_code == 422


def test_approve_renders_the_pdf_and_never_emails(db, monkeypatch):
    _seed(db)
    uploads: list[str] = []
    monkeypatch.setattr(routes.PdfService, "generate_pdf_bytes", lambda self, data: b"%PDF" + data["client_name"].encode())
    monkeypatch.setattr(routes.svc, "upload_pdf_sync", lambda data, path: uploads.append(path))

    resp = _client().post(f"/api/admin/quotes/{PID}/approve", headers={"If-Match": '"v2"'})

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "approved" and body["pdf_ready"] is True and body["pdf_preview_url"]
    assert uploads == [f"projects/{PID}/quotes/PRV-2026-0001_r2.pdf"]
    doc = db.get_data(*QUOTE)
    assert doc["pdf_blob_path"] == uploads[0] and doc["pdf_revision"] == 2
    assert not hasattr(routes, "NotificationService")  # approval and sending are separate steps


def test_pdf_failure_does_not_undo_the_approval(db, monkeypatch):
    _seed(db)

    def boom(self, data):
        raise RuntimeError("reportlab")

    monkeypatch.setattr(routes.PdfService, "generate_pdf_bytes", boom)
    resp = _client().post(f"/api/admin/quotes/{PID}/approve", headers={"If-Match": '"v2"'})
    assert resp.status_code == 200 and resp.json()["pdf_ready"] is False
    assert db.get_data(*QUOTE)["status"] == "approved"


def test_reject_requires_a_reason(db):
    _seed(db)
    client = _client()
    assert client.post(f"/api/admin/quotes/{PID}/reject", json={}).status_code == 422
    resp = client.post(f"/api/admin/quotes/{PID}/reject", json={"reason": "Fuori zona"})
    assert resp.status_code == 200 and resp.json()["status"] == "rejected"


def test_illegal_transition_is_409(db):
    _seed(db, status="rejected")
    resp = _client().post(f"/api/admin/quotes/{PID}/approve", headers={"If-Match": '"v2"'})
    assert resp.status_code == 409 and resp.json()["error_code"] == "INVALID_TRANSITION"


def test_media_url_with_readable_filename(db):
    _seed(db)
    resp = _client().get(f"/api/admin/quotes/{PID}/media/f1/url?disposition=attachment")
    assert resp.status_code == 200 and resp.json()["filename"] == "PRV-2026-0001_foto-1.jpg"
    assert _client().get(f"/api/admin/quotes/{PID}/media/nope/url").status_code == 404


def test_list_maps_status_shortcuts(db):
    rows = [routes.svc.list_row(PID, {"quote_number": "PRV-2026-0001", "status": "pending_review"})]
    with patch.object(routes.svc, "list_quotes", new=AsyncMock(return_value=(rows, "next"))) as listing:
        resp = _client().get("/api/admin/quotes?status=open&q=Rossi&limit=10")
    assert resp.status_code == 200
    assert resp.json()["items"][0]["quote_number"] == "PRV-2026-0001" and resp.json()["next_cursor"] == "next"
    _db, statuses, search, limit, cursor = listing.await_args.args
    assert statuses == ["draft", "pending_review", "in_review"] and search == "Rossi" and limit == 10


def test_unsafe_project_id_is_rejected(db):
    assert _client().get("/api/admin/quotes/..%2Fusers").status_code in (404, 422)
