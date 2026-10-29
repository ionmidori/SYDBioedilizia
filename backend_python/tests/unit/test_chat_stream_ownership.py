"""
C1 (security audit 2026-10-03): /chat/stream must refuse a session_id owned by
another user BEFORE streaming — otherwise the orchestrator loads the victim's
history and the tools act on the victim's behalf.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from main import app
from src.auth.jwt_handler import verify_token
from src.core.exceptions import ChatMerged, PermissionDenied
from src.schemas.internal import UserSession
from src.services.orchestrator_factory import get_orchestrator

_BODY = {"sessionId": "victim-session", "messages": [{"id": "m1", "role": "user", "content": "ciao"}]}


@pytest.fixture()
def _overrides(monkeypatch: pytest.MonkeyPatch):
    from src.core.config import settings

    monkeypatch.setattr(settings, "ENABLE_APP_CHECK", False)
    # The middleware reads its own module-level copy of the flag: without this the
    # request stops at App Check (403) and never reaches the route under test.
    monkeypatch.setattr("src.middleware.app_check.ENABLE_APP_CHECK", False)
    orchestrator = MagicMock()
    orchestrator.stream_chat = MagicMock()
    app.dependency_overrides[verify_token] = lambda: UserSession(uid="attacker-uid", is_authenticated=True)
    app.dependency_overrides[get_orchestrator] = lambda: orchestrator
    yield orchestrator
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_foreign_session_is_rejected_with_403(_overrides):
    repo = MagicMock()
    repo.ensure_session = AsyncMock(side_effect=PermissionDenied("altro utente"))
    repo.save_message = AsyncMock()

    with patch("src.repositories.conversation_repository.get_conversation_repository", return_value=repo):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/chat/stream", json=_BODY)

    assert resp.status_code == 403
    _overrides.stream_chat.assert_not_called()
    repo.save_message.assert_not_called()


async def _empty_stream(*_args, **_kwargs):
    if False:  # pragma: no cover - an async generator that yields nothing
        yield ""


@pytest.mark.asyncio
@pytest.mark.parametrize(("is_anonymous", "expected_guest"), [(False, False), (True, True)])
async def test_session_and_user_message_follow_the_user_retention(_overrides, is_anonymous, expected_guest):
    """Only guest sessions may get the 30-day TTL (registered projects are kept)."""
    app.dependency_overrides[verify_token] = lambda: UserSession(
        uid="owner-uid", is_authenticated=True, is_anonymous=is_anonymous
    )
    _overrides.stream_chat = MagicMock(side_effect=_empty_stream)
    repo = MagicMock()
    repo.ensure_session = AsyncMock()
    repo.save_message = AsyncMock()

    with patch("src.repositories.conversation_repository.get_conversation_repository", return_value=repo):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/chat/stream", json={**_BODY, "sessionId": "own-session"})

    assert resp.status_code == 200
    repo.ensure_session.assert_awaited_once_with("own-session", "owner-uid", is_guest=expected_guest)
    assert repo.save_message.await_args.kwargs["is_guest"] is expected_guest


@pytest.mark.asyncio
async def test_merged_chat_is_refused_with_409(_overrides):
    """Phase 139: a chat merged into the user's chat is archived; a stale tab's
    turn must not be saved there, where the user would never see it."""
    repo = MagicMock()
    repo.ensure_session = AsyncMock(side_effect=ChatMerged())
    repo.save_message = AsyncMock()

    with patch("src.repositories.conversation_repository.get_conversation_repository", return_value=repo):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/chat/stream", json=_BODY)

    assert resp.status_code == 409
    assert resp.json()["error_code"] == "CHAT_MERGED"
    _overrides.stream_chat.assert_not_called()
    repo.save_message.assert_not_called()
