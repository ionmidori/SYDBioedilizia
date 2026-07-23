"""
POST /quote/batch/{batch_id}/projects/{project_id}/decide — tests.

Covers the Phase 96 fix: decide_project now runs the SAME approve/reject
pipeline as POST /api/quote/{id}/approve (PDF + email delivery on approve)
instead of only flipping the quote doc's status field, while keeping the
batch bookkeeping update best-effort (batch decision succeeds even if the
per-project pipeline fails).
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from src.api.routes.batch_routes import router
from src.auth.jwt_handler import verify_token
from src.core.exceptions import AppException
from src.schemas.internal import UserSession

BATCH_ID = "batch-001"
PROJECT_ID = "proj-001"


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)

    # Mirrors main.py's app_exception_handler: domain exceptions (e.g.
    # BatchNotFoundError) are only converted to their proper HTTP status by
    # the real app's global handler, absent here in this scoped test app.
    @app.exception_handler(AppException)
    async def _app_exception_handler(request: Request, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})

    async def override_verify_token():
        return UserSession(uid="admin-uid", email="admin@test.com", claims={"role": "admin"})

    app.dependency_overrides[verify_token] = override_verify_token
    return TestClient(app)


def _batch_doc(status_: str = "submitted", projects=None):
    doc = MagicMock()
    doc.exists = True
    doc.to_dict.return_value = {
        "status": status_,
        "projects": projects if projects is not None else [{"project_id": PROJECT_ID, "status": "draft"}],
    }
    return doc


def _db_with_batch(doc):
    db = MagicMock()
    db.collection.return_value.document.return_value.get = AsyncMock(return_value=doc)
    db.collection.return_value.document.return_value.update = AsyncMock()
    return db


class TestDecideProjectApprove:
    def test_approve_runs_full_pipeline_and_updates_batch(self, client):
        db = _db_with_batch(_batch_doc())
        mock_run = AsyncMock()

        with (
            patch("src.api.routes.batch_routes.get_async_firestore_client", return_value=db),
            patch("src.api.routes.batch_routes._run_quote_approval", mock_run),
        ):
            response = client.post(
                f"/api/quote/batch/{BATCH_ID}/projects/{PROJECT_ID}/decide",
                json={"decision": "approve", "notes": "tutto ok"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["decision"] == "approve"
        assert data["batch_status"] == "approved"

        mock_run.assert_called_once_with(PROJECT_ID, "approve", "tutto ok", "admin-uid")
        # Batch bookkeeping was updated regardless of the pipeline outcome
        db.collection.return_value.document.return_value.update.assert_called_once()

    def test_pipeline_failure_does_not_break_batch_decision(self, client):
        """The per-project pipeline failing (e.g. already decided) must not
        prevent the batch decision itself from succeeding — best-effort."""
        db = _db_with_batch(_batch_doc())
        mock_run = AsyncMock(side_effect=HTTPException(status_code=404, detail="No pending quote found."))

        with (
            patch("src.api.routes.batch_routes.get_async_firestore_client", return_value=db),
            patch("src.api.routes.batch_routes._run_quote_approval", mock_run),
        ):
            response = client.post(
                f"/api/quote/batch/{BATCH_ID}/projects/{PROJECT_ID}/decide",
                json={"decision": "approve"},
            )

        assert response.status_code == 200
        assert response.json()["batch_status"] == "approved"


class TestDecideProjectReject:
    def test_reject_runs_pipeline_with_reject_decision(self, client):
        db = _db_with_batch(_batch_doc())
        mock_run = AsyncMock()

        with (
            patch("src.api.routes.batch_routes.get_async_firestore_client", return_value=db),
            patch("src.api.routes.batch_routes._run_quote_approval", mock_run),
        ):
            response = client.post(
                f"/api/quote/batch/{BATCH_ID}/projects/{PROJECT_ID}/decide",
                json={"decision": "reject", "notes": "non idoneo"},
            )

        assert response.status_code == 200
        assert response.json()["batch_status"] == "rejected"
        mock_run.assert_called_once_with(PROJECT_ID, "reject", "non idoneo", "admin-uid")


class TestDecideProjectErrors:
    def test_batch_wrong_status_returns_409(self, client):
        db = _db_with_batch(_batch_doc(status_="draft"))
        with patch("src.api.routes.batch_routes.get_async_firestore_client", return_value=db):
            response = client.post(
                f"/api/quote/batch/{BATCH_ID}/projects/{PROJECT_ID}/decide",
                json={"decision": "approve"},
            )
        assert response.status_code == 409

    def test_project_not_in_batch_returns_404(self, client):
        db = _db_with_batch(_batch_doc(projects=[{"project_id": "other-project", "status": "draft"}]))
        with patch("src.api.routes.batch_routes.get_async_firestore_client", return_value=db):
            response = client.post(
                f"/api/quote/batch/{BATCH_ID}/projects/{PROJECT_ID}/decide",
                json={"decision": "approve"},
            )
        assert response.status_code == 404

    def test_batch_not_found_returns_404(self, client):
        missing = MagicMock()
        missing.exists = False
        db = _db_with_batch(missing)
        with patch("src.api.routes.batch_routes.get_async_firestore_client", return_value=db):
            response = client.post(
                f"/api/quote/batch/{BATCH_ID}/projects/{PROJECT_ID}/decide",
                json={"decision": "approve"},
            )
        assert response.status_code == 404
