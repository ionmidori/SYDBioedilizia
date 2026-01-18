"""
Pytest Fixtures and Configuration
===================================
Shared test fixtures for mocking external dependencies.
"""
import os
import sys
import pytest
from pathlib import Path
from unittest.mock import Mock, AsyncMock, MagicMock
from datetime import datetime, timedelta

# Add parent directory to sys.path to enable 'src' imports
sys.path.insert(0, str(Path(__file__).parent.parent))



@pytest.fixture
def mock_env_development(monkeypatch):
    """Set environment to development mode (bypasses quotas)."""
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setenv("FIREBASE_STORAGE_BUCKET", "test-bucket.firebasestorage.app")


@pytest.fixture
def mock_env_production(monkeypatch):
    """Set environment to production mode (enforces quotas)."""
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("GEMINI_API_KEY", "test-api-key")
    monkeypatch.setenv("FIREBASE_STORAGE_BUCKET", "test-bucket.firebasestorage.app")


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
