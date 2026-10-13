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
from src.services import batch_sync
from src.services.client_profile import ClientProfile
from src.services.email.console import ConsoleProvider
from src.services.email.types import ProviderError
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

    async def transact(_db, body):
        return await body(FakeTransaction(fake))

    monkeypatch.setattr(batch_sync, "_transact", transact)
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


# ── Send (Phase 4: outbox) ────────────────────────────────────────────────────

APPROVED = {
    "status": "approved",
    "pdf_blob_path": f"projects/{PID}/quotes/PRV-2026-0001_r2.pdf",
    "pdf_revision": 2,
    "review": {"approved_by": "admin-a", "approved_at": T0, "approved_revision": 2},
}


@pytest.fixture
def mail(db, monkeypatch):
    """Real outbox + dispatcher on the fake Firestore, Console provider."""
    provider = ConsoleProvider()

    async def transact(_db, body):
        return await body(FakeTransaction(db))

    monkeypatch.setattr(routes.outbox, "_transact", transact)
    monkeypatch.setattr(routes.outbox, "_download_sync", lambda path: b"%PDF")
    monkeypatch.setattr(routes, "get_email_provider", lambda: provider)
    return provider


def test_send_defaults_prefill_the_client_email(db, mail):
    _seed(db, **APPROVED)
    resp = _client().get(f"/api/admin/quotes/{PID}/send-defaults")
    assert resp.status_code == 200
    body = resp.json()
    assert body["to"] == "m@x.it" and body["to_source"] == "snapshot"
    assert body["subject"] == "Bozza di preventivo PRV-2026-0001 – SYD Bioedilizia"
    assert body["attachment_name"] == "Bozza_preventivo_PRV-2026-0001.pdf"
    assert body["pdf_ready"] is True and body["revision"] == 2


def test_send_defaults_refuse_an_unapproved_quote(db, mail):
    _seed(db)  # pending_review
    assert _client().get(f"/api/admin/quotes/{PID}/send-defaults").status_code == 409


def test_send_needs_an_idempotency_key(db, mail):
    _seed(db, **APPROVED)
    resp = _client().post(f"/api/admin/quotes/{PID}/send", json={"to": "m@x.it"})
    assert resp.status_code == 428 and resp.json()["error_code"] == "IDEMPOTENCY_KEY_REQUIRED"


def test_send_to_a_recipient_chosen_by_the_admin(db, mail):
    _seed(db, **APPROVED)
    resp = _client().post(
        f"/api/admin/quotes/{PID}/send",
        json={"to": "altro.indirizzo@example.it", "cc": ["socio@example.it"], "message": "A presto"},
        headers={"Idempotency-Key": "click-0001"},
    )
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "sent" and body["delivery_status"] == "sent" and body["duplicate"] is False
    [email] = mail.sent
    assert email.to == "altro.indirizzo@example.it" and email.cc == ("socio@example.it",)
    assert "A presto" in email.text and email.attachments[0].content == b"%PDF"
    quote = db.get_data(*QUOTE)
    assert quote["status"] == "sent" and quote["delivery_status"] == "sent"


def test_double_click_sends_once(db, mail):
    _seed(db, **APPROVED)
    client = _client()
    first = client.post(f"/api/admin/quotes/{PID}/send", json={"to": "m@x.it"}, headers={"Idempotency-Key": "click-0002"})
    second = client.post(f"/api/admin/quotes/{PID}/send", json={"to": "m@x.it"}, headers={"Idempotency-Key": "click-0002"})
    assert first.json()["delivery_id"] == second.json()["delivery_id"]
    assert second.json()["duplicate"] is True and len(mail.sent) == 1


def test_send_validates_addresses(db, mail):
    _seed(db, **APPROVED)
    resp = _client().post(f"/api/admin/quotes/{PID}/send", json={"to": "non-una-email"},
                          headers={"Idempotency-Key": "click-0003"})
    assert resp.status_code == 422 and mail.sent == []


def test_provider_down_still_answers_and_keeps_the_send_queued(db, mail, monkeypatch):
    _seed(db, **APPROVED)

    class Down:
        name = "smtp"

        async def send(self, email):
            raise ProviderError("down")

    monkeypatch.setattr(routes, "get_email_provider", lambda: Down())
    resp = _client().post(f"/api/admin/quotes/{PID}/send", json={"to": "m@x.it"}, headers={"Idempotency-Key": "click-0004"})
    assert resp.status_code == 202 and resp.json()["delivery_status"] == "queued"
    entry = db.get_data("email_outbox", resp.json()["delivery_id"])
    assert entry["status"] == "pending" and entry["attempts"] == 1  # the sweeper will retry


def test_dossier_lists_the_deliveries(db, mail):
    _seed(db, **APPROVED)
    _client().post(f"/api/admin/quotes/{PID}/send", json={"to": "m@x.it"}, headers={"Idempotency-Key": "click-0005"})
    with patch.object(routes, "get_client_profile", new=AsyncMock(return_value=ClientProfile())):
        body = _client().get(f"/api/admin/quotes/{PID}").json()
    [delivery] = body["deliveries"]
    assert delivery["to"] == "m@x.it" and delivery["status"] == "sent" and delivery["revision"] == 2


# ── Decisions are mirrored on the client's batch ──────────────────────────────


def _seed_batch(db):
    db.put("quote_batches", "b1", {
        "status": "submitted", "user_id": "uid-1",
        "projects": [
            {"project_id": PID, "project_name": "Cucina", "status": "draft"},
            {"project_id": "other", "project_name": "Bagno", "status": "approved"},
        ],
    })
    stored = db.get_data(*QUOTE)
    stored["request"]["batch_id"] = "b1"
    db.put(*QUOTE, stored)


