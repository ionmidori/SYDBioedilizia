"""Regression test for the TestSprite generate-cad endpoint (Bug D).

The pyright reportAttributeAccessIssue ratchet surfaced that
``/api/test/tools/generate-cad`` imported ``CADEngine`` and called
``engine.generate_dxf(image_url=...)`` — a class and method that do not exist
in ``src.vision.cad_engine``. The real pipeline is:

    analyze_floorplan_vector(image_bytes) -> CadVectorData
    generate_dxf_bytes(vector_data)       -> bytes (DXF R2010 text)

So every call to this dev-only endpoint raised ``ImportError`` at request time
and returned 500. This test drives the endpoint with an uploaded image and a
mocked Gemini vision step, asserting a real DXF is produced end to end.
"""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from src.auth.jwt_handler import verify_token
from src.schemas.internal import UserSession
from src.vision.cad_engine import CadPoint, CadVectorData, CadWall


@pytest.fixture
def cad_client():
    from src.api.routes.test_router import router

    app = FastAPI()
    app.include_router(router)

    async def _override():
        return UserSession(uid="qa-user", email="qa@example.com", is_anonymous=False)

    app.dependency_overrides[verify_token] = _override
    return TestClient(app)


def test_generate_cad_returns_dxf(cad_client):
    """Endpoint must run the real analyze -> generate_dxf pipeline and return DXF."""
    fake_vectors = CadVectorData(
        walls=[
            CadWall(
                id="w1",
                start=CadPoint(x=0, y=0),
                end=CadPoint(x=500, y=0),
                thickness_pixels=15,
            )
        ],
        openings=[],
    )

    # Patch the Gemini vision call at its source module (endpoint imports it inline).
    with patch(
        "src.vision.cad_engine.analyze_floorplan_vector",
        new=AsyncMock(return_value=fake_vectors),
    ):
        resp = cad_client.post(
            "/api/test/tools/generate-cad",
            files={"file": ("floorplan.png", b"\x89PNG\r\n\x1a\n-fake", "image/png")},
        )

    # Before the fix, importing CADEngine raised ImportError -> 500.
    assert resp.status_code == 200, resp.text
    # A valid ezdxf R2010 document always contains the ENTITIES section marker.
    assert b"SECTION" in resp.content
    assert b"WALLS" in resp.content
