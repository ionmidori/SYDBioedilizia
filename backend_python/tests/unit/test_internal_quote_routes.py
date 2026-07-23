"""
Internal quote approval route tests — admin console server-to-server trigger.

Covers:
  - Auth: missing/unconfigured secret -> 503, missing/wrong header -> 401
  - Happy path: delegates to quote_routes._run_quote_approval with the right args
  - No Firebase user involved: reviewed_by (free-form string) becomes actor_uid
"""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from src.api.routes.internal_quote_routes import router
from src.api.routes.quote_routes import ApproveQuoteResponse
from src.core.config import settings


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


@pytest.fixture
def secret_configured(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_INTERNAL_SECRET", "s3cret-value-for-tests")


def _body(decision: str = "approve", **overrides):
    payload = {
        "project_id": "test-project-001",
        "decision": decision,
        "notes": "ok",
        "reviewed_by": "admin-console-mario",
    }
    payload.update(overrides)
    return payload


class TestAuth:
    def test_secret_not_configured_returns_503(self, client, monkeypatch):
        monkeypatch.setattr(settings, "ADMIN_INTERNAL_SECRET", None)
        response = client.post(
            "/internal/quote/approve",
            json=_body(),
            headers={"X-Admin-Internal-Secret": "anything"},
        )
        assert response.status_code == 503

    def test_missing_header_returns_401(self, client, secret_configured):
        response = client.post("/internal/quote/approve", json=_body())
        assert response.status_code == 401

    def test_wrong_secret_returns_401(self, client, secret_configured):
        response = client.post(
            "/internal/quote/approve",
            json=_body(),
            headers={"X-Admin-Internal-Secret": "wrong-value"},
        )
        assert response.status_code == 401


class TestHappyPath:
    def test_approve_delegates_to_shared_pipeline(self, client, secret_configured):
        mock_run = AsyncMock(
            return_value=ApproveQuoteResponse(
                status="completed", project_id="test-project-001", decision="approve"
            )
        )
        with patch("src.api.routes.internal_quote_routes._run_quote_approval", mock_run):
            response = client.post(
                "/internal/quote/approve",
                json=_body(decision="approve", notes="tutto ok"),
                headers={"X-Admin-Internal-Secret": "s3cret-value-for-tests"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["decision"] == "approve"

        mock_run.assert_called_once_with(
            "test-project-001", "approve", "tutto ok", "admin-console-mario"
        )

    def test_reject_delegates_to_shared_pipeline(self, client, secret_configured):
        mock_run = AsyncMock(
            return_value=ApproveQuoteResponse(
                status="rejected", project_id="test-project-001", decision="reject"
            )
        )
        with patch("src.api.routes.internal_quote_routes._run_quote_approval", mock_run):
            response = client.post(
                "/internal/quote/approve",
                json=_body(decision="reject"),
                headers={"X-Admin-Internal-Secret": "s3cret-value-for-tests"},
            )

        assert response.status_code == 200
        assert response.json()["status"] == "rejected"

    def test_invalid_decision_returns_422(self, client, secret_configured):
        response = client.post(
            "/internal/quote/approve",
            json=_body(decision="maybe"),
            headers={"X-Admin-Internal-Secret": "s3cret-value-for-tests"},
        )
        assert response.status_code == 422

    def test_missing_reviewed_by_returns_422(self, client, secret_configured):
        payload = _body()
        del payload["reviewed_by"]
        response = client.post(
            "/internal/quote/approve",
            json=payload,
            headers={"X-Admin-Internal-Secret": "s3cret-value-for-tests"},
        )
        assert response.status_code == 422
