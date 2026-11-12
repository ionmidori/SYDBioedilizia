"""Phase 140 step 3: REST routes of the confirmation card. Signed-in owners only
(a guest's project id is an access token); the service decides what a section is."""
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from main import app
from src.auth.jwt_handler import verify_token
from src.core.exceptions import ConfirmationSectionNotFoundError, QuoteNotEditableError
from src.schemas.confirmation import ConfirmationResult, ConfirmationState, ConfirmationUpdate, SectionState
from src.schemas.internal import UserSession
from tests.unit.firestore_fakes import FakeDb

PID = "proj1"
_ROUTER = "src.api.routes.projects_router"
_STATE = ConfirmationState(
    sections=[SectionState(section_key="bagno1", label="Bagno", pending=True, measures=[], element_choices=[])],
    editable=True,
    precision=None,
)
_BODY = {"measures": [{"name": "mq", "value": 6}]}


def _as(session: UserSession) -> None:
    app.dependency_overrides[verify_token] = lambda: session


@pytest.fixture()
def db(monkeypatch: pytest.MonkeyPatch) -> FakeDb:
    monkeypatch.setattr("src.middleware.app_check.ENABLE_APP_CHECK", False)
    _as(UserSession(uid="owner", is_authenticated=True))
    fake = FakeDb()
    fake.put("projects", PID, {"userId": "owner"})
    fake.put("projects", "foreign", {"userId": "someone-else"})
    with patch(f"{_ROUTER}.get_async_firestore_client", return_value=fake):
        yield fake
    app.dependency_overrides.clear()


async def _call(method: str, url: str, **kwargs):
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.request(method, url, **kwargs)


async def test_get_returns_the_state(db):
    with patch(f"{_ROUTER}.confirmation_state", AsyncMock(return_value=_STATE)) as state:
        resp = await _call("GET", f"/api/projects/{PID}/confirmations")

    assert resp.status_code == 200
    assert resp.json()["sections"][0]["section_key"] == "bagno1"
    state.assert_awaited_once_with(PID)


async def test_put_returns_the_result(db):
    result = ConfirmationResult(recalculated=True, blocked_sections=[], state=_STATE)
    with patch(f"{_ROUTER}.confirm_section", AsyncMock(return_value=result)) as confirm:
        resp = await _call("PUT", f"/api/projects/{PID}/confirmations/bagno1", json=_BODY)

    assert resp.status_code == 200
    assert resp.json()["recalculated"] is True
    confirm.assert_awaited_once_with(PID, "owner", "bagno1", ConfirmationUpdate.model_validate(_BODY))


@pytest.mark.parametrize(("method", "path"), [("GET", ""), ("PUT", "/bagno1")])
async def test_guest_forbidden(db, method, path):
    _as(UserSession(uid=f"guest_{PID}", is_anonymous=True))
    with patch(f"{_ROUTER}.confirmation_state") as state, patch(f"{_ROUTER}.confirm_section") as confirm:
        resp = await _call(method, f"/api/projects/{PID}/confirmations{path}", json=_BODY)

    assert resp.status_code == 403
    state.assert_not_called()
    confirm.assert_not_called()


@pytest.mark.parametrize(("method", "path"), [("GET", ""), ("PUT", "/bagno1")])
async def test_other_owner_forbidden(db, method, path):
    with patch(f"{_ROUTER}.confirmation_state") as state, patch(f"{_ROUTER}.confirm_section") as confirm:
        resp = await _call(method, f"/api/projects/foreign/confirmations{path}", json=_BODY)

    assert resp.status_code == 403
    state.assert_not_called()
    confirm.assert_not_called()


async def test_unknown_project_404(db):
    resp = await _call("GET", "/api/projects/missing/confirmations")
    assert resp.status_code == 404


async def test_unknown_section_404(db):
    error = ConfirmationSectionNotFoundError("cucina9")
    with patch(f"{_ROUTER}.confirm_section", AsyncMock(side_effect=error)):
        resp = await _call("PUT", f"/api/projects/{PID}/confirmations/cucina9", json=_BODY)

    assert resp.status_code == 404
    assert resp.json()["error_code"] == "CONFIRMATION_SECTION_NOT_FOUND"


async def test_not_editable_409(db):
    with patch(f"{_ROUTER}.confirm_section", AsyncMock(side_effect=QuoteNotEditableError())):
        resp = await _call("PUT", f"/api/projects/{PID}/confirmations/bagno1", json=_BODY)

    assert resp.status_code == 409
    assert resp.json()["error_code"] == "QUOTE_NOT_EDITABLE"


@pytest.mark.parametrize("body", [{}, {"measures": [{"name": "mq", "value": -1}]}, {"price": 10}])
async def test_invalid_body_422(db, body):
    with patch(f"{_ROUTER}.confirm_section") as confirm:
        resp = await _call("PUT", f"/api/projects/{PID}/confirmations/bagno1", json=body)

    assert resp.status_code == 422
    confirm.assert_not_called()


async def test_section_key_pattern(db):
    with patch(f"{_ROUTER}.confirm_section") as confirm:
        resp = await _call("PUT", f"/api/projects/{PID}/confirmations/{'x' * 65}", json=_BODY)

    assert resp.status_code == 422
    confirm.assert_not_called()


async def test_denied_access_never_logs_the_project_id(db, caplog):
    """A guest's project id is an access token: a probe by another user must not write it."""
    db.put("projects", "guest-token-123", {"userId": "guest_x"})
    with caplog.at_level("WARNING"):
        resp = await _call("GET", "/api/projects/guest-token-123/confirmations")

    assert resp.status_code == 403
    assert "guest-token-123" not in caplog.text
