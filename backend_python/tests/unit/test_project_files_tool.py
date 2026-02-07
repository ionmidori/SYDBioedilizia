
import pytest
from unittest.mock import MagicMock, patch
from src.tools.project_files import list_project_files

# Mock Data
MOCK_USER_ID = "user_123"
MOCK_OTHER_USER_ID = "user_999"
MOCK_SESSION_ID = "session_abc"
MOCK_PROJECT_DATA = {"user_id": MOCK_USER_ID, "title": "Test Project"}

@pytest.fixture
def mock_context_user(mocker):
    return mocker.patch("src.tools.project_files.get_current_user_id", return_value=MOCK_USER_ID)

@pytest.fixture
def mock_firebase(mocker):
    mock_firestore = mocker.patch("src.tools.project_files.firestore.client")
    mock_storage = mocker.patch("src.tools.project_files.storage.bucket")
    return mock_firestore, mock_storage

def test_list_files_success(mock_context_user, mock_firebase):
    """Test successful file listing for authorized user."""
    mock_db, mock_bucket = mock_firebase
    
    # Mock Firestore Project Get
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = MOCK_PROJECT_DATA
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc

    # Mock Storage Blobs
    mock_blob = MagicMock()
    mock_blob.name = "projects/session_abc/image.png"
    mock_blob.content_type = "image/png"
    mock_blob.generate_signed_url.return_value = "http://fake-signed-url.com"
    mock_blob.metadata = {"room": "Test", "status": "approved"}
    
    # Mock blob inside a folder (should skip root folder marker)
    mock_blob_1 = MagicMock()
    mock_blob_1.name = "projects/session_abc/image.png"
    
    # Mock return
    mock_bucket.return_value.list_blobs.return_value = [mock_blob]

    # Unwrap tool for unit testing
    result = list_project_files.func(MOCK_SESSION_ID)
    
    assert "image.png" in result
    assert "image/png" in result
    assert "Access Denied" not in result

def test_access_denied(mock_context_user, mock_firebase):
    """Test access denied when user does not own project."""
    mock_db, _ = mock_firebase
    
    # Mock Project owned by SOMEONE ELSE
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = {"user_id": MOCK_OTHER_USER_ID}
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc

    result = list_project_files.func(MOCK_SESSION_ID)
    
    assert "Access Denied" in result

def test_project_not_found(mock_context_user, mock_firebase):
    """Test error when project does not exist."""
    mock_db, _ = mock_firebase
    
    # Mock Non-existent Project
    mock_doc = MagicMock()
    mock_doc.exists = False
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc

    result = list_project_files.func(MOCK_SESSION_ID)
    
    assert "Project not found" in result

def test_category_filtering(mock_context_user, mock_firebase):
    """Test filtering files by category."""
    mock_db, mock_bucket = mock_firebase
    
    # Authorized Mock
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = MOCK_PROJECT_DATA
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc

    # blobs: 1 image, 1 pdf
    img_blob = MagicMock()
    img_blob.name = "img.png"
    img_blob.content_type = "image/png"
    img_blob.metadata = {}  # Fix: mock metadata
    
    pdf_blob = MagicMock()
    pdf_blob.name = "doc.pdf"
    pdf_blob.content_type = "application/pdf"
    pdf_blob.metadata = {}  # Fix: mock metadata
    
    # Return iterator
    mock_bucket.return_value.list_blobs.return_value = [img_blob, pdf_blob]

    # Filter for 'image'
    result = list_project_files.func(MOCK_SESSION_ID, category='image')
    
    assert "img.png" in result
    assert "doc.pdf" not in result
