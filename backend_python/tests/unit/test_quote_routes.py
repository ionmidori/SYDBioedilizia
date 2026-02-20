"""
Quote Routes FastAPI Tests — Phase C.

Tests both HTTP endpoints with mocked graph singleton:
  - POST /quote/{project_id}/start (Phase 1)
  - POST /quote/{project_id}/approve (Phase 2)

Pattern: TestClient + AsyncMock for FastAPI async route testing.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from src.core.exceptions import (
    QuoteNotFoundError,
    QuoteAlreadyApprovedError,
    CheckpointError,
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

    app = FastAPI()
    from src.api.routes.quote_routes import router

    app.include_router(router)
    return app


@pytest.fixture
def client(app_with_quote_router):
    """TestClient for FastAPI app with quote routes."""
    return TestClient(app_with_quote_router)


# ─── Phase 1: StartQuoteFlow Tests ────────────────────────────────────────────

class TestStartQuoteFlow:
    """Test POST /quote/{project_id}/start (Phase 1) endpoint."""

    @pytest.mark.asyncio
    async def test_start_quote_success_returns_202(self, mock_quote_graph, app_with_quote_router):
        """Happy path: returns 202 Accepted with StartQuoteResponse."""
        mock_quote_graph.ainvoke = AsyncMock(return_value={"status": "awaiting_admin_review"})

        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            response = client.post("/quote/test-project-001/start")

        assert response.status_code == 202
        data = response.json()
        assert data["status"] == "awaiting_admin_review"
        assert data["project_id"] == "test-project-001"
        assert "Visit /admin" in data["message"]

        # Verify graph was invoked with correct config
        mock_quote_graph.ainvoke.assert_called_once()
        call_args = mock_quote_graph.ainvoke.call_args
        assert call_args[0][1]["configurable"]["thread_id"] == "test-project-001"

    @pytest.mark.asyncio
    async def test_start_quote_already_approved_returns_409(self, mock_quote_graph, app_with_quote_router):
        """QuoteAlreadyApprovedError → 409 Conflict."""
        mock_quote_graph.ainvoke = AsyncMock(
            side_effect=QuoteAlreadyApprovedError(project_id="test-project-001")
        )

        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            response = client.post("/quote/test-project-001/start")

        assert response.status_code == 409
        assert "already approved" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_start_quote_checkpoint_error_returns_502(self, mock_quote_graph, app_with_quote_router):
        """CheckpointError (Firestore save failed) → 502 Bad Gateway."""
        mock_quote_graph.ainvoke = AsyncMock(
            side_effect=CheckpointError(
                thread_id="test-project-001",
                reason="Firestore checkpoint save failed",
            )
        )

        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            response = client.post("/quote/test-project-001/start")

        assert response.status_code == 502
        # detail can be a string or dict, just verify it's returned
        assert response.json()["detail"] is not None

    @pytest.mark.asyncio
    async def test_start_quote_generic_exception_returns_500(self, mock_quote_graph, app_with_quote_router):
        """Generic exception → 500 Internal Server Error."""
        mock_quote_graph.ainvoke = AsyncMock(side_effect=RuntimeError("Unexpected error"))

        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            response = client.post("/quote/test-project-001/start")

        assert response.status_code == 500
        data = response.json()
        assert data["detail"]["error_code"] == "INTERNAL_ERROR"
        assert data["detail"]["project_id"] == "test-project-001"


# ─── Phase 2: ApproveQuoteFlow Tests ──────────────────────────────────────────

class TestApproveQuoteFlow:
    """Test POST /quote/{project_id}/approve (Phase 2) endpoint."""

    @pytest.mark.asyncio
    async def test_approve_quote_decision_approve_returns_200(
        self, mock_quote_graph, app_with_quote_router, mock_admin_decision_body
    ):
        """Decision 'approve' → 200 OK with completed status."""
        mock_quote_graph.aupdate_state = AsyncMock()
        mock_quote_graph.ainvoke = AsyncMock(return_value={})

        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            response = client.post(
                "/quote/test-project-001/approve",
                json={"decision": "approve", "notes": "Approved by admin console."},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["decision"] == "approve"
        assert data["project_id"] == "test-project-001"

    @pytest.mark.asyncio
    async def test_approve_quote_decision_reject_returns_200_rejected(
        self, mock_quote_graph, app_with_quote_router
    ):
        """Decision 'reject' → 200 OK with rejected status."""
        mock_quote_graph.aupdate_state = AsyncMock()
        mock_quote_graph.ainvoke = AsyncMock(return_value={})

        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            response = client.post(
                "/quote/test-project-001/approve",
                json={"decision": "reject", "notes": "Budget constraint"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "rejected"
        assert data["decision"] == "reject"

    @pytest.mark.asyncio
    async def test_approve_quote_calls_aupdate_state_before_ainvoke(
        self, mock_quote_graph, app_with_quote_router
    ):
        """CRITICAL: aupdate_state called BEFORE ainvoke (order verification)."""
        call_order = []
        mock_quote_graph.aupdate_state = AsyncMock(side_effect=lambda *a, **k: call_order.append("aupdate"))
        mock_quote_graph.ainvoke = AsyncMock(side_effect=lambda *a, **k: call_order.append("ainvoke"))

        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            response = client.post(
                "/quote/test-project-001/approve",
                json={"decision": "approve", "notes": "Test"},
            )

        assert response.status_code == 200
        assert call_order == ["aupdate", "ainvoke"], "aupdate_state MUST be called before ainvoke"

    @pytest.mark.asyncio
    async def test_approve_quote_aupdate_state_injects_admin_decision(
        self, mock_quote_graph, app_with_quote_router
    ):
        """aupdate_state called with correct payload structure."""
        mock_quote_graph.aupdate_state = AsyncMock()
        mock_quote_graph.ainvoke = AsyncMock()

        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            client.post(
                "/quote/test-project-001/approve",
                json={"decision": "approve", "notes": "Approved admin notes"},
            )

        # Verify aupdate_state was called with admin_decision and admin_notes
        mock_quote_graph.aupdate_state.assert_called_once()
        call_args = mock_quote_graph.aupdate_state.call_args
        config, state_update = call_args[0]
        assert config["configurable"]["thread_id"] == "test-project-001"
        assert state_update["admin_decision"] == "approve"
        assert state_update["admin_notes"] == "Approved admin notes"

    @pytest.mark.asyncio
    async def test_approve_quote_ainvoke_passes_none_config(
        self, mock_quote_graph, app_with_quote_router
    ):
        """ainvoke(None, config) — not ainvoke(initial_state, config) [CRITICAL]."""
        mock_quote_graph.aupdate_state = AsyncMock()
        mock_quote_graph.ainvoke = AsyncMock()

        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            client.post(
                "/quote/test-project-001/approve",
                json={"decision": "approve", "notes": "Test"},
            )

        # Verify ainvoke was called with None (resume pattern), not initial state
        mock_quote_graph.ainvoke.assert_called_once()
        call_args = mock_quote_graph.ainvoke.call_args
        assert call_args[0][0] is None, "ainvoke must be called with None for resume pattern"
        assert call_args[0][1]["configurable"]["thread_id"] == "test-project-001"

    @pytest.mark.asyncio
    async def test_approve_quote_not_found_returns_404(
        self, mock_quote_graph, app_with_quote_router
    ):
        """No checkpoint found → 404 Not Found."""
        mock_quote_graph.aupdate_state = AsyncMock()
        mock_quote_graph.ainvoke = AsyncMock(
            side_effect=QuoteNotFoundError(project_id="test-project-001")
        )

        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            response = client.post(
                "/quote/test-project-001/approve",
                json={"decision": "approve", "notes": "Test"},
            )

        assert response.status_code == 404
        assert "No checkpoint" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_approve_quote_checkpoint_error_returns_502(
        self, mock_quote_graph, app_with_quote_router
    ):
        """CheckpointError during update/resume → 502 Bad Gateway."""
        mock_quote_graph.aupdate_state = AsyncMock(
            side_effect=CheckpointError(
                thread_id="test-project-001",
                reason="Firestore update failed",
            )
        )

        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            response = client.post(
                "/quote/test-project-001/approve",
                json={"decision": "approve", "notes": "Test"},
            )

        assert response.status_code == 502

    @pytest.mark.asyncio
    async def test_approve_quote_generic_exception_returns_500(
        self, mock_quote_graph, app_with_quote_router
    ):
        """Generic exception → 500 Internal Server Error."""
        mock_quote_graph.aupdate_state = AsyncMock()
        mock_quote_graph.ainvoke = AsyncMock(side_effect=RuntimeError("Unexpected"))

        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            response = client.post(
                "/quote/test-project-001/approve",
                json={"decision": "approve", "notes": "Test"},
            )

        assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_approve_quote_notes_max_length_validation(
        self, app_with_quote_router
    ):
        """admin_notes > 2000 chars → Pydantic validation error (422)."""
        client = TestClient(app_with_quote_router)
        long_notes = "x" * 2001

        response = client.post(
            "/quote/test-project-001/approve",
            json={"decision": "approve", "notes": long_notes},
        )

        assert response.status_code == 422  # Pydantic validation error


# ─── Error Code Validation Tests ──────────────────────────────────────────────

class TestQuoteRoutesErrorHandling:
    """Test error handling and edge cases."""

    @pytest.mark.asyncio
    async def test_start_quote_with_empty_project_id(self, mock_quote_graph, app_with_quote_router):
        """Empty project_id in path → 404 Not Found (FastAPI path validation)."""
        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            response = client.post("/quote//start")

        # FastAPI treats // as invalid path
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_approve_quote_missing_decision_field(
        self, mock_quote_graph, app_with_quote_router
    ):
        """Missing 'decision' field → 422 Unprocessable Entity."""
        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            response = client.post(
                "/quote/test-project-001/approve",
                json={"notes": "No decision field"},
            )

        assert response.status_code == 422
        assert "decision" in response.json()["detail"][0]["loc"]

    @pytest.mark.asyncio
    async def test_approve_quote_invalid_decision_value(
        self, mock_quote_graph, app_with_quote_router
    ):
        """Invalid decision value → 422 Unprocessable Entity."""
        with patch("src.api.routes.quote_routes._graph", mock_quote_graph):
            client = TestClient(app_with_quote_router)
            response = client.post(
                "/quote/test-project-001/approve",
                json={"decision": "invalid", "notes": "Test"},
            )

        assert response.status_code == 422
