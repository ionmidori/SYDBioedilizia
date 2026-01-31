"""
Unit tests for the show_project_gallery tool.
Tests cover: access control, metadata filtering, JSON response format, error handling.
"""

import pytest
import json
from unittest.mock import MagicMock, patch
from src.tools.gallery import show_project_gallery

# Mock Data
MOCK_USER_ID = "user_123"
MOCK_OTHER_USER_ID = "user_999"
MOCK_SESSION_ID = "project_abc"
MOCK_PROJECT_DATA = {"user_id": MOCK_USER_ID, "title": "Test Project"}


@pytest.fixture
def mock_context_user(mocker):
    """Mock the current authenticated user."""
    return mocker.patch("src.tools.gallery.get_current_user_id", return_value=MOCK_USER_ID)


@pytest.fixture
def mock_firebase(mocker):
    """Mock Firebase Firestore and Storage clients."""
    mock_firestore = mocker.patch("src.tools.gallery.firestore.client")
    mock_storage = mocker.patch("src.tools.gallery.storage.bucket")
    return mock_firestore, mock_storage


def create_mock_blob(name: str, content_type: str, metadata: dict = None):
    """Helper to create a mock blob with metadata."""
    blob = MagicMock()
    blob.name = f"projects/{MOCK_SESSION_ID}/{name}"
    blob.content_type = content_type
    blob.metadata = metadata or {}
    blob.generate_signed_url.return_value = f"https://storage.googleapis.com/signed/{name}"
    return blob


def test_gallery_success_basic(mock_context_user, mock_firebase):
    """Test successful gallery retrieval with basic images."""
    mock_db, mock_bucket = mock_firebase
    
    # Mock Firestore: Project exists and user owns it
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = MOCK_PROJECT_DATA
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc
    
    # Mock Storage: Return 2 images
    blob1 = create_mock_blob("kitchen_1.jpg", "image/jpeg", {"room": "cucina"})
    blob2 = create_mock_blob("bathroom_1.png", "image/png", {"room": "bagno", "status": "approvato"})
    
    mock_bucket.return_value.list_blobs.return_value = [blob1, blob2]
    
    # Execute
    result = show_project_gallery.func(MOCK_SESSION_ID)
    
    # Validate JSON structure
    data = json.loads(result)
    assert data["type"] == "gallery"
    assert data["projectId"] == MOCK_SESSION_ID
    assert len(data["items"]) == 2
    
    # Validate items
    item1 = data["items"][0]
    assert "kitchen_1.jpg" in item1["name"]
    assert item1["metadata"]["room"] == "cucina"
    assert "signed" in item1["url"]


def test_gallery_room_filtering(mock_context_user, mock_firebase):
    """Test filtering images by room metadata."""
    mock_db, mock_bucket = mock_firebase
    
    # Authorize
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = MOCK_PROJECT_DATA
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc
    
    # 3 images: 2 kitchen, 1 bathroom
    blobs = [
        create_mock_blob("kitchen_1.jpg", "image/jpeg", {"room": "cucina"}),
        create_mock_blob("kitchen_2.jpg", "image/jpeg", {"room": "cucina"}),
        create_mock_blob("bathroom.jpg", "image/jpeg", {"room": "bagno"}),
    ]
    mock_bucket.return_value.list_blobs.return_value = blobs
    
    # Filter for kitchen
    result = show_project_gallery.func(MOCK_SESSION_ID, room="cucina")
    
    data = json.loads(result)
    assert len(data["items"]) == 2
    assert all("kitchen" in item["name"] for item in data["items"])


def test_gallery_status_filtering(mock_context_user, mock_firebase):
    """Test filtering images by status metadata."""
    mock_db, mock_bucket = mock_firebase
    
    # Authorize
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = MOCK_PROJECT_DATA
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc
    
    # 3 images: 1 approved, 2 draft
    blobs = [
        create_mock_blob("final.jpg", "image/jpeg", {"status": "approvato"}),
        create_mock_blob("draft1.jpg", "image/jpeg", {"status": "bozza"}),
        create_mock_blob("draft2.jpg", "image/jpeg", {"status": "bozza"}),
    ]
    mock_bucket.return_value.list_blobs.return_value = blobs
    
    # Filter for approved only
    result = show_project_gallery.func(MOCK_SESSION_ID, status="approvato")
    
    data = json.loads(result)
    assert len(data["items"]) == 1
    assert data["items"][0]["name"] == "final.jpg"


def test_gallery_access_denied(mock_context_user, mock_firebase):
    """Test access control: user does not own project."""
    mock_db, _ = mock_firebase
    
    # Project owned by someone else
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = {"user_id": MOCK_OTHER_USER_ID}
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc
    
    result = show_project_gallery.func(MOCK_SESSION_ID)
    
    assert "Access Denied" in result


def test_gallery_project_not_found(mock_context_user, mock_firebase):
    """Test error handling: project does not exist."""
    mock_db, _ = mock_firebase
    
    # Non-existent project
    mock_doc = MagicMock()
    mock_doc.exists = False
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc
    
    result = show_project_gallery.func(MOCK_SESSION_ID)
    
    assert "Project not found" in result


def test_gallery_no_images_found(mock_context_user, mock_firebase):
    """Test graceful handling when no images match filters."""
    mock_db, mock_bucket = mock_firebase
    
    # Authorize
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = MOCK_PROJECT_DATA
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc
    
    # Return no blobs
    mock_bucket.return_value.list_blobs.return_value = []
    
    result = show_project_gallery.func(MOCK_SESSION_ID)
    
    assert "No images found" in result


def test_gallery_ignores_non_images(mock_context_user, mock_firebase):
    """Test that non-image files are filtered out."""
    mock_db, mock_bucket = mock_firebase
    
    # Authorize
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = MOCK_PROJECT_DATA
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc
    
    # Mixed content: 1 image, 1 video, 1 PDF
    blobs = [
        create_mock_blob("photo.jpg", "image/jpeg"),
        create_mock_blob("video.mp4", "video/mp4"),
        create_mock_blob("plan.pdf", "application/pdf"),
    ]
    mock_bucket.return_value.list_blobs.return_value = blobs
    
    result = show_project_gallery.func(MOCK_SESSION_ID)
    
    data = json.loads(result)
    assert len(data["items"]) == 1
    assert data["items"][0]["name"] == "photo.jpg"


def test_gallery_max_limit(mock_context_user, mock_firebase):
    """Test that gallery respects the 12-item limit."""
    mock_db, mock_bucket = mock_firebase
    
    # Authorize
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = MOCK_PROJECT_DATA
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc
    
    # Return 20 images
    blobs = [create_mock_blob(f"photo_{i}.jpg", "image/jpeg") for i in range(20)]
    mock_bucket.return_value.list_blobs.return_value = blobs
    
    result = show_project_gallery.func(MOCK_SESSION_ID)
    
    data = json.loads(result)
    assert len(data["items"]) == 12  # Should cap at 12


def test_gallery_unauthenticated_user(mock_firebase):
    """Test error when user is not authenticated."""
    # Mock: No authenticated user
    with patch("src.tools.gallery.get_current_user_id", return_value=None):
        result = show_project_gallery.func(MOCK_SESSION_ID)
        assert "not authenticated" in result
