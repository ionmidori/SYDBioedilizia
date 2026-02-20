"""
Pytest Fixtures and Configuration
===================================
Shared test fixtures for mocking external dependencies.
"""
import os
import sys
import pytest
from pathlib import Path
from unittest.mock import Mock, AsyncMock, MagicMock, patch
from datetime import datetime, timedelta

# Add parent directory to sys.path to enable 'src' imports
sys.path.insert(0, str(Path(__file__).parent.parent))



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


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 28: Quote HITL Workflow Fixtures
# ─────────────────────────────────────────────────────────────────────────────


@pytest.fixture
def mock_admin_decision_body():
    """Standard AdminDecisionBody for testing quote approval workflow."""
    from src.api.routes.quote_routes import AdminDecisionBody

    return AdminDecisionBody(
        decision="approve",
        notes="Approved by admin console. Ready for delivery.",
    )


@pytest.fixture
def mock_quote_state():
    """Minimal QuoteState template for testing."""
    from src.graph.quote_state import QuoteState

    return QuoteState(
        project_id="test-project-001",
        admin_decision=None,
        admin_notes="",
        ai_draft={
            "structural_skeleton": "Modern living room",
            "material_plan": "Plaster + oak flooring",
            "furnishing_strategy": "Minimalist furniture",
            "technical_notes": "8K photorealistic render",
        },
        pdf_url="",
    )


@pytest.fixture
def mock_n8n_webhook_urls(monkeypatch):
    """Setup n8n webhook URLs for testing."""
    monkeypatch.setenv("N8N_WEBHOOK_NOTIFY_ADMIN", "https://n8n.example.com/webhook/notify-admin")
    monkeypatch.setenv("N8N_WEBHOOK_DELIVER_QUOTE", "https://n8n.example.com/webhook/deliver-quote")
    monkeypatch.setenv("N8N_API_KEY", "test-n8n-api-key")
    return {
        "notify_admin": "https://n8n.example.com/webhook/notify-admin",
        "deliver_quote": "https://n8n.example.com/webhook/deliver-quote",
    }


@pytest.fixture
def mock_quote_graph():
    """Mock LangGraph singleton for quote route testing."""
    with patch("src.api.routes.quote_routes._graph") as mock_graph:
        mock_graph.ainvoke = AsyncMock()
        mock_graph.aupdate_state = AsyncMock()
        yield mock_graph


@pytest.fixture
def mock_quote_graph_with_memory_saver():
    """
    Real quote graph instance with MemorySaver (for integration testing).
    Uses MemorySaver, NOT FirestoreSaver, to avoid live Firestore calls.
    """
    from langgraph.checkpoint.memory import MemorySaver
    from src.graph.quote_graph import QuoteGraphFactory

    with patch("src.graph.quote_graph.get_checkpointer") as mock_get_cp:
        mock_get_cp.return_value = MemorySaver()
        factory = QuoteGraphFactory()
        graph = factory.create_graph()
        yield graph


@pytest.fixture
def mock_pdf_generation():
    """Mock PDF generation for testing admin approval pipeline."""
    with patch("src.services.admin_service.generate_pdf") as mock_gen:
        mock_gen.return_value = b"PDF bytes for test"
        yield mock_gen


@pytest.fixture
def mock_storage_upload():
    """Mock Firebase Storage upload for testing admin approval pipeline."""
    with patch("src.services.admin_service.upload_pdf_to_storage") as mock_upload:
        mock_upload.return_value = "https://storage.googleapis.com/test-bucket/projects/test-project-001/quote.pdf"
        yield mock_upload


@pytest.fixture
def mock_n8n_delivery():
    """Mock n8n webhook delivery for testing admin approval pipeline."""
    with patch("src.services.admin_service.deliver_quote_wrapper") as mock_deliver:
        mock_deliver.return_value = "Delivered"
        yield mock_deliver


@pytest.fixture
def mock_firestore_update():
    """Mock Firestore update for testing admin approval pipeline."""
    with patch("src.services.admin_service.get_async_firestore_client") as mock_fs:
        mock_client = AsyncMock()
        mock_doc = AsyncMock()
        mock_client.collection.return_value.document.return_value = mock_doc
        mock_fs.return_value = mock_client
        yield mock_fs


@pytest.fixture
def mock_httpx_async_client():
    """Mock httpx.AsyncClient for testing n8n delivery with retries."""
    with patch("src.tools.n8n_mcp_tools.httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={"status": "success"})
        mock_response.status_code = 200

        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)

        mock_client_class.return_value = mock_client
        yield mock_client_class
