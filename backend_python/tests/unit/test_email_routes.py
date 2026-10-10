"""Machine-to-machine email endpoints (Phase 128 — Fase 4): Scheduler sweep
(OIDC) and Brevo webhook (bearer token)."""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from src.api.routes import email_routes as routes
from src.core.exceptions import AppException

TOKEN = "t" * 40
INVOKER = "email-sweeper@chatbotluca-a8a73.iam.gserviceaccount.com"


@pytest.fixture
def client(monkeypatch) -> TestClient:
    monkeypatch.setattr(routes, "get_async_firestore_client", lambda: object())
    monkeypatch.setattr(routes, "get_email_provider", lambda: object())
    app = FastAPI()
    app.include_router(routes.router)

    @app.exception_handler(AppException)
    async def _handler(_request: Request, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content={"error_code": exc.error_code})

    return TestClient(app)


@pytest.fixture
def sweep_configured(monkeypatch):
    monkeypatch.setattr(routes.settings, "EMAIL_SWEEP_AUDIENCE", "https://syd-brain/internal/email/sweep")
    monkeypatch.setattr(routes.settings, "EMAIL_SWEEP_INVOKER_EMAIL", INVOKER)


def test_sweep_fails_closed_when_not_configured(client, monkeypatch):
    monkeypatch.setattr(routes.settings, "EMAIL_SWEEP_AUDIENCE", None)
    resp = client.post("/internal/email/sweep", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 503 and resp.json()["error_code"] == "EMAIL_SWEEP_DISABLED"


def test_sweep_requires_a_token(client, sweep_configured):
    assert client.post("/internal/email/sweep").status_code == 401


def test_sweep_rejects_invalid_or_foreign_tokens(client, sweep_configured):
    with patch.object(routes.google.oauth2.id_token, "verify_oauth2_token", side_effect=ValueError("bad sig")):
        assert client.post("/internal/email/sweep", headers={"Authorization": "Bearer x"}).status_code == 401
    foreign = {"email": "attacker@evil.iam.gserviceaccount.com", "email_verified": True}
    with patch.object(routes.google.oauth2.id_token, "verify_oauth2_token", return_value=foreign):
        assert client.post("/internal/email/sweep", headers={"Authorization": "Bearer x"}).status_code == 401


def test_sweep_runs_with_the_scheduler_identity(client, sweep_configured):
    claims = {"email": INVOKER, "email_verified": True}
    with (
        patch.object(routes.google.oauth2.id_token, "verify_oauth2_token", return_value=claims) as verify,
        patch.object(routes.outbox, "sweep", new=AsyncMock(return_value={"sent": 2, "retry": 0, "dead": 0, "skipped": 1})),
    ):
        resp = client.post("/internal/email/sweep", headers={"Authorization": "Bearer good"})
    assert resp.status_code == 200 and resp.json()["sent"] == 2
    assert verify.call_args.kwargs["audience"] == "https://syd-brain/internal/email/sweep"


@pytest.mark.parametrize("header", [None, "Bearer wrong", f"Basic {TOKEN}"])
def test_webhook_rejects_unauthenticated_calls(client, monkeypatch, header):
    monkeypatch.setattr(routes.settings, "BREVO_WEBHOOK_TOKEN", TOKEN)
    headers = {"Authorization": header} if header else {}
    with patch.object(routes.outbox, "apply_events", new=AsyncMock()) as apply:
        resp = client.post("/webhooks/email/brevo", json={"event": "delivered", "message-id": "<m>"}, headers=headers)
    assert resp.status_code == 401
    apply.assert_not_called()


def test_webhook_applies_parsed_events(client, monkeypatch):
    monkeypatch.setattr(routes.settings, "BREVO_WEBHOOK_TOKEN", TOKEN)
    with patch.object(routes.outbox, "apply_events", new=AsyncMock(return_value=1)) as apply:
        resp = client.post(
            "/webhooks/email/brevo",
            json={"event": "delivered", "message-id": "<m>", "ts_event": 1791712800},
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
    assert resp.status_code == 200 and resp.json() == {"received": 1, "applied": 1}
    [event] = apply.await_args.args[1]
    assert event.event == "delivered" and event.message_id == "<m>"


def test_webhook_rejects_invalid_json(client, monkeypatch):
    monkeypatch.setattr(routes.settings, "BREVO_WEBHOOK_TOKEN", TOKEN)
    resp = client.post("/webhooks/email/brevo", content=b"not json",
                       headers={"Authorization": f"Bearer {TOKEN}", "content-type": "application/json"})
    assert resp.status_code == 400
