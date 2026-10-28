"""GET /api/sessions/{id}/messages: only the session's owner reads its history.

A legacy `guest_*` session is nobody's: a guest's chat reaches its account only
through the guest claim (src/services/guest_claim), never by knowing its id.
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from src.api.routes import chat_history
from src.auth.jwt_handler import verify_token
from src.schemas.internal import UserSession


def _client(uid: str) -> TestClient:
    app = FastAPI()
    app.include_router(chat_history.router)

    async def override_verify_token():
        return UserSession(uid=uid, is_authenticated=True)

    app.dependency_overrides[verify_token] = override_verify_token
    return TestClient(app)


def _db(session: dict) -> MagicMock:
    db = MagicMock()
    snap = MagicMock(exists=True)
    snap.to_dict.return_value = session
    db.collection.return_value.document.return_value.get.return_value = snap
    query = db.collection.return_value.document.return_value.collection.return_value
    query.order_by.return_value.limit.return_value.stream.return_value = []
    return db


@pytest.mark.parametrize("owner", ["guest_abcdefgh", "someone-else"])
def test_a_session_of_someone_else_is_403(owner):
    with patch.object(chat_history, "get_firestore_client", return_value=_db({"userId": owner})):
        resp = _client("user-1").get("/api/sessions/s1/messages")

    assert resp.status_code == 403


def test_the_owner_reads_the_history():
    with patch.object(chat_history, "get_firestore_client", return_value=_db({"userId": "user-1"})):
        resp = _client("user-1").get("/api/sessions/s1/messages")

    assert resp.status_code == 200
    assert resp.json()["messages"] == []
