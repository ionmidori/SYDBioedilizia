"""DELETE /api/users/me — Art. 17 right to erasure, through UserErasureService."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from main import app
from src.auth.jwt_handler import verify_token
from src.core.exceptions import ErasureInProgressError
from src.schemas.internal import UserSession
from src.services.erasure.models import ErasureMode, ErasureReport, ErasureStatus


@pytest.fixture()
def _auth(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("src.middleware.app_check.ENABLE_APP_CHECK", False)
    app.dependency_overrides[verify_token] = lambda: UserSession(uid="u1", is_authenticated=True)
    yield
    app.dependency_overrides.clear()


async def _delete(erase: AsyncMock):
    service = MagicMock()
    service.erase = erase
    with patch("src.api.routes.users_router.get_user_erasure_service", return_value=service):
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.delete("/api/users/me")


def _report(status: ErasureStatus) -> ErasureReport:
    return ErasureReport(uid="u1", mode=ErasureMode.ACCOUNT_DELETION, status=status)


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_completed_erasure_is_204():
    erase = AsyncMock(return_value=_report(ErasureStatus.COMPLETED))

    resp = await _delete(erase)

    assert resp.status_code == 204
    erase.assert_awaited_once_with("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_unfinished_erasure_is_503_and_will_complete_on_its_own():
    resp = await _delete(AsyncMock(return_value=_report(ErasureStatus.FAILED)))

    assert resp.status_code == 503
    body = resp.json()
    assert body["error_code"] == "GDPR_ERASURE_PENDING"
    assert "automaticamente" in body["message"]


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_a_second_request_while_erasing_is_409():
    resp = await _delete(AsyncMock(side_effect=ErasureInProgressError()))

    assert resp.status_code == 409
    assert resp.json()["error_code"] == "GDPR_ERASURE_IN_PROGRESS"
