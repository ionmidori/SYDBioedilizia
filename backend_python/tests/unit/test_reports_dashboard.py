"""Regression tests for the dashboard stats endpoint (reports.py).

Gemini review on PR #180 flagged a silent-failure anti-pattern: with
``asyncio.gather(return_exceptions=True)`` a failed sub-call was swallowed and
the endpoint returned ``200 OK`` with zeroed stats — which reads to the user
like their projects/files were deleted. A failed sub-call must instead surface
as a ``500`` via the outer handler.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from src.auth.jwt_handler import verify_token
from src.schemas.internal import UserSession
from src.services.gallery_service import get_gallery_service

_MODULE = "src.api.routes.reports"


@pytest.fixture
def dashboard_client():
    from src.api.routes.reports import router

    app = FastAPI()
    app.include_router(router)

    async def _override_user():
        return UserSession(uid="u1", email="u1@example.com", is_anonymous=False)

    # Fake gallery service whose async get_all_assets is configured per test.
    fake_gallery = SimpleNamespace(get_all_assets=AsyncMock())
    app.dependency_overrides[verify_token] = _override_user
    app.dependency_overrides[get_gallery_service] = lambda: fake_gallery
    return TestClient(app), fake_gallery


def _assets(*types):
    return SimpleNamespace(assets=[SimpleNamespace(type=t) for t in types])


def test_dashboard_happy_path(dashboard_client):
    client, fake_gallery = dashboard_client
    fake_gallery.get_all_assets.return_value = _assets("render", "file", "render")

    with patch(f"{_MODULE}.get_user_projects", new=AsyncMock(return_value=[1, 2, 3])):
        resp = client.get("/api/reports/dashboard")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["activeProjects"] == 3
    assert body["totalRenders"] == 2
    assert body["totalFiles"] == 1


def test_dashboard_gallery_failure_returns_500_not_zeroed(dashboard_client):
    """A failed gallery fetch must 500, not silently report 0 files."""
    client, fake_gallery = dashboard_client
    fake_gallery.get_all_assets.side_effect = RuntimeError("firestore down")

    with patch(f"{_MODULE}.get_user_projects", new=AsyncMock(return_value=[1, 2, 3])):
        resp = client.get("/api/reports/dashboard")

    assert resp.status_code == 500, resp.text


def test_dashboard_projects_failure_returns_500(dashboard_client):
    """A failed projects count must 500, not silently report 0 projects."""
    client, fake_gallery = dashboard_client
    fake_gallery.get_all_assets.return_value = _assets("file")

    with patch(
        f"{_MODULE}.get_user_projects",
        new=AsyncMock(side_effect=RuntimeError("firestore down")),
    ):
        resp = client.get("/api/reports/dashboard")

    assert resp.status_code == 500, resp.text