def test_approving_a_quote_updates_its_batch(db, monkeypatch):
    _seed(db)
    _seed_batch(db)
    monkeypatch.setattr(routes.PdfService, "generate_pdf_bytes", lambda self, data: b"%PDF")
    monkeypatch.setattr(routes.svc, "upload_pdf_sync", lambda data, path: None)
    assert _client().post(f"/api/admin/quotes/{PID}/approve", headers={"If-Match": '"v2"'}).status_code == 200
    batch = db.get_data("quote_batches", "b1")
    assert [p["status"] for p in batch["projects"]] == ["approved", "approved"]
    assert batch["status"] == "approved"


def test_rejecting_and_reopening_follow_on_the_batch_without_leaking_the_reason(db):
    _seed(db)
    _seed_batch(db)
    client = _client()
    client.post(f"/api/admin/quotes/{PID}/reject", json={"reason": "Motivo interno riservato"})
    batch = db.get_data("quote_batches", "b1")
    assert batch["projects"][0]["status"] == "rejected" and batch["status"] == "partially_approved"
    assert "admin_notes" not in batch["projects"][0]  # the internal reason never reaches the client

    client.post(f"/api/admin/quotes/{PID}/reopen", json={"reason": "Il cliente ha richiamato"})
    batch = db.get_data("quote_batches", "b1")
    assert batch["projects"][0]["status"] == "draft" and batch["status"] == "submitted"


def test_a_batch_problem_does_not_undo_the_decision(db, monkeypatch):
    from google.api_core.exceptions import ServiceUnavailable

    _seed(db)
    _seed_batch(db)

    async def boom(_db, _body):
        raise ServiceUnavailable("down")

    monkeypatch.setattr(batch_sync, "_transact", boom)
    resp = _client().post(f"/api/admin/quotes/{PID}/reject", json={"reason": "Fuori zona"})
    assert resp.status_code == 200 and resp.json()["status"] == "rejected"


# ── Revising a quote that was already SENT ───────────────────────────────────

SENT = {
    **APPROVED,
    "status": "sent",
    "delivery_status": "delivered",
    "last_delivery_id": "d-first",
    "sent_at": T0,
}


def test_a_sent_quote_can_be_reopened_for_revision_without_touching_what_the_client_got(db):
    _seed(db, **SENT)
    resp = _client().post(f"/api/admin/quotes/{PID}/reopen", json={"reason": "Prezzo del materiale cambiato"})
    assert resp.status_code == 200 and resp.json()["status"] == "in_review"

    doc = db.get_data(*QUOTE)
    assert doc["status"] == "in_review" and doc["review"]["locked_by"] == "admin-a"
    assert doc["review"]["reason"] == "Prezzo del materiale cambiato"
    # what the client was sent stays on record
    assert doc["pdf_blob_path"] == SENT["pdf_blob_path"] and doc["pdf_revision"] == 2
    assert doc["sent_at"] == T0 and doc["last_delivery_id"] == "d-first" and doc["delivery_status"] == "delivered"
    # the old approval is void
    assert "approved_revision" not in doc["review"] and "approved_by" not in doc["review"]


def test_a_quote_under_revision_cannot_be_sent_until_it_is_approved_again(db, mail):
    _seed(db, **SENT)
    client = _client()
    client.post(f"/api/admin/quotes/{PID}/reopen", json={"reason": "Correzione"})
    assert client.get(f"/api/admin/quotes/{PID}/send-defaults").status_code == 409
    resp = client.post(
        f"/api/admin/quotes/{PID}/send", json={"to": "m@x.it"}, headers={"Idempotency-Key": "revise-0001"}
    )
    assert resp.status_code == 409 and resp.json()["error_code"] == "INVALID_TRANSITION"
    assert mail.sent == []  # nothing reached the client


def test_revise_edit_approve_then_send_again(db, mail, monkeypatch):
    _seed(db, **SENT)
    monkeypatch.setattr(routes.PdfService, "generate_pdf_bytes", lambda self, data: b"%PDF")
    uploads: list[str] = []
    monkeypatch.setattr(routes.svc, "upload_pdf_sync", lambda data, path: uploads.append(path))
    client = _client()

    assert client.post(f"/api/admin/quotes/{PID}/reopen", json={"reason": "Nuovo prezzo"}).status_code == 200
    items = [{"sku": "PIT-001", "description": "Pittura", "unit": "mq", "qty": 12.0, "unit_price": 13.0,
              "total": 156.0, "manual_override": True}]
    edited = client.patch(f"/api/admin/quotes/{PID}", json={"items": items, "reason": "Nuovo prezzo"},
                          headers={"If-Match": '"v2"'})
    assert edited.status_code == 200 and edited.json()["version"] == 3  # a new revision, same quote number

    approved = client.post(f"/api/admin/quotes/{PID}/approve", headers={"If-Match": '"v3"'})
    assert approved.status_code == 200 and approved.json()["status"] == "approved"
    assert uploads == [f"projects/{PID}/quotes/PRV-2026-0001_r3.pdf"]  # the first PDF (r2) is not overwritten

    sent = client.post(f"/api/admin/quotes/{PID}/send", json={"to": "m@x.it"}, headers={"Idempotency-Key": "revise-0002"})
    assert sent.status_code == 202 and sent.json()["status"] == "sent"
    assert db.get_data(*QUOTE)["last_delivery_id"] != "d-first"  # a second delivery, the first stays in the history
