"""POST /api/users/me/sessions/revoke — revoke all active refresh tokens."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from main import app
from src.auth.jwt_handler import verify_token
from src.schemas.internal import UserSession


@pytest.fixture()
def _auth(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("src.middleware.app_check.ENABLE_APP_CHECK", False)
    app.dependency_overrides[verify_token] = lambda: UserSession(
        uid="u1", is_authenticated=True, is_anonymous=False
    )
    yield
    app.dependency_overrides.clear()


@pytest.fixture()
def _anon_auth(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("src.middleware.app_check.ENABLE_APP_CHECK", False)
    app.dependency_overrides[verify_token] = lambda: UserSession(
        uid="anon-1", is_authenticated=True, is_anonymous=True
    )
    yield
    app.dependency_overrides.clear()


async def _post_revoke(revoke_return: bool = True):
    gateway = MagicMock()
    gateway.revoke_refresh_tokens = AsyncMock(return_value=revoke_return)
    with patch("src.api.routes.users_router.FirebaseAuthGateway", return_value=gateway):
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/users/me/sessions/revoke")
    return resp, gateway


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_revoke_sessions_returns_200():
    resp, gateway = await _post_revoke(True)

    assert resp.status_code == 200
    body = resp.json()
    assert body["revoked"] is True
    assert body["message"]
    gateway.revoke_refresh_tokens.assert_awaited_once_with("u1")


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_revoke_sessions_missing_user_returns_404():
    resp, _ = await _post_revoke(False)
    assert resp.status_code == 404


@pytest.mark.asyncio
@pytest.mark.usefixtures("_anon_auth")
async def test_revoke_sessions_rejects_anonymous_user():
    resp, gateway = await _post_revoke(True)
    assert resp.status_code == 403
    gateway.revoke_refresh_tokens.assert_not_awaited()
