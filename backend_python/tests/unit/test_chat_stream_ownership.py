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
from src.core.exceptions import PermissionDenied
from src.schemas.internal import UserSession
from src.services.orchestrator_factory import get_orchestrator

_BODY = {"sessionId": "victim-session", "messages": [{"id": "m1", "role": "user", "content": "ciao"}]}


@pytest.fixture()
def _overrides(monkeypatch: pytest.MonkeyPatch):
    from src.core.config import settings

    monkeypatch.setattr(settings, "ENABLE_APP_CHECK", False)
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
