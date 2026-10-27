"""Direct quote submission — Phase 138 PR-4 (src/services/quote_submission.py
and POST /api/quote/{project_id}/submit).

One transaction: draft → pending_review + the admin email in the outbox (with
the project id, so the GDPR erasure finds it). Idempotent by status and by
Idempotency-Key; only the owner, never a guest."""
import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from src.api.routes import quote_routes
from src.auth.jwt_handler import verify_token
from src.core.config import settings
from src.core.exceptions import (
    AppException,
    EmptyQuoteError,
    InvalidQuoteTransitionError,
    PermissionDenied,
    QuoteNotFoundError,
    ResourceNotFound,
)
from src.core.rate_limit import limiter
from src.schemas.internal import UserSession
from src.services import quote_submission
from src.services.email import outbox
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

PID = "proj-1"
OWNER = "owner-uid"
QUOTE = ("projects", PID, "private_data", "quote")
NOW = datetime(2026, 10, 27, 10, 0, tzinfo=UTC)
KEY = "key-00000001"


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()

    async def transact(_db, body):
        return await body(FakeTransaction(fake))

    monkeypatch.setattr(quote_submission, "get_async_firestore_client", lambda: fake)
    monkeypatch.setattr(quote_submission, "_transact", transact)
    monkeypatch.setattr(quote_submission, "emit_audit_event", lambda *a, **k: None)
    monkeypatch.setattr(settings, "ADMIN_EMAIL", "team@example.it")
    return fake


