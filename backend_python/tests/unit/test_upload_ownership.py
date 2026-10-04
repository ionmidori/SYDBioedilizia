"""
M1 (security audit 2026-10-03): /api/upload/image must not attach files to a
project owned by another user (files, prompt-injection content, cover swap).
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from main import app
from src.auth.jwt_handler import verify_token
from src.repositories.conversation_repository import ConversationRepository
from src.schemas.internal import UserSession

_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _repo_with_owner(owner: str | None) -> ConversationRepository:
    doc = MagicMock(exists=owner is not None)
    doc.to_dict.return_value = {"userId": owner}
    db = MagicMock()
    db.collection.return_value.document.return_value.get = AsyncMock(return_value=doc)
    repo = ConversationRepository()
    repo._get_async_db = MagicMock(return_value=db)  # type: ignore[method-assign]
    repo.save_file_metadata = AsyncMock()  # type: ignore[method-assign]
    return repo


@pytest.fixture()
def _auth(monkeypatch: pytest.MonkeyPatch):
    from src.core.config import settings

    monkeypatch.setattr(settings, "ENABLE_APP_CHECK", False)
    app.dependency_overrides[verify_token] = lambda: UserSession(uid="attacker-uid", is_authenticated=True)
    yield
    app.dependency_overrides.clear()


async def _upload(repo: ConversationRepository):
    with patch("src.api.routes.upload.get_conversation_repository", return_value=repo), \
         patch("src.api.routes.upload._enforce_quota", new=AsyncMock(return_value=5)), \
         patch("src.api.routes.upload.increment_quota", new=AsyncMock()), \
         patch("src.api.routes.upload._firebase_upload", return_value=("https://signed", None)) as up:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/upload/image",
                data={"session_id": "victim-session"},
                files={"file": ("a.png", _PNG, "image/png")},
            )
    return resp, up


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_upload_to_foreign_session_is_rejected():
    repo = _repo_with_owner("victim-uid")
    resp, up = await _upload(repo)
    assert resp.status_code == 403
    up.assert_not_called()
    repo.save_file_metadata.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("owner", [None, "attacker-uid", "guest_abcdefgh"])
async def test_access_allowed_for_new_own_or_guest_session(owner):
    await _repo_with_owner(owner).assert_session_access("sess", "attacker-uid")  # no raise
