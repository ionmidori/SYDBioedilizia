"""
Tests for n8n inbound webhook HMAC-SHA256 validation and webhook routes.

Uses httpx.AsyncClient against the FastAPI app with mocked Firestore.
"""

import hashlib
import hmac
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


def _make_valid_headers(
    secret: str, body: str, timestamp_offset: int = 0
) -> dict[str, str]:
    """Build valid HMAC headers for a given body and secret."""
    ts = str(int(time.time()) + timestamp_offset)
    msg = f"{ts}.{body}"
    sig = "sha256=" + hmac.new(
        secret.encode(), msg.encode(), hashlib.sha256
    ).hexdigest()
    return {"X-N8N-Timestamp": ts, "X-N8N-Signature": sig}


_TEST_SECRET = "test-hmac-secret-for-unit-tests"
_VALID_PAYLOAD = {
    "event_type": "quote_delivered",
    "project_id": "proj-123",
    "idempotency_key": "idem-abc-001",
    "data": {},
}


@pytest.fixture()
def _mock_settings(monkeypatch: pytest.MonkeyPatch):
    """Patch settings for webhook auth."""
    from src.core.config import settings

    monkeypatch.setattr(settings, "N8N_WEBHOOK_HMAC_SECRET", _TEST_SECRET)
    monkeypatch.setattr(settings, "N8N_API_KEY", None)
    monkeypatch.setattr(settings, "ENABLE_APP_CHECK", False)


@pytest.fixture()
def _mock_firestore():
    """Mock get_async_firestore_client for all webhook tests."""
    mock_doc = MagicMock()
    mock_doc.exists = False

    mock_doc_ref = MagicMock()
    mock_doc_ref.get = AsyncMock(return_value=mock_doc)
    mock_doc_ref.set = AsyncMock()
    mock_doc_ref.update = AsyncMock()

    mock_collection = MagicMock()
    mock_collection.document = MagicMock(return_value=mock_doc_ref)

    # Support chained paths: doc_ref.collection(...).document(...)
    mock_doc_ref.collection = MagicMock(return_value=mock_collection)

    mock_db = MagicMock()
    mock_db.collection = MagicMock(return_value=mock_collection)

    with patch(
        "src.api.routes.webhook_routes.get_async_firestore_client",
        return_value=mock_db,
    ):
        yield mock_db


@pytest.fixture()
def _mock_firestore_existing():
    """Mock Firestore where the idempotency doc already exists."""
    mock_doc = MagicMock()
    mock_doc.exists = True

    mock_doc_ref = AsyncMock()
    mock_doc_ref.get = AsyncMock(return_value=mock_doc)

    mock_collection = MagicMock()
    mock_collection.document = MagicMock(return_value=mock_doc_ref)

    mock_db = MagicMock()
    mock_db.collection = MagicMock(return_value=mock_collection)

    with patch(
        "src.api.routes.webhook_routes.get_async_firestore_client",
        return_value=mock_db,
    ):
        yield mock_db


async def _post_webhook(
    body: str,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict]:
    """Helper: POST to /webhooks/n8n and return (status_code, json)."""
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/webhooks/n8n",
            content=body,
            headers={
                "Content-Type": "application/json",
                **(headers or {}),
            },
        )
    return resp.status_code, resp.json()


# ── Tests ────────────────────────────────────────────────────────────────────


@pytest.mark.usefixtures("_mock_settings", "_mock_firestore")
async def test_valid_signature_accepted():
    body = json.dumps(_VALID_PAYLOAD)
    headers = _make_valid_headers(_TEST_SECRET, body)
    code, data = await _post_webhook(body, headers)
    assert code == 200
    assert data["status"] == "ok"
    assert data["event_type"] == "quote_delivered"
    assert data["project_id"] == "proj-123"


@pytest.mark.usefixtures("_mock_settings", "_mock_firestore")
async def test_invalid_signature_rejected():
    body = json.dumps(_VALID_PAYLOAD)
    headers = _make_valid_headers(_TEST_SECRET, body)
    headers["X-N8N-Signature"] = "sha256=0000000000000000000000000000000000000000"
    code, data = await _post_webhook(body, headers)
    assert code == 403
    assert "Invalid signature" in data["detail"]


@pytest.mark.usefixtures("_mock_settings", "_mock_firestore")
async def test_expired_timestamp_rejected():
    body = json.dumps(_VALID_PAYLOAD)
    headers = _make_valid_headers(_TEST_SECRET, body, timestamp_offset=-400)
    code, data = await _post_webhook(body, headers)
    assert code == 401
    assert "expired" in data["detail"].lower()


@pytest.mark.usefixtures("_mock_settings", "_mock_firestore")
async def test_future_timestamp_rejected():
    body = json.dumps(_VALID_PAYLOAD)
    headers = _make_valid_headers(_TEST_SECRET, body, timestamp_offset=400)
    code, data = await _post_webhook(body, headers)
    assert code == 401
    assert "expired" in data["detail"].lower()


async def test_missing_secret_fails_secure(monkeypatch: pytest.MonkeyPatch):
    from src.core.config import settings

    monkeypatch.setattr(settings, "N8N_WEBHOOK_HMAC_SECRET", None)
    monkeypatch.setattr(settings, "N8N_API_KEY", None)
    monkeypatch.setattr(settings, "ENABLE_APP_CHECK", False)

    body = json.dumps(_VALID_PAYLOAD)
    # Build headers with a dummy secret (won't matter — secret is None server-side)
    ts = str(int(time.time()))
    headers = {
        "X-N8N-Timestamp": ts,
        "X-N8N-Signature": "sha256=dummy",
    }
    code, data = await _post_webhook(body, headers)
    assert code == 503
    assert "not configured" in data["detail"].lower()


@pytest.mark.usefixtures("_mock_settings")
async def test_missing_timestamp_header():
    body = json.dumps(_VALID_PAYLOAD)
    headers = {"X-N8N-Signature": "sha256=dummy"}
    code, data = await _post_webhook(body, headers)
    assert code == 401
    assert "timestamp" in data["detail"].lower()


@pytest.mark.usefixtures("_mock_settings")
async def test_missing_signature_header():
    body = json.dumps(_VALID_PAYLOAD)
    ts = str(int(time.time()))
    headers = {"X-N8N-Timestamp": ts}
    code, data = await _post_webhook(body, headers)
    assert code == 401
    assert "signature" in data["detail"].lower()


@pytest.mark.usefixtures("_mock_settings", "_mock_firestore")
async def test_invalid_json_body():
    body = "not-valid-json{{"
    headers = _make_valid_headers(_TEST_SECRET, body)
    code, data = await _post_webhook(body, headers)
    assert code == 400
    assert "json" in data["detail"].lower()


@pytest.mark.usefixtures("_mock_settings", "_mock_firestore_existing")
async def test_idempotent_webhook_event():
    body = json.dumps(_VALID_PAYLOAD)
    headers = _make_valid_headers(_TEST_SECRET, body)
    code, data = await _post_webhook(body, headers)
    assert code == 200
    assert data["status"] == "already_processed"