@pytest.fixture
def dispatch(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr(quote_submission, "_dispatch", mock)
    return mock


def _seed(db: FakeDb, status: str = "draft", items: list | None = None, owner: str = OWNER) -> None:
    db.put("projects", PID, {"userId": owner, "name": "Casa Rossi"})
    db.put(*QUOTE, {
        "project_id": PID, "user_id": owner, "status": status, "quote_number": "PRV-2026-0042",
        "items": [{"sku": "PAV-001"}] if items is None else items,
        "financials": {"subtotal": 100.0, "vat_rate": 0.22, "vat_amount": 22.0, "grand_total": 122.0},
        "client_snapshot": {"uid": owner, "display_name": "Mario Rossi", "email": "mario@example.it"},
        "request": {"summary": "Bagno e cucina"},
    })


def _outbox_entries(db: FakeDb) -> list[dict]:
    return [data for path, data in db.docs.items() if path[0] == outbox.OUTBOX]


# ── Service ───────────────────────────────────────────────────────────────────


async def test_submit_moves_the_draft_to_review_and_queues_one_admin_email(db, dispatch):
    _seed(db)
    result = await quote_submission.submit_project_quote(OWNER, PID, idempotency_key=KEY, now=NOW)

    assert result == quote_submission.SubmissionResult(PID, "pending_review", "PRV-2026-0042", duplicate=False)
    assert db.get_data(*QUOTE)["status"] == "pending_review"
    [entry] = _outbox_entries(db)
    assert entry["kind"] == "admin_notification" and entry["status"] == "pending"
    assert entry["project_id"] == PID  # found by the GDPR erasure (email_outbox step)
    assert entry["message"]["to"] == "team@example.it"
    assert "PRV-2026-0042" in entry["message"]["subject"]
    assert "Bagno e cucina" in entry["message"]["text"]
    dispatch.assert_awaited_once_with(db, quote_submission.submission_id_for(PID, KEY), NOW)


async def test_without_an_idempotency_key_the_email_gets_its_own_id(db, dispatch):
    _seed(db)
    await quote_submission.submit_project_quote(OWNER, PID, now=NOW)
    assert len(_outbox_entries(db)) == 1
    dispatch.assert_awaited_once()


@pytest.mark.parametrize("status", ["pending_review", "in_review", "approved", "sent"])
async def test_a_quote_already_with_the_team_is_not_sent_again(db, dispatch, status):
    _seed(db, status=status)
    result = await quote_submission.submit_project_quote(OWNER, PID, idempotency_key=KEY, now=NOW)
    assert result.duplicate and result.status == status
    assert db.get_data(*QUOTE)["status"] == status
    assert _outbox_entries(db) == []
    dispatch.assert_not_awaited()


async def test_the_same_idempotency_key_answers_like_the_first_request(db, dispatch):
    _seed(db)
    await quote_submission.submit_project_quote(OWNER, PID, idempotency_key=KEY, now=NOW)
    db.apply_update(QUOTE, {"status": "in_review"})  # the admin opened it meanwhile
    again = await quote_submission.submit_project_quote(OWNER, PID, idempotency_key=KEY, now=NOW)
    assert again.duplicate and again.status == "in_review"
    assert len(_outbox_entries(db)) == 1
    assert dispatch.await_count == 1


async def test_a_rejected_quote_cannot_be_submitted(db, dispatch):
    _seed(db, status="rejected")
    with pytest.raises(InvalidQuoteTransitionError):
        await quote_submission.submit_project_quote(OWNER, PID, now=NOW)
    assert _outbox_entries(db) == []


async def test_an_empty_draft_is_refused(db, dispatch):
    _seed(db, items=[])
    with pytest.raises(EmptyQuoteError):
        await quote_submission.submit_project_quote(OWNER, PID, now=NOW)
    assert db.get_data(*QUOTE)["status"] == "draft"


@pytest.mark.parametrize("status", [None, "deleted"])
async def test_a_missing_or_deleted_quote_is_not_found(db, dispatch, status):
    db.put("projects", PID, {"userId": OWNER})
    if status:
        db.put(*QUOTE, {"status": status, "items": [{"sku": "X"}]})
    with pytest.raises(QuoteNotFoundError):
        await quote_submission.submit_project_quote(OWNER, PID, now=NOW)


async def test_only_the_owner_can_submit(db, dispatch):
    _seed(db)
    with pytest.raises(PermissionDenied):
        await quote_submission.submit_project_quote("someone-else", PID, now=NOW)
    assert db.get_data(*QUOTE)["status"] == "draft"


async def test_a_legacy_owner_field_is_accepted(db, dispatch):
    _seed(db)
    db.put("projects", PID, {"user_id": OWNER})  # legacy projection, no `userId`
    result = await quote_submission.submit_project_quote(OWNER, PID, now=NOW)
    assert result.status == "pending_review"


async def test_an_unknown_project_is_not_found(db, dispatch):
    with pytest.raises(ResourceNotFound):
        await quote_submission.submit_project_quote(OWNER, PID, now=NOW)


async def test_without_admin_email_the_quote_is_still_submitted(db, dispatch, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAIL", "")
    _seed(db)
    result = await quote_submission.submit_project_quote(OWNER, PID, now=NOW)
    assert result.status == "pending_review" and not result.duplicate
    assert _outbox_entries(db) == []
    dispatch.assert_not_awaited()


async def test_dispatch_schedules_the_safety_task_then_sends(monkeypatch):
    schedule, send = AsyncMock(return_value=True), AsyncMock()
    monkeypatch.setattr(outbox, "schedule_dispatch", schedule)
    monkeypatch.setattr(outbox, "dispatch_one", send)
    await quote_submission._dispatch(object(), "submit_x", NOW)
    await asyncio.gather(*quote_submission._background_tasks)
    schedule.assert_awaited_once_with("submit_x", NOW + outbox.SAFETY_DELAY, "safety")
    send.assert_awaited_once()


# ── Route ─────────────────────────────────────────────────────────────────────


def _client(*, uid: str = OWNER, anonymous: bool = False) -> TestClient:
    app = FastAPI()
    app.include_router(quote_routes.router)

    @app.exception_handler(AppException)
    async def _handler(_request: Request, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content={"error_code": exc.error_code})

    async def _session():
        return UserSession(uid=uid, is_authenticated=not anonymous, is_anonymous=anonymous)

    app.dependency_overrides[verify_token] = _session
    limiter.reset()
    return TestClient(app)


def test_the_route_submits_the_owners_quote(db, dispatch):
    _seed(db)
    resp = _client().post(f"/api/quote/{PID}/submit", headers={"Idempotency-Key": KEY})
    assert resp.status_code == 200
    assert resp.json() == {
        "project_id": PID, "status": "pending_review", "quote_number": "PRV-2026-0042", "duplicate": False,
    }


@pytest.mark.parametrize("key", [None, "short"])
def test_the_route_needs_an_idempotency_key(db, dispatch, key):
    _seed(db)
    headers = {"Idempotency-Key": key} if key else {}
    resp = _client().post(f"/api/quote/{PID}/submit", headers=headers)
    assert resp.status_code == 428 and resp.json()["error_code"] == "IDEMPOTENCY_KEY_REQUIRED"
    assert db.get_data(*QUOTE)["status"] == "draft"


def test_a_guest_cannot_submit(db, dispatch):
    _seed(db)
    resp = _client(anonymous=True).post(f"/api/quote/{PID}/submit", headers={"Idempotency-Key": KEY})
    assert resp.status_code == 403
    assert db.get_data(*QUOTE)["status"] == "draft"


@pytest.mark.parametrize(
    ("uid", "status", "code"),
    [("someone-else", "draft", 403), (OWNER, "rejected", 409)],
)
def test_the_route_maps_refusals(db, dispatch, uid, status, code):
    _seed(db, status=status)
    resp = _client(uid=uid).post(f"/api/quote/{PID}/submit", headers={"Idempotency-Key": KEY})
    assert resp.status_code == code
