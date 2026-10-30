"""
C1 (security audit 2026-10-03): /chat/stream must refuse a session_id owned by
another user BEFORE streaming — otherwise the orchestrator loads the victim's
history and the tools act on the victim's behalf.

Phase 139: a registered user writes only in their chat (`users/{uid}.chat_id`);
any other id gets a 409 the client recovers from by asking /api/me/chat again.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.api_core.exceptions import ServiceUnavailable
from httpx import ASGITransport, AsyncClient
from main import ChatRequest, app
from src.auth.jwt_handler import verify_token
from src.core.exceptions import ChatMerged, PermissionDenied
from src.schemas.internal import UserSession
from src.services.orchestrator_factory import get_orchestrator
from tests.unit.firestore_fakes import FakeDb

_BODY = {"sessionId": "victim-session", "messages": [{"id": "m1", "role": "user", "content": "ciao"}]}
REGISTERED = UserSession(uid="owner-uid", is_authenticated=True)
ANONYMOUS = UserSession(uid="anon-uid", is_authenticated=True, is_anonymous=True)


@pytest.fixture()
def db(monkeypatch: pytest.MonkeyPatch) -> FakeDb:
    fake = FakeDb()
    monkeypatch.setattr("main.get_async_firestore_client", lambda: fake)
    return fake


@pytest.fixture()
def _overrides(monkeypatch: pytest.MonkeyPatch, db: FakeDb):
    from src.core.config import settings

    monkeypatch.setattr(settings, "ENABLE_APP_CHECK", False)
    # The middleware reads its own module-level copy of the flag: without this the
    # request stops at App Check (403) and never reaches the route under test.
    monkeypatch.setattr("src.middleware.app_check.ENABLE_APP_CHECK", False)
    orchestrator = MagicMock()
    orchestrator.stream_chat = MagicMock(side_effect=_empty_stream)
    app.dependency_overrides[verify_token] = lambda: REGISTERED
    app.dependency_overrides[get_orchestrator] = lambda: orchestrator
    yield orchestrator
    app.dependency_overrides.clear()


def _repo(**ensure_session) -> MagicMock:
    repo = MagicMock()
    repo.ensure_session = AsyncMock(**ensure_session)
    repo.save_message = AsyncMock()
    return repo


async def _post(repo: MagicMock, body: dict):
    with patch("src.repositories.conversation_repository.get_conversation_repository", return_value=repo):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.post("/chat/stream", json=body)


async def _empty_stream(*_args, **_kwargs):
    if False:  # pragma: no cover - an async generator that yields nothing
        yield ""


@pytest.mark.asyncio
async def test_foreign_session_is_rejected_with_403(_overrides):
    """A guest picks its chat id, so the session owner is the only guard."""
    app.dependency_overrides[verify_token] = lambda: ANONYMOUS
    repo = _repo(side_effect=PermissionDenied("altro utente"))

    resp = await _post(repo, _BODY)

    assert resp.status_code == 403
    _overrides.stream_chat.assert_not_called()
    repo.save_message.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("pointer", ["my-chat", None])
async def test_registered_user_outside_their_chat_gets_409(_overrides, db, pointer):
    """Not the chat users/{uid}.chat_id names (or no pointer yet): refused before
    ensure_session, which would create a session for an unknown id."""
    if pointer is not None:
        db.put("users", REGISTERED.uid, {"chat_id": pointer})
    repo = _repo()

    resp = await _post(repo, _BODY)

    assert resp.status_code == 409
    assert resp.json()["error_code"] == "USER_CHAT_MISMATCH"
    repo.ensure_session.assert_not_called()
    repo.save_message.assert_not_called()
    _overrides.stream_chat.assert_not_called()


@pytest.mark.asyncio
async def test_unreadable_pointer_fails_the_turn(_overrides, monkeypatch):
    """Fail closed: a failed read must not let an unchecked id through."""
    broken = MagicMock()
    broken.collection.return_value.document.return_value.get = AsyncMock(side_effect=ServiceUnavailable("down"))
    monkeypatch.setattr("main.get_async_firestore_client", lambda: broken)
    repo = _repo()

    resp = await _post(repo, _BODY)

    assert resp.status_code >= 500
    repo.ensure_session.assert_not_called()
    _overrides.stream_chat.assert_not_called()


@pytest.mark.asyncio
async def test_registered_user_in_their_chat_streams(_overrides, db):
    db.put("users", REGISTERED.uid, {"chat_id": "my-chat"})
    repo = _repo()

    resp = await _post(repo, {**_BODY, "sessionId": "my-chat"})

    assert resp.status_code == 200
    repo.ensure_session.assert_awaited_once_with("my-chat", REGISTERED.uid, is_guest=False)
    _overrides.stream_chat.assert_called_once()


@pytest.mark.asyncio
async def test_guest_chat_is_not_checked_against_a_pointer(_overrides, db):
    app.dependency_overrides[verify_token] = lambda: ANONYMOUS
    repo = _repo()

    resp = await _post(repo, {**_BODY, "sessionId": "guest-chat"})

    assert resp.status_code == 200
    repo.ensure_session.assert_awaited_once_with("guest-chat", ANONYMOUS.uid, is_guest=True)


@pytest.mark.asyncio
@pytest.mark.parametrize(("user", "expected_guest"), [(REGISTERED, False), (ANONYMOUS, True)])
async def test_session_and_user_message_follow_the_user_retention(_overrides, db, user, expected_guest):
    """Only guest sessions may get the 30-day TTL (registered projects are kept)."""
    app.dependency_overrides[verify_token] = lambda: user
    db.put("users", user.uid, {"chat_id": "own-session"})
    repo = _repo()

    resp = await _post(repo, {**_BODY, "sessionId": "own-session"})

    assert resp.status_code == 200
    repo.ensure_session.assert_awaited_once_with("own-session", user.uid, is_guest=expected_guest)
    assert repo.save_message.await_args.kwargs["is_guest"] is expected_guest


@pytest.mark.asyncio
async def test_merged_chat_is_refused_with_409(_overrides, db):
    """Phase 139: a chat merged into the user's chat is archived; a stale tab's
    turn must not be saved there, where the user would never see it. The pointer
    can still name it until /api/me/chat follows the merge."""
    db.put("users", REGISTERED.uid, {"chat_id": "victim-session"})
    repo = _repo(side_effect=ChatMerged())

    resp = await _post(repo, _BODY)

    assert resp.status_code == 409
    assert resp.json()["error_code"] == "CHAT_MERGED"
    _overrides.stream_chat.assert_not_called()
    repo.save_message.assert_not_called()


def test_chat_request_has_no_project_id():
    """The chat is the project (Phase 139): the old `projectId` of the body is
    ignored, so a client that still sends it keeps working."""
    body = ChatRequest.model_validate({**_BODY, "projectId": "other-chat"})

    assert "project_id" not in ChatRequest.model_fields
    assert body.session_id == "victim-session"
