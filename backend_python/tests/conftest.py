"""
Pytest Fixtures and Configuration
===================================
Shared test fixtures for mocking external dependencies.
"""
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ── Test isolation: force a DUMMY Gemini API key BEFORE any `src` import ──────
# pydantic-settings ranks os.environ above the .env file, so this dummy overrides
# a real key sitting in a developer's .env. Unit tests mock `genai.Client`, so no
# real API call is ever made — this guarantees the default suite never consumes
# API quota or costs money, and lets settings.api_key resolve in CI (no key there).
# A non-empty key explicitly exported in the shell still wins, for the opt-in
# `pytest -m integration` live runs. We treat an empty value as unset because CI
# injects `GEMINI_API_KEY: ${{ secrets.* }}` which becomes "" when the secret is
# absent — that empty string would otherwise defeat setdefault.
if not os.environ.get("GEMINI_API_KEY"):
    os.environ["GEMINI_API_KEY"] = "test-dummy-key-not-real"

# Add parent directory to sys.path to enable 'src' imports
sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture(autouse=True)
def _reset_verified_token_cache():
    """A token verified (or mocked) in one test must not be served from the
    cache in another."""
    from src.auth.jwt_handler import clear_verified_token_cache

    clear_verified_token_cache()
    yield
    clear_verified_token_cache()


@pytest.fixture(autouse=True)
def _price_book_without_firestore():
    """Tests serve the bundled price book: PricingService must not try to reach
    Firestore (tests/unit/test_price_book.py drives the refresh explicitly)."""
    from src.services.pricing_service import PricingService

    PricingService.reset_price_book_cache()
    PricingService._refresh_after = float("inf")
    yield
    PricingService.reset_price_book_cache()


@pytest.fixture(autouse=True)
def _reset_genai_client_cache():
    """get_genai_client() is a process singleton: a client (or mock) created by
    one test must not leak into the next."""
    from src.core.models import get_genai_client

    get_genai_client.cache_clear()
    yield
    get_genai_client.cache_clear()


@pytest.fixture(autouse=True)
def _reset_adk_session_sync():
    """The orchestrator's session sync markers are process state: a session one
    test "served" must not look stale to the next. Cleared only when the module
    is already loaded (importing ADK for every test would be slow)."""
    yield
    orchestrator = sys.modules.get("src.adk.adk_orchestrator")
    if orchestrator is not None:
        orchestrator._synced_marker.clear()



@pytest.fixture
def mock_env_development(monkeypatch):
    """Set environment to development mode (bypasses quotas)."""
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setenv("FIREBASE_STORAGE_BUCKET", "test-bucket.firebasestorage.app")

    # Patch the actual settings object
    from src.core.config import settings
    with patch.object(settings, 'ENV', 'development'):
        yield


@pytest.fixture
def mock_env_production(monkeypatch):
    """Set environment to production mode (enforces quotas)."""
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("GEMINI_API_KEY", "test-api-key")
    monkeypatch.setenv("FIREBASE_STORAGE_BUCKET", "test-bucket.firebasestorage.app")

    # Patch the actual settings object
    from src.core.config import settings
    with patch.object(settings, 'ENV', 'production'):
        yield


@pytest.fixture
def mock_firestore_client():
    """Mock Firestore client to avoid real database calls."""
    mock_client = MagicMock()

    # Mock collection and document references
    mock_collection = MagicMock()
    mock_doc_ref = MagicMock()
    mock_snapshot = MagicMock()

    # Configure return values
    mock_client.collection.return_value = mock_collection
    mock_collection.document.return_value = mock_doc_ref
    mock_doc_ref.get.return_value = mock_snapshot
    mock_snapshot.exists = False

    return mock_client


@pytest.fixture
def mock_storage_client():
    """Mock Google Cloud Storage client to avoid real uploads."""
    mock_client = MagicMock()
    mock_bucket = MagicMock()
    mock_blob = MagicMock()

    mock_client.bucket.return_value = mock_bucket
    mock_bucket.blob.return_value = mock_blob
    mock_blob.public_url = "https://storage.googleapis.com/test-bucket/renders/test.jpg"

    return mock_client


@pytest.fixture
def mock_gemini_vision_response():
    """Mock response from Gemini Vision API (Architect)."""
    return {
        "structuralSkeleton": "A modern living room with high ceilings and large windows",
        "materialPlan": "Walls in matte white plaster, oak hardwood flooring",
        "furnishingStrategy": "Low-profile sofa, minimalist coffee table, pendant lights",
        "technicalNotes": "24mm lens, f/8, natural lighting, 8K photorealistic"
    }


@pytest.fixture
def mock_gemini_imagen_response():
    """Mock response from Gemini Imagen API (Image Generator)."""
    return {
        "success": True,
        "image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "mime_type": "image/jpeg"
    }


@pytest.fixture
def sample_image_bytes():
    """Generate minimal valid JPEG bytes for testing."""
    # Minimal 1x1 JPEG
    return bytes.fromhex(
        "ffd8ffe000104a46494600010101006000600000ffdb004300080606070605080707"
        "07090909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c23"
        "1c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c18"
        "0d0d1832211c213232323232323232323232323232323232323232323232323232"
        "32323232323232323232323232323232323232323232ffc00011080001000103011100"
        "021101031101ffc4001500010100000000000000000000000000000008ffc40014100100"
        "00000000000000000000000000ffc40014010100000000000000000000000000000000ff"
        "c40014110100000000000000000000000000000000ffda000c03010002110311003f00"
        "bfa0ffdb00000000000000000000000000000000000000000000000000000000000000"
        "00000000000000000000000000ffd9"
    )


