"""
Unit Tests - Upload Module
===========================
Tests for the Firebase Storage upload functionality.
"""
import pytest
from unittest.mock import MagicMock, patch
from src.storage.upload import upload_base64_image


class TestUpload:
    """Test image upload to Firebase Storage."""
    
    def test_successful_upload(self, mock_env_development):
        """GIVEN valid base64 image data
        WHEN upload_base64_image is called
        THEN should upload to bucket and return public URL
        """
        # Arrange
        # Valid base64 jpeg 1x1 pixel
        base64_data = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAAFhAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAP/aAAgBAQAAPwA="
        mock_blob = MagicMock()
        mock_blob.generate_signed_url.return_value = "https://storage.googleapis.com/test-bucket/signed-url"
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob
        
        mock_client = MagicMock()
        mock_client.bucket.return_value = mock_bucket
        
        # Patch the centralized client getter and bucket env var
        # Note: We match where the object is defined, as it is imported inside the function
        with patch('src.storage.firebase_storage.get_storage_client', return_value=mock_client):
            with patch('src.storage.upload.settings') as mock_settings:
                mock_settings.FIREBASE_STORAGE_BUCKET = 'test-bucket'
                # Act
                url = upload_base64_image(base64_data, "test-session")
        
        # Assert
        assert "https://storage.googleapis.com/test-bucket/signed-url" in url
        mock_bucket.blob.assert_called_once()
        mock_blob.upload_from_string.assert_called_once()
        mock_blob.generate_signed_url.assert_called_once()
        # make_public should NOT be called
        mock_blob.make_public.assert_not_called()
    
    def test_missing_bucket_config(self):
        """GIVEN FIREBASE_STORAGE_BUCKET not set
        WHEN upload_base64_image is called
        THEN should raise exception
        """
        # Arrange
        with patch('src.storage.upload.settings') as mock_settings:
            mock_settings.FIREBASE_STORAGE_BUCKET = None
            # Act & Assert
            with pytest.raises(Exception) as excinfo:
                upload_base64_image("data:image/png;base64,123", "test")
            
            assert "FIREBASE_STORAGE_BUCKET not configured" in str(excinfo.value)

    def test_image_too_large(self, mock_env_development):
        """GIVEN image larger than 10MB
        WHEN upload_base64_image is called
        THEN should raise exception
        """
        # Arrange: Create large dummy base64 string
        # 10MB bytes requires ~13.3MB base64 chars
        # We use 15MB chars to be safe
        large_data = "a" * (15 * 1024 * 1024) 
        
        with patch('src.storage.upload.settings') as mock_settings:
            mock_settings.FIREBASE_STORAGE_BUCKET = 'test-bucket'
             # Act & Assert
            with pytest.raises(Exception) as excinfo:
                upload_base64_image(large_data, "test")
            
            assert "Image too large" in str(excinfo.value)

    def test_upload_failure_propagates_error(self, mock_env_development):
        """GIVEN storage client fails
        WHEN upload_base64_image is called
        THEN should wrap and raise exception
        """
        # Arrange
        mock_client = MagicMock()
        mock_client.bucket.side_effect = Exception("Connection error")
        
        with patch('src.storage.firebase_storage.get_storage_client', return_value=mock_client):
            with patch('src.storage.upload.settings') as mock_settings:
                mock_settings.FIREBASE_STORAGE_BUCKET = 'test-bucket'
                 # Act & Assert
                with pytest.raises(Exception) as excinfo:
                    upload_base64_image("data:image/png;base64,123", "test")
                
                assert "Failed to upload image" in str(excinfo.value)
    
    def test_handles_no_data_uri_prefix(self, mock_env_development):
        """GIVEN base64 string without data: prefix
        WHEN upload_base64_image is called
        THEN should treat as PNG and upload
        """
        # Arrange
        raw_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        
        mock_blob = MagicMock()
        mock_blob.generate_signed_url.return_value = "https://storage.googleapis.com/test-bucket/signed-url"
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob
        mock_client = MagicMock()
        mock_client.bucket.return_value = mock_bucket
        
        with patch('src.storage.firebase_storage.get_storage_client', return_value=mock_client):
            with patch('src.storage.upload.settings') as mock_settings:
                mock_settings.FIREBASE_STORAGE_BUCKET = 'test-bucket'
                # Act
                url = upload_base64_image(raw_base64, "test", prefix="uploads")
        
        # Assert
        # Assert
        assert "signed-url" in url
