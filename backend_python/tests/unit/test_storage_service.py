import pytest
from unittest.mock import MagicMock, patch
from src.schemas.storage import SignedUrlRequest
from src.services.storage_service import StorageService

@pytest.fixture
def mock_storage():
    with patch("src.services.storage_service.storage") as mock:
        yield mock

@pytest.fixture
def mock_settings():
    with patch("src.services.storage_service.settings") as mock:
        mock.FIREBASE_STORAGE_BUCKET = "test-bucket.appspot.com"
        yield mock

@pytest.mark.asyncio
async def test_generate_upload_url(mock_storage, mock_settings):
    # Setup mocks
    mock_bucket = MagicMock()
    mock_blob = MagicMock()
    mock_blob.generate_signed_url.return_value = "https://mock-signed-url.com"
    mock_bucket.blob.return_value = mock_blob
    mock_storage.bucket.return_value = mock_bucket

    service = StorageService()
    
    request = SignedUrlRequest(
        filename="test_image.jpg",
        content_type="image/jpeg",
        folder="project_assets"
    )

    response = await service.generate_upload_url(request)

    # Asserts
    assert response.upload_url == "https://mock-signed-url.com"
    assert "test-bucket.appspot.com" in response.public_url
    assert "project_assets" in response.path
    assert "test_image.jpg" in response.path

    # Verify blob path and name serialization
    mock_bucket.blob.assert_called_once()
    blob_path_arg = mock_bucket.blob.call_args[0][0]
    assert blob_path_arg.startswith("project_assets/")
    assert blob_path_arg.endswith("_test_image.jpg")
