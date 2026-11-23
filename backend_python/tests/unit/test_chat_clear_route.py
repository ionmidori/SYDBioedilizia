"""Route tests for `POST /api/chat/{session_id}/clear`."""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from main import app as main_app
from main import app_exception_handler
from src.api.routes import chat_clear as routes
from src.auth.jwt_handler import verify_token
from src.core.exceptions import AppException
from src.core.rate_limit import limiter
from src.db.projects.constants import MERGED_INTO
from src.repositories import conversation_repository, room_repository, spec_store
from src.schemas.internal import UserSession
from src.services import chat_clear as service
from tests.unit.firestore_fakes import FakeDb

UID = "user-uid-1"
OTHER_UID = "user-uid-2"
SID = "sess-chat-1"
T0 = datetime(2026, 11, 20, 10, 0, tzinfo=UTC)
REGISTERED = UserSession(uid=UID, email="u@test.com", is_authenticated=True)


@pytest.fixture()
def db(monkeypatch: pytest.MonkeyPatch) -> FakeDb:
    fake = FakeDb()
    monkeypatch.setattr(service, "get_async_firestore_client", lambda: fake)
    monkeypatch.setattr(conversation_repository, "get_async_firestore_client", lambda: fake)
    monkeypatch.setattr(room_repository, "get_async_firestore_client", lambda: fake)
    monkeypatch.setattr(spec_store, "get_async_firestore_client", lambda: fake)
    monkeypatch.setattr(service, "recalculate_after_clear", AsyncMock(return_value=False))
    monkeypatch.setattr(service, "invalidate_adk_session", AsyncMock())
    monkeypatch.setattr(service, "emit_audit_event", lambda *a, **kw: None)
    limiter.reset()
    return fake


def _client(user: UserSession | None) -> TestClient:
    app = FastAPI()
    app.include_router(routes.router)
    app.add_exception_handler(AppException, app_exception_handler)
    if user is not None:
        async def override_verify_token() -> UserSession:
            return user

        app.dependency_overrides[verify_token] = override_verify_token
    return TestClient(app)


def test_post_clear_requires_auth(db: FakeDb) -> None:
    resp = _client(None).post(f"/api/chat/{SID}/clear", json={})

    assert resp.status_code == 401
    assert resp.json()["error_code"] == "AUTH_MISSING"


def test_post_clear_accepts_empty_body_and_room_body(db: FakeDb) -> None:
    db.put("sessions", SID, {"userId": UID, "messageCount": 2})
    db.put(
        "projects",
        SID,
        "rooms",
        "bagno",
        {"room_id": "bagno", "label": "Bagno", "room_type": "bagno", "created_at": T0, "updated_at": T0},
    )
    db.put("sessions", SID, "messages", "m1", {"role": "user", "content": "hi", "metadata": {"room_id": "bagno"}})
    db.put("sessions", SID, "messages", "m2", {"role": "user", "content": "other"})

    client = _client(REGISTERED)

    room_resp = client.post(f"/api/chat/{SID}/clear", json={"room_id": "bagno"})
    assert room_resp.status_code == 200
    assert room_resp.json() == {
        "mode": "hard_delete",
        "room_id": "bagno",
        "affected_count": 1,
        "rooms_reset": 1,
    }

    empty_json_resp = client.post(f"/api/chat/{SID}/clear", json={})
    assert empty_json_resp.status_code == 200
    assert empty_json_resp.json() == {
        "mode": "hard_delete",
        "room_id": None,
        "affected_count": 1,
        "rooms_reset": 1,
    }

    no_body_resp = client.post(f"/api/chat/{SID}/clear")
    assert no_body_resp.status_code == 200
    assert no_body_resp.json() == {
        "mode": "hard_delete",
        "room_id": None,
        "affected_count": 0,
        "rooms_reset": 1,
    }


def test_post_clear_rejects_invalid_session_id_and_unknown_body_fields(db: FakeDb) -> None:
    client = _client(REGISTERED)

    bad_char = client.post("/api/chat/bad!session/clear", json={})
    assert bad_char.status_code == 422

    too_long = client.post(f"/api/chat/{'a' * 129}/clear", json={})
    assert too_long.status_code == 422

    bad_room = client.post(f"/api/chat/{SID}/clear", json={"room_id": "../escape"})
    assert bad_room.status_code == 422

    extra_field = client.post(f"/api/chat/{SID}/clear", json={"room_id": "bagno", "unknown": 1})
    assert extra_field.status_code == 422


def test_post_clear_maps_permission_denied_403_room_not_found_404_chat_merged_409(db: FakeDb) -> None:
    client = _client(REGISTERED)

    db.put("sessions", SID, {"userId": OTHER_UID})
    forbidden = client.post(f"/api/chat/{SID}/clear", json={})
    assert forbidden.status_code == 403
    assert forbidden.json()["error_code"] == "PERMISSION_DENIED"

    db.put("sessions", SID, {"userId": UID})
    not_found = client.post(f"/api/chat/{SID}/clear", json={"room_id": "missing_room"})
    assert not_found.status_code == 404
    assert not_found.json()["error_code"] == "ROOM_NOT_FOUND"

    db.put("sessions", SID, {"userId": UID, MERGED_INTO: "other-chat"})
    merged = client.post(f"/api/chat/{SID}/clear", json={})
    assert merged.status_code == 409
    assert merged.json()["error_code"] == "CHAT_MERGED"


def test_post_clear_is_rate_limited(db: FakeDb) -> None:
    client = _client(REGISTERED)
    statuses = [client.post(f"/api/chat/{SID}/clear", json={}).status_code for _ in range(11)]

    assert statuses[:10] == [200] * 10
    assert statuses[10] == 429


def test_main_app_mounts_chat_clear_route() -> None:
    paths = main_app.openapi().get("paths", {})
    assert "/api/chat/{session_id}/clear" in paths
    assert "post" in paths["/api/chat/{session_id}/clear"]
