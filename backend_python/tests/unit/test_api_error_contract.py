"""Platform contract of the FastAPI app: request ids and the error envelope.

Every response carries ``X-Request-ID``; every error — App Check, auth,
validation, unexpected crash — is an ``APIErrorResponse`` JSON whose
``request_id`` matches that header, and never echoes user input or internal
exception text. The frontend error handling and log correlation depend on it.

These invariants used to be exercised only by ``scripts/debug/verify_e2e_flow.py``,
a manual script that no longer ran (it patched LangGraph-era modules). They are
checked here against the real ``main.app`` and its middleware stack. Writing
them exposed that App Check 403s and catcher 500s were sent from outside the
RequestID/SecurityHeaders layers (no X-Request-ID, no security headers).
"""
from __future__ import annotations

from collections.abc import Iterator

import main
import pytest
from fastapi.testclient import TestClient
from main import app
from src.auth.jwt_handler import verify_token
from src.schemas.internal import UserSession
from src.services.orchestrator_factory import get_orchestrator

VALID_CHAT = {"messages": [{"role": "user", "content": "ciao"}], "sessionId": "sess-1"}


async def _app_check_ok(_request) -> None:
    return None


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """main.app with App Check passing and the rate limiter off."""
    monkeypatch.setattr(main, "validate_app_check_token", _app_check_ok)
    monkeypatch.setattr(main.limiter, "enabled", False)
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def _authenticated() -> None:
    async def _user() -> UserSession:
        return UserSession(uid="contract-user", email="u@example.com", is_anonymous=False)

    app.dependency_overrides[verify_token] = _user


def _assert_envelope(response, status: int, error_code: str) -> dict:
    assert response.status_code == status, response.text
    body = response.json()
    assert body["error_code"] == error_code
    assert isinstance(body["message"], str) and body["message"]
    assert body["request_id"] == response.headers["x-request-id"]
    # Error responses get the same hardening headers as successful ones.
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    return body


def test_every_response_carries_a_request_id(client: TestClient) -> None:
    first = client.get("/health").headers["x-request-id"]
    second = client.get("/health").headers["x-request-id"]
    assert len(first) >= 16
    assert first != second


def test_app_check_rejection_uses_envelope(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def reject(_request) -> None:
        raise main.AppCheckError("App Check token required.")

    monkeypatch.setattr(main, "validate_app_check_token", reject)
    response = client.post("/chat/stream", json=VALID_CHAT)

    _assert_envelope(response, 403, "APP_CHECK_FAILED")


def test_missing_credentials_use_envelope(client: TestClient) -> None:
    response = client.post("/chat/stream", json=VALID_CHAT)

    _assert_envelope(response, 401, "AUTH_MISSING")


def test_validation_error_is_sanitized(client: TestClient) -> None:
    _authenticated()
    secret_input = "my-private-session-id with spaces"
    response = client.post(
        "/chat/stream",
        json={"messages": [{"role": "user", "content": "x"}], "sessionId": secret_input},
    )

    body = _assert_envelope(response, 422, "VALIDATION_ERROR")
    errors = body["detail"]["errors"]
    assert errors and all(set(e) == {"loc", "type", "msg"} for e in errors)
    assert secret_input not in response.text


def test_unexpected_crash_is_generic(client: TestClient) -> None:
    _authenticated()

    def broken_orchestrator():
        raise RuntimeError("vertex credentials at /secrets/sa.json are invalid")

    app.dependency_overrides[get_orchestrator] = broken_orchestrator
    response = client.post("/chat/stream", json=VALID_CHAT)

    _assert_envelope(response, 500, "INTERNAL_SERVER_ERROR")
    assert "/secrets/sa.json" not in response.text


def test_crash_inside_app_check_is_answered_by_the_catcher(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """App Check sits INSIDE GlobalErrorCatcher: its crash must get the
    catcher's response (with X-Request-ID and security headers). Starlette's
    last-resort handler would also answer JSON, but from outside those layers
    and with a different message — this is what pins the layer order."""

    async def explode(_request) -> None:
        raise RuntimeError("firebase app check backend is down")

    monkeypatch.setattr(main, "validate_app_check_token", explode)
    response = client.post("/chat/stream", json=VALID_CHAT)

    body = _assert_envelope(response, 500, "INTERNAL_SERVER_ERROR")
    assert body["message"] == "An unexpected internal error occurred. Our team has been alerted."
    assert "firebase app check backend" not in response.text


# ─── CORS on error responses (issue #482) ──────────────────────────────────────
# CORS wraps App Check and the catcher: a browser calling the backend directly
# must be able to read the 403/500 envelope (error_code, request_id) instead of
# getting an opaque CORS failure.
ALLOWED_ORIGIN = "https://sydbioedilizia.vercel.app"


def _reject_app_check(monkeypatch: pytest.MonkeyPatch) -> None:
    async def reject(_request) -> None:
        raise main.AppCheckError("App Check token required.")

    monkeypatch.setattr(main, "validate_app_check_token", reject)


def test_app_check_rejection_is_readable_cross_origin(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _reject_app_check(monkeypatch)
    response = client.post("/chat/stream", json=VALID_CHAT, headers={"Origin": ALLOWED_ORIGIN})

    _assert_envelope(response, 403, "APP_CHECK_FAILED")
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"


def test_catcher_500_is_readable_cross_origin(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def explode(_request) -> None:
        raise RuntimeError("firebase app check backend is down")

    monkeypatch.setattr(main, "validate_app_check_token", explode)
    response = client.post("/chat/stream", json=VALID_CHAT, headers={"Origin": ALLOWED_ORIGIN})

    _assert_envelope(response, 500, "INTERNAL_SERVER_ERROR")
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN


def test_disallowed_origin_gets_no_cors_headers_on_errors(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _reject_app_check(monkeypatch)
    response = client.post("/chat/stream", json=VALID_CHAT, headers={"Origin": "https://evil.example"})

    _assert_envelope(response, 403, "APP_CHECK_FAILED")
    assert "access-control-allow-origin" not in response.headers


def test_preflight_is_answered_by_cors_with_request_id_and_security_headers(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _reject_app_check(monkeypatch)  # a preflight never carries an App Check token
    response = client.options(
        "/chat/stream",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-firebase-appcheck",
        },
    )

    assert response.status_code == 200, response.text
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.headers["x-request-id"]
    assert response.headers["x-content-type-options"] == "nosniff"
