"""Regression tests for real AttributeError bugs surfaced by the pyright
reportAttributeAccessIssue ratchet (Phase 92b).

Each test reproduces a concrete runtime crash on a production endpoint:
  - Bug B: POST /testimonials read ``UserSession.display_name`` — a field that
    does not exist on our Pydantic UserSession (the display name lives in the
    Firebase token ``claims``). Every call 500'd.
  - Bug C: POST /update-file-metadata called ``get_storage_client().bucket()``
    but ``get_storage_client`` (firebase_client) already returns a *Bucket*,
    which has no ``.bucket()`` method. Every call 500'd.

The Bug C mock uses ``spec=Bucket`` on purpose: a bare MagicMock would
auto-create a ``.bucket`` child and hide the bug.
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.cloud.storage import Bucket
from src.auth.jwt_handler import get_current_user_id, verify_token
from src.schemas.internal import UserSession

# ─────────────────────────── Bug B: testimonials ────────────────────────────

@pytest.fixture
def content_client():
    from src.api.routes.content_routes import router

    app = FastAPI()
    app.include_router(router)

    async def _override():
        # Non-anonymous user; display name provided via Firebase token claim.
        return UserSession(
            uid="user-123",
            email="mario@example.com",
            is_anonymous=False,
            claims={"name": "Mario Rossi"},
        )

    app.dependency_overrides[verify_token] = _override
    return TestClient(app)


def test_submit_testimonial_uses_claim_name(content_client):
    captured = {}

    def _fake_add(payload):
        captured.update(payload)

    fake_db = MagicMock()
    fake_db.collection.return_value.add.side_effect = _fake_add

    with patch(
        "src.api.routes.content_routes.get_firestore_client", return_value=fake_db
    ):
        resp = content_client.post(
            "/api/content/testimonials",
            json={"text": "Lavoro eccellente e puntuale!", "rating": 5},
        )

    # Before the fix, reading user_session.display_name raised AttributeError,
    # the endpoint caught it and returned 500.
    assert resp.status_code == 201, resp.text
    assert captured["name"] == "Mario Rossi"


# ────────────────────────── Bug C: update-file-metadata ─────────────────────

@pytest.fixture
def metadata_client():
    from src.api.routes.update_metadata import router

    app = FastAPI()
    app.include_router(router)

    async def _override():
        return "owner-uid"

    app.dependency_overrides[get_current_user_id] = _override
    return TestClient(app)


def test_update_metadata_uses_bucket_directly(metadata_client):
    # Ownership check passes: project doc owned by the authenticated user.
    fake_doc = MagicMock()
    fake_doc.exists = True
    fake_doc.to_dict.return_value = {"userId": "owner-uid"}
    fake_db = MagicMock()
    fake_db.collection.return_value.document.return_value.get.return_value = fake_doc

    # spec=Bucket => accessing a non-existent ``.bucket`` attribute raises
    # AttributeError, faithfully reproducing the production crash.
    fake_bucket = MagicMock(spec=Bucket)
    fake_blob = MagicMock()
    fake_blob.exists.return_value = True
    fake_blob.metadata = {}
    fake_bucket.blob.return_value = fake_blob

    with patch(
        "src.api.routes.update_metadata.get_firestore_client", return_value=fake_db
    ), patch(
        "src.api.routes.update_metadata.get_storage_client", return_value=fake_bucket
    ):
        resp = metadata_client.post(
            "/update-file-metadata",
            json={
                "project_id": "proj123",
                "file_path": "renders/img.png",
                "room": "Cucina",
            },
        )

    # Before the fix, storage.bucket() raised AttributeError -> 500.
    assert resp.status_code == 200, resp.text
    fake_bucket.blob.assert_called_once_with("renders/img.png")
