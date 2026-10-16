"""Upload endpoints and the quota: "limit reached" is a 429 with the reset time,
"quota service down" is a 503 — never a 500 that hides both (photos and videos)."""
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from main import app
from src.auth.jwt_handler import verify_token
from src.repositories.conversation_repository import ConversationRepository
from src.schemas.internal import UserSession
from src.tools.quota import QuotaDecision, QuotaReason
from src.utils.datetime_utils import utc_now

_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
_MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 256

_FILES = {
    "image": ("a.png", _PNG, "image/png"),
    "video": ("clip.mp4", _MP4, "video/mp4"),
}
_TOOL = {"image": "upload_image", "video": "upload_video"}


def _own_session_repo() -> ConversationRepository:
    doc = MagicMock(exists=True)
    doc.to_dict.return_value = {"userId": "owner-uid"}
    db = MagicMock()
    db.collection.return_value.document.return_value.get = AsyncMock(return_value=doc)
    repo = ConversationRepository()
    repo._get_async_db = MagicMock(return_value=db)  # type: ignore[method-assign]
    repo.save_file_metadata = AsyncMock()  # type: ignore[method-assign]
    return repo


@pytest.fixture()
def _auth(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("src.middleware.app_check.ENABLE_APP_CHECK", False)
    app.dependency_overrides[verify_token] = lambda: UserSession(uid="owner-uid", is_authenticated=True)
    yield
    app.dependency_overrides.clear()


async def _post(kind: str, decision: QuotaDecision, *, storage_error: Exception | None = None):
    storage = AsyncMock(side_effect=storage_error) if storage_error else AsyncMock()
    with patch("src.api.routes.upload.get_conversation_repository", return_value=_own_session_repo()), \
         patch("src.tools.quota.check_quota", new=AsyncMock(return_value=decision)), \
         patch("src.api.routes.upload.run_in_threadpool", new=storage), \
         patch("src.api.routes.upload.increment_quota", new=AsyncMock()):
        # raise_app_exceptions=False: assert on the response the client would get.
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post(
                f"/api/upload/{kind}",
                data={"session_id": "sess-1"},
                files={"file": _FILES[kind]},
            )


def _denied(reason: QuotaReason, *, hours: float, period: str | None = "daily") -> QuotaDecision:
    return QuotaDecision(False, 0, utc_now() + timedelta(hours=hours), reason, period)  # type: ignore[arg-type]


def _allowed() -> QuotaDecision:
    return QuotaDecision(True, 1, utc_now() + timedelta(hours=24))


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
@pytest.mark.parametrize("kind", ["image", "video"])
async def test_exhausted_quota_is_a_429_with_retry_after_and_a_readable_message(kind):
    resp = await _post(kind, _denied(QuotaReason.LIMIT_REACHED, hours=3))

    assert resp.status_code == 429
    body = resp.json()
    assert body["error_code"] == "QUOTA_EXCEEDED"
    assert body["message"].startswith("Hai raggiunto il limite giornaliero di caricamenti")
    assert "Riprova" in body["message"]
    assert body["detail"]["tool_name"] == _TOOL[kind]
    assert 10_000 < int(resp.headers["Retry-After"]) <= 10_800  # ~3h


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
@pytest.mark.parametrize("kind", ["image", "video"])
async def test_weekly_limit_says_so(kind):
    resp = await _post(kind, _denied(QuotaReason.LIMIT_REACHED, hours=48, period="weekly"))

    assert resp.status_code == 429
    assert "settimanale" in resp.json()["message"]


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
@pytest.mark.parametrize("kind", ["image", "video"])
async def test_unavailable_quota_service_is_a_503_not_a_fake_limit(kind):
    resp = await _post(kind, _denied(QuotaReason.UNAVAILABLE, hours=5 / 60, period=None))

    assert resp.status_code == 503
    body = resp.json()
    assert body["error_code"] == "QUOTA_UNAVAILABLE"
    assert "limite" not in body["message"]
    assert 0 < int(resp.headers["Retry-After"]) <= 300


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
@pytest.mark.parametrize("kind", ["image", "video"])
async def test_unexpected_failure_reaches_the_global_handler_as_a_500_envelope(kind):
    resp = await _post(kind, _allowed(), storage_error=RuntimeError("storage exploded"))

    assert resp.status_code == 500
    body = resp.json()
    assert body["error_code"] == "INTERNAL_SERVER_ERROR"
    assert "storage exploded" not in resp.text  # internals never leak to the client
    assert body["request_id"]


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
@pytest.mark.parametrize("kind", ["image", "video"])
async def test_feature_not_available_for_the_account_is_a_403_without_retry_after(kind):
    decision = QuotaDecision(False, 0, utc_now() + timedelta(hours=24), QuotaReason.NOT_AVAILABLE)

    resp = await _post(kind, decision)

    assert resp.status_code == 403
    body = resp.json()
    assert body["error_code"] == "FEATURE_NOT_AVAILABLE"
    assert "Riprova" not in body["message"]
    assert "Retry-After" not in resp.headers


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
@pytest.mark.parametrize("kind", ["image", "video"])
@pytest.mark.parametrize(("header", "status"), [("abc", 400), ("-5", 400), ("999999999999", 413)])
async def test_a_bad_content_length_is_a_client_error_not_a_500(kind, header, status):
    with patch("src.api.routes.upload.get_conversation_repository", return_value=_own_session_repo()):
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/upload/{kind}",
                data={"session_id": "sess-1"},
                files={"file": _FILES[kind]},
                headers={"content-length": header},
            )

    assert resp.status_code == status
