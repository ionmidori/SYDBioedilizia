"""
Quote Routes FastAPI Tests — Phase C.

Tests the quote start endpoint with the mocked ADK HITL entry point:
  - POST /quote/{project_id}/start
(Admin decisions live in /api/admin/quotes — tests/unit/test_admin_quotes_routes.py.)

Pattern: TestClient + AsyncMock for FastAPI async route testing.
"""
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from src.core.exceptions import (
    CheckpointError,
    QuoteAlreadyApprovedError,
)

# ─── Helper to create TestClient ──────────────────────────────────────────────

@pytest.fixture
def quote_router():
    """Import and return the quote router for testing."""
    from src.api.routes.quote_routes import router
    return router


@pytest.fixture
def app_with_quote_router():
    """FastAPI app with quote routes registered."""
    from fastapi import FastAPI
    from src.auth.jwt_handler import verify_token
    from src.schemas.internal import UserSession

    app = FastAPI()
    from src.api.routes.quote_routes import router

    app.include_router(router)

    # Inject an admin user to bypass project ownership and RBAC checks
    async def override_verify_token():
        return UserSession(uid="admin-test-uid", email="admin@test.com", claims={"role": "admin"})

    app.dependency_overrides[verify_token] = override_verify_token

    return app


@pytest.fixture
def client(app_with_quote_router):
    """TestClient for FastAPI app with quote routes."""
    return TestClient(app_with_quote_router)


# ─── Phase 1: StartQuoteFlow Tests ────────────────────────────────────────────

class TestStartQuoteFlow:
    """Test POST /quote/{project_id}/start (Phase 1) endpoint."""

    @pytest.mark.asyncio
    async def test_start_quote_success_returns_202(self, mock_quote_graph, client):
        """Happy path: returns 202 Accepted with StartQuoteResponse."""
        # mock_quote_graph.start is already an AsyncMock via conftest.py
        mock_quote_graph.start.return_value = {"status": "awaiting_admin_review"}

        with patch("src.adk.hitl.start_quote_hitl", mock_quote_graph.start):
            response = client.post("/api/quote/test-project-001/start")

        assert response.status_code == 202
        data = response.json()
        assert data["status"] == "awaiting_admin_review"
        assert data["project_id"] == "test-project-001"
        assert "Visit /admin" in data["message"]

        mock_quote_graph.start.assert_called_once()
        call_args = mock_quote_graph.start.call_args
        assert call_args[1]["project_id"] == "test-project-001"

    @pytest.mark.asyncio
    async def test_start_quote_already_approved_returns_409(self, mock_quote_graph, client):
        """QuoteAlreadyApprovedError → 409 Conflict."""
        mock_quote_graph.start.side_effect = QuoteAlreadyApprovedError(project_id="test-project-001")

        with patch("src.adk.hitl.start_quote_hitl", mock_quote_graph.start):
            response = client.post("/api/quote/test-project-001/start")

        assert response.status_code == 409
        assert "already approved" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_start_quote_checkpoint_error_returns_502(self, mock_quote_graph, client):
        """CheckpointError (Firestore save failed) → 502 Bad Gateway."""
        mock_quote_graph.start.side_effect = CheckpointError(
            thread_id="test-project-001",
            reason="Firestore checkpoint save failed",
        )

        with patch("src.adk.hitl.start_quote_hitl", mock_quote_graph.start):
            response = client.post("/api/quote/test-project-001/start")

        assert response.status_code == 502
        assert response.json()["detail"] is not None

    @pytest.mark.asyncio
    async def test_start_quote_generic_exception_returns_500(self, mock_quote_graph, client):
        """Generic exception → 500 Internal Server Error."""
        mock_quote_graph.start.side_effect = RuntimeError("Unexpected error")

        with patch("src.adk.hitl.start_quote_hitl", mock_quote_graph.start):
            response = client.post("/api/quote/test-project-001/start")

        assert response.status_code == 500
        data = response.json()
        assert data["detail"]["error_code"] == "INTERNAL_ERROR"
        assert data["detail"]["project_id"] == "test-project-001"


# ─── Phase 2: ApproveQuoteFlow Tests ──────────────────────────────────────────

# ─── Error Code Validation Tests ──────────────────────────────────────────────

class TestQuoteRoutesErrorHandling:
    """Test error handling and edge cases."""

    @pytest.mark.asyncio
    async def test_start_quote_with_empty_project_id(self, mock_quote_graph, client):
        """Empty project_id in path → 404 Not Found (FastAPI path validation)."""
        with patch("src.adk.hitl.start_quote_hitl", mock_quote_graph.start):
            response = client.post("/api/quote//start")

        # FastAPI treats // as invalid path
        assert response.status_code == 404
