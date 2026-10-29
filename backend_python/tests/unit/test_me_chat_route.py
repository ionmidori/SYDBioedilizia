"""GET /api/me/chat: the signed-in user's chat id, assigned by the backend (Phase 139)."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from main import app_exception_handler
from src.api.routes import me as routes
from src.auth.jwt_handler import verify_token
from src.core.exceptions import AppException
from src.core.rate_limit import limiter
from src.db import transactions
from src.schemas.internal import UserSession
from src.services.user_chat import service
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

USER = "user-uid-1"
REGISTERED = UserSession(uid=USER, email="u@test.com", is_authenticated=True)
ANONYMOUS = UserSession(uid="anon-uid-1", is_authenticated=True, is_anonymous=True)


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()

    async def transact(_db, body):
        return await body(FakeTransaction(fake))

    monkeypatch.setattr(transactions, "run_transaction", transact)
    monkeypatch.setattr(routes, "get_async_firestore_client", lambda: fake)
    monkeypatch.setattr(service, "emit_audit_event", lambda *args, **kwargs: None)
    limiter.reset()
    return fake


def _client(user: UserSession | None) -> TestClient:
    app = FastAPI()
    app.include_router(routes.router)
    app.add_exception_handler(AppException, app_exception_handler)
    if user is not None:
        async def override_verify_token():
            return user

        app.dependency_overrides[verify_token] = override_verify_token
    return TestClient(app)


def test_returns_the_users_chat(db):
    db.put("sessions", "uuid-mine", {"userId": USER})

    resp = _client(REGISTERED).get("/api/me/chat")

    assert resp.status_code == 200
    assert resp.json() == {"chat_id": "uuid-mine", "created": False}
    assert db.get_data("users", USER)["chat_id"] == "uuid-mine"


def test_creates_the_chat_once(db):
    client = _client(REGISTERED)

    first = client.get("/api/me/chat").json()
    second = client.get("/api/me/chat").json()

    assert first["created"] is True
    assert second == {"chat_id": first["chat_id"], "created": False}


def test_guest_is_refused(db):
    resp = _client(ANONYMOUS).get("/api/me/chat")

    assert resp.status_code == 403
    assert resp.json()["error_code"] == "USER_CHAT_SIGN_IN_REQUIRED"
    assert db.docs == {}


def test_requires_a_token(db):
    resp = _client(None).get("/api/me/chat")

    assert resp.status_code == 401


def test_is_rate_limited(db):
    client = _client(REGISTERED)
    statuses = [client.get("/api/me/chat").status_code for _ in range(61)]

    assert statuses[:60] == [200] * 60
    assert statuses[60] == 429
