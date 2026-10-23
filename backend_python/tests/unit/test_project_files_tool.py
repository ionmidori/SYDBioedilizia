
from unittest.mock import MagicMock

import pytest
from src.tools.project_files import list_project_files
from src.tools.project_files_view import ProjectFilesView

# Mock Data
MOCK_USER_ID = "user_123"
MOCK_OTHER_USER_ID = "user_999"
MOCK_SESSION_ID = "session_abc"
MOCK_PROJECT_DATA = {"userId": MOCK_USER_ID, "title": "Test Project"}

@pytest.fixture
def mock_context_user(mocker):
    """The verified caller (ADK tool_context.user_id), passed explicitly."""
    return MOCK_USER_ID

@pytest.fixture
def mock_firebase(mocker):
    mock_firestore = mocker.patch("src.tools.project_storage.firestore.client")
    mock_storage = mocker.patch("src.tools.project_storage.storage.bucket")
    # One prefix in these tests; the multi-prefix listing has its own test.
    mocker.patch("src.tools.project_storage.session_storage_prefixes", return_value=("projects/x/",))
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
    result = list_project_files(MOCK_SESSION_ID, MOCK_USER_ID)

    assert "image.png" in result
    assert "image/png" in result
    assert "Access Denied" not in result

def test_access_denied(mock_context_user, mock_firebase):
    """Test access denied when user does not own project."""
    mock_db, _ = mock_firebase

    # Mock Project owned by SOMEONE ELSE
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = {"userId": MOCK_OTHER_USER_ID}
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc

    result = list_project_files(MOCK_SESSION_ID, MOCK_USER_ID)

    assert "Access Denied" in result

def test_project_not_found(mock_context_user, mock_firebase):
    """Test error when project does not exist."""
    mock_db, _ = mock_firebase

    # Mock Non-existent Project
    mock_doc = MagicMock()
    mock_doc.exists = False
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc

    result = list_project_files(MOCK_SESSION_ID, MOCK_USER_ID)

    assert "not found" in result.lower()

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
    result = list_project_files(MOCK_SESSION_ID, MOCK_USER_ID, category='image')

    assert "img.png" in result
    assert "doc.pdf" not in result


def _authorize(mock_db):
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = MOCK_PROJECT_DATA
    mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc


def test_lines_carry_file_id_and_room(mock_context_user, mock_firebase):
    """Phase 138: the room of the `files` document wins over the legacy Storage tag."""
    mock_db, mock_bucket = mock_firebase
    _authorize(mock_db)
    blob = MagicMock()
    blob.name = "projects/x/bagno.jpg"
    blob.content_type = "image/jpeg"
    blob.metadata = {"room": "vecchio tag"}
    mock_bucket.return_value.list_blobs.return_value = [blob]
    view = ProjectFilesView(
        room_labels={"r_bagno": "Bagno"},
        files=[{"id": "f1", "roomId": "r_bagno", "metadata": {"storage_path": "projects/x/bagno.jpg"}}],
    )
    assert list_project_files(MOCK_SESSION_ID, MOCK_USER_ID, view=view) == "- [Bagno] f1 · bagno.jpg (image/jpeg)"


def test_files_of_one_room(mock_context_user, mock_firebase):
    mock_db, mock_bucket = mock_firebase
    _authorize(mock_db)
    view = ProjectFilesView(
        room_labels={"r_bagno": "Bagno"},
        room_only=True,
        files=[
            {"id": "f1", "type": "image", "roomId": "r_bagno", "name": "a.jpg", "mimeType": "image/jpeg"},
            {"id": "v1", "type": "video", "roomId": "r_bagno", "name": "v.mp4", "mimeType": "video/mp4"},
        ],
    )
    result = list_project_files(MOCK_SESSION_ID, MOCK_USER_ID, category="video", view=view)
    assert result == "- [Bagno] v1 · v.mp4 (video/mp4)"
    mock_bucket.return_value.list_blobs.assert_not_called()
    assert list_project_files(MOCK_SESSION_ID, MOCK_USER_ID, view=ProjectFilesView(room_only=True)) == (
        "No files found for this room."
    )
