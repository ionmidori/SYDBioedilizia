"""The homepage reads testimonials and portfolio without an App Check token.
With App Check enforced those GETs were answered 403, so the landing page always
showed its stock fallback. They are public read-only content: GET is exempt,
anything else on the same paths still needs App Check."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from main import app
from src.services.company_info_service import CompanyInfoService


@pytest.fixture(autouse=True)
def _strict_app_check():
    with patch("src.middleware.app_check.ENABLE_APP_CHECK", True):
        yield


@pytest.fixture
def empty_firestore():
    db = MagicMock()
    query = db.collection.return_value.where.return_value
    query.stream.return_value = iter([])
    query.order_by.return_value.stream.return_value = iter([])
    with patch("src.api.routes.content_routes.get_firestore_client", return_value=db):
        yield


async def _request(method: str, path: str):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:  # type: ignore[arg-type]
        return await client.request(method, path, json={} if method == "POST" else None)


@pytest.mark.usefixtures("empty_firestore")
@pytest.mark.parametrize("path", ["/api/content/testimonials", "/api/content/portfolio"])
async def test_public_content_get_needs_no_app_check(path):
    resp = await _request("GET", path)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_company_info_get_needs_no_app_check(monkeypatch):
    """The site reads the company info (Phase 141) server-side, without an App Check token."""
    monkeypatch.setattr(CompanyInfoService, "ensure_fresh", AsyncMock())
    resp = await _request("GET", "/api/content/company-info")
    assert resp.status_code == 200
    body = resp.json()
    assert body["version"] == 0
    assert body["info"]["identity"]["legal_name"] == "SYD Bioedilizia S.r.l."
    assert len(body["info"]["service_area"]["places"]) == 121


@pytest.mark.parametrize("method", ["POST", "PUT", "DELETE"])
async def test_writing_company_info_publicly_is_not_possible(method):
    resp = await _request(method, "/api/content/company-info")
    assert resp.status_code in (403, 405)


async def test_submitting_a_testimonial_still_needs_app_check():
    resp = await _request("POST", "/api/content/testimonials")
    assert resp.status_code == 403


async def test_other_routes_still_need_app_check():
    resp = await _request("GET", "/api/projects")
    assert resp.status_code == 403


@pytest.mark.parametrize("path", ["/health", "/api/health"])
async def test_liveness_probe_needs_no_app_check(path):
    """The frontend warmup pings /api/py/health, rewritten to /api/health."""
    resp = await _request("GET", path)
    assert resp.status_code == 200
