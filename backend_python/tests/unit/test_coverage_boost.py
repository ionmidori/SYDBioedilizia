"""
Unit Tests - Coverage Boost
============================
Tests for low-coverage modules:
  - src/utils/security.py (sanitize_filename + magic bytes)
  - src/utils/download.py
  - src/services/media_processor.py
"""

from __future__ import annotations

import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException


# ---------------------------------------------------------------------------
# 1. src/utils/security.py — sanitize_filename
# ---------------------------------------------------------------------------

class TestSanitizeFilename:
    async def test_normal_filename(self):
        from src.utils.security import sanitize_filename
        assert await sanitize_filename("photo.jpg") == "photo.jpg"

    async def test_unix_path_traversal(self):
        from src.utils.security import sanitize_filename
        result = await sanitize_filename("../../../etc/passwd")
        assert ".." not in result
        assert "/" not in result

    async def test_windows_path_traversal(self):
        from src.utils.security import sanitize_filename
        result = await sanitize_filename("..\\..\\system32\\config.sys")
        assert ".." not in result
        assert "\\" not in result

    async def test_special_chars_replaced(self):
        from src.utils.security import sanitize_filename
        result = await sanitize_filename("file<script>.mp4")
        assert "<" not in result
        assert ">" not in result

    async def test_spaces_replaced(self):
        from src.utils.security import sanitize_filename
        result = await sanitize_filename("my photo.jpg")
        assert " " not in result
        assert result == "my_photo.jpg"

    async def test_long_filename_with_extension(self):
        from src.utils.security import sanitize_filename
        long_name = "a" * 300 + ".jpg"
        result = await sanitize_filename(long_name, max_length=20)
        assert len(result) <= 20
        assert result.endswith(".jpg")

    async def test_long_filename_without_extension(self):
        from src.utils.security import sanitize_filename
        long_name = "a" * 300
        result = await sanitize_filename(long_name, max_length=20)
        assert len(result) <= 20

    async def test_empty_string(self):
        from src.utils.security import sanitize_filename
        result = await sanitize_filename("")
        assert result == "unnamed_file"

    async def test_dots_dashes_underscores_preserved(self):
        from src.utils.security import sanitize_filename
        result = await sanitize_filename("file-name_v2.0.tar.gz")
        assert result == "file-name_v2.0.tar.gz"

    async def test_unicode_chars_replaced(self):
        from src.utils.security import sanitize_filename
        result = await sanitize_filename("файл.jpg")
        # Non-ASCII chars should be replaced
        assert ".jpg" in result


# ---------------------------------------------------------------------------
# 2. src/utils/security.py — validate_video_magic_bytes
# ---------------------------------------------------------------------------

class TestValidateVideoMagicBytes:
    def _make_file(self, content: bytes, content_type: str | None = "video/mp4"):
        file = AsyncMock()
        file.read = AsyncMock(return_value=content)
        file.seek = AsyncMock()
        file.content_type = content_type
        return file

    async def test_valid_mp4_ftyp(self):
        from src.utils.security import validate_video_magic_bytes
        header = bytes.fromhex("00 00 00 18 66 74 79 70") + b"\x00" * 50
        file = self._make_file(header, "video/mp4")
        result = await validate_video_magic_bytes(file)
        assert result == "video/mp4"

    async def test_valid_webm(self):
        from src.utils.security import validate_video_magic_bytes
        header = bytes.fromhex("1A 45 DF A3") + b"\x00" * 50
        file = self._make_file(header, "video/webm")
        result = await validate_video_magic_bytes(file)
        assert result == "video/webm"

    async def test_valid_quicktime(self):
        from src.utils.security import validate_video_magic_bytes
        header = bytes.fromhex("00 00 00 14 66 74 79 70 71 74") + b"\x00" * 50
        file = self._make_file(header, "video/quicktime")
        result = await validate_video_magic_bytes(file)
        assert result == "video/quicktime"

    async def test_file_too_small(self):
        from src.utils.security import validate_video_magic_bytes
        file = self._make_file(b"\x00\x01\x02", "video/mp4")
        with pytest.raises(HTTPException) as exc:
            await validate_video_magic_bytes(file)
        assert exc.value.status_code == 400
        assert "too small" in exc.value.detail

    async def test_unknown_signature(self):
        from src.utils.security import validate_video_magic_bytes
        file = self._make_file(b"\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF", "video/mp4")
        with pytest.raises(HTTPException) as exc:
            await validate_video_magic_bytes(file)
        assert exc.value.status_code == 400

    async def test_wrong_content_type(self):
        from src.utils.security import validate_video_magic_bytes
        header = bytes.fromhex("00 00 00 18 66 74 79 70") + b"\x00" * 50
        file = self._make_file(header, "application/pdf")
        with pytest.raises(HTTPException) as exc:
            await validate_video_magic_bytes(file)
        assert exc.value.status_code == 400

    async def test_none_content_type(self):
        from src.utils.security import validate_video_magic_bytes
        header = bytes.fromhex("00 00 00 18 66 74 79 70") + b"\x00" * 50
        file = self._make_file(header, None)
        with pytest.raises(HTTPException) as exc:
            await validate_video_magic_bytes(file)
        assert exc.value.status_code == 400

    async def test_seek_called_after_read(self):
        from src.utils.security import validate_video_magic_bytes
        header = bytes.fromhex("00 00 00 18 66 74 79 70") + b"\x00" * 50
        file = self._make_file(header, "video/mp4")
        await validate_video_magic_bytes(file)
        file.seek.assert_called_with(0)

    async def test_unexpected_exception_returns_500(self):
        from src.utils.security import validate_video_magic_bytes
        file = self._make_file(b"", "video/mp4")
        file.read = AsyncMock(side_effect=RuntimeError("disk error"))
        with pytest.raises(HTTPException) as exc:
            await validate_video_magic_bytes(file)
        assert exc.value.status_code == 500


# ---------------------------------------------------------------------------
# 3. src/utils/security.py — validate_image_magic_bytes
# ---------------------------------------------------------------------------

class TestValidateImageMagicBytes:
    def _make_file(self, content: bytes, content_type: str | None = "image/jpeg"):
        file = AsyncMock()
        file.read = AsyncMock(return_value=content)
        file.seek = AsyncMock()
        file.content_type = content_type
        return file

    async def test_valid_jpeg_jfif(self):
        from src.utils.security import validate_image_magic_bytes
        header = bytes.fromhex("FF D8 FF E0") + b"\x00" * 20
        file = self._make_file(header, "image/jpeg")
        assert await validate_image_magic_bytes(file) == "image/jpeg"

    async def test_valid_jpeg_exif(self):
        from src.utils.security import validate_image_magic_bytes
        header = bytes.fromhex("FF D8 FF E1") + b"\x00" * 20
        file = self._make_file(header, "image/jpeg")
        assert await validate_image_magic_bytes(file) == "image/jpeg"

    async def test_valid_png(self):
        from src.utils.security import validate_image_magic_bytes
        header = bytes.fromhex("89 50 4E 47 0D 0A 1A 0A") + b"\x00" * 20
        file = self._make_file(header, "image/png")
        assert await validate_image_magic_bytes(file) == "image/png"

    async def test_valid_gif87a(self):
        from src.utils.security import validate_image_magic_bytes
        header = bytes.fromhex("47 49 46 38 37 61") + b"\x00" * 20
        file = self._make_file(header, "image/gif")
        assert await validate_image_magic_bytes(file) == "image/gif"

    async def test_valid_gif89a(self):
        from src.utils.security import validate_image_magic_bytes
        header = bytes.fromhex("47 49 46 38 39 61") + b"\x00" * 20
        file = self._make_file(header, "image/gif")
        assert await validate_image_magic_bytes(file) == "image/gif"

    async def test_valid_webp(self):
        from src.utils.security import validate_image_magic_bytes
        # RIFF....WEBP
        header = bytes.fromhex("52 49 46 46") + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 10
        file = self._make_file(header, "image/webp")
        assert await validate_image_magic_bytes(file) == "image/webp"

    async def test_riff_without_webp_marker(self):
        from src.utils.security import validate_image_magic_bytes
        # RIFF but not WEBP at bytes 8-11
        header = bytes.fromhex("52 49 46 46") + b"\x00\x00\x00\x00" + b"AVI " + b"\x00" * 10
        file = self._make_file(header, "image/webp")
        with pytest.raises(HTTPException) as exc:
            await validate_image_magic_bytes(file)
        assert exc.value.status_code == 400

    async def test_file_too_small(self):
        from src.utils.security import validate_image_magic_bytes
        file = self._make_file(b"\xFF\xD8", "image/jpeg")
        with pytest.raises(HTTPException) as exc:
            await validate_image_magic_bytes(file)
        assert exc.value.status_code == 400

    async def test_unknown_signature(self):
        from src.utils.security import validate_image_magic_bytes
        file = self._make_file(b"\x00\x00\x00\x00\x00\x00\x00\x00", "image/jpeg")
        with pytest.raises(HTTPException) as exc:
            await validate_image_magic_bytes(file)
        assert exc.value.status_code == 400

    async def test_mime_mismatch(self):
        from src.utils.security import validate_image_magic_bytes
        # Valid PNG header but declared as JPEG
        header = bytes.fromhex("89 50 4E 47 0D 0A 1A 0A") + b"\x00" * 20
        file = self._make_file(header, "image/jpeg")
        with pytest.raises(HTTPException) as exc:
            await validate_image_magic_bytes(file)
        assert exc.value.status_code == 400

    async def test_jpeg_alias_image_jpg(self):
        from src.utils.security import validate_image_magic_bytes
        header = bytes.fromhex("FF D8 FF E0") + b"\x00" * 20
        file = self._make_file(header, "image/jpg")
        assert await validate_image_magic_bytes(file) == "image/jpeg"

    async def test_missing_content_type(self):
        from src.utils.security import validate_image_magic_bytes
        header = bytes.fromhex("FF D8 FF E0") + b"\x00" * 20
        file = self._make_file(header, None)
        with pytest.raises(HTTPException) as exc:
            await validate_image_magic_bytes(file)
        assert exc.value.status_code == 400
        assert "Content-Type" in exc.value.detail

    async def test_unexpected_exception_returns_500(self):
        from src.utils.security import validate_image_magic_bytes
        file = self._make_file(b"", "image/jpeg")
        file.read = AsyncMock(side_effect=RuntimeError("disk error"))
        with pytest.raises(HTTPException) as exc:
            await validate_image_magic_bytes(file)
        assert exc.value.status_code == 500


# ---------------------------------------------------------------------------
# 4. src/utils/download.py
# ---------------------------------------------------------------------------

class TestDownloadImageSmart:
    async def test_gemini_file_api_url_passthrough(self):
        from src.utils.download import download_image_smart
        content, mime = await download_image_smart("https://generativelanguage.googleapis.com/v1/files/abc")
        assert mime == "application/vnd.google-apps.file"
        assert b"generativelanguage" in content

    async def test_files_prefix_passthrough(self):
        from src.utils.download import download_image_smart
        content, mime = await download_image_smart("files/abc123")
        assert mime == "application/vnd.google-apps.file"

    @patch("src.utils.download.storage")
    async def test_firebase_storage_url(self, mock_storage):
        from src.utils.download import download_image_smart
        mock_blob = MagicMock()
        mock_blob.download_as_bytes.return_value = b"\xff\xd8\xff\xe0"
        mock_blob.content_type = "image/jpeg"
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob
        mock_storage.bucket.return_value = mock_bucket

        content, mime = await download_image_smart(
            "https://firebasestorage.googleapis.com/v0/b/my-bucket/o/images%2Fphoto.jpg?alt=media"
        )
        assert content == b"\xff\xd8\xff\xe0"
        assert mime == "image/jpeg"

    @patch("src.utils.download.storage")
    async def test_gcs_url_pattern(self, mock_storage):
        from src.utils.download import download_image_smart
        mock_blob = MagicMock()
        mock_blob.download_as_bytes.return_value = b"\x89PNG"
        mock_blob.content_type = "image/png"
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob
        mock_storage.bucket.return_value = mock_bucket

        content, mime = await download_image_smart(
            "https://storage.googleapis.com/my-bucket/images/photo.png"
        )
        assert content == b"\x89PNG"
        assert mime == "image/png"

    @patch("src.utils.download.storage")
    @patch("src.utils.download.httpx.AsyncClient")
    async def test_admin_sdk_fallback_to_http(self, mock_httpx_cls, mock_storage):
        from src.utils.download import download_image_smart
        # Admin SDK fails
        mock_storage.bucket.side_effect = Exception("Not initialized")

        # HTTP succeeds
        mock_response = MagicMock()
        mock_response.content = b"\xff\xd8\xff\xe0"
        mock_response.headers = {"content-type": "image/jpeg"}
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock()
        mock_httpx_cls.return_value = mock_client

        content, mime = await download_image_smart(
            "https://firebasestorage.googleapis.com/v0/b/bucket/o/path?alt=media"
        )
        assert content == b"\xff\xd8\xff\xe0"
        assert mime == "image/jpeg"

    @patch("src.utils.download.httpx.AsyncClient")
    async def test_regular_http_download(self, mock_httpx_cls):
        from src.utils.download import download_image_smart
        mock_response = MagicMock()
        mock_response.content = b"\x89PNG\r\n\x1a\n"
        mock_response.headers = {"content-type": "image/png"}
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock()
        mock_httpx_cls.return_value = mock_client

        content, mime = await download_image_smart("https://storage.googleapis.com/test-bucket/photo.png")
        assert content == b"\x89PNG\r\n\x1a\n"
        assert mime == "image/png"

    @patch("src.utils.download.httpx.AsyncClient")
    async def test_suspicious_content_type_fallback(self, mock_httpx_cls):
        from src.utils.download import download_image_smart
        mock_response = MagicMock()
        mock_response.content = b"\x89PNG"
        mock_response.headers = {"content-type": "application/octet-stream"}
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock()
        mock_httpx_cls.return_value = mock_client

        content, mime = await download_image_smart("https://storage.googleapis.com/test-bucket/photo.png")
        assert mime == "image/png"  # guessed from URL

    @patch("src.utils.download.httpx.AsyncClient")
    async def test_missing_content_type_header(self, mock_httpx_cls):
        from src.utils.download import download_image_smart
        mock_response = MagicMock()
        mock_response.content = b"data"
        mock_response.headers = {}
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock()
        mock_httpx_cls.return_value = mock_client

        content, mime = await download_image_smart("https://storage.googleapis.com/test-bucket/unknown")
        assert mime == "application/octet-stream"

    @patch("src.utils.download.httpx.AsyncClient")
    async def test_http_error_propagation(self, mock_httpx_cls):
        from src.utils.download import download_image_smart
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = Exception("404 Not Found")

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_httpx_cls.return_value = mock_client

        with pytest.raises(Exception, match="Failed to download"):
            await download_image_smart("https://storage.googleapis.com/test-bucket/missing.jpg")

    @patch("src.utils.download.storage")
    async def test_blob_no_content_type(self, mock_storage):
        from src.utils.download import download_image_smart
        mock_blob = MagicMock()
        mock_blob.download_as_bytes.return_value = b"\xff\xd8"
        mock_blob.content_type = None
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob
        mock_storage.bucket.return_value = mock_bucket

        content, mime = await download_image_smart(
            "https://firebasestorage.googleapis.com/v0/b/bucket/o/images%2Fphoto.jpg?alt=media"
        )
        assert mime == "image/jpeg"  # guessed from path


# ---------------------------------------------------------------------------
# 5. src/services/media_processor.py
# ---------------------------------------------------------------------------

class TestMediaProcessor:
    @patch("src.services.media_processor.settings")
    @patch("src.services.media_processor.genai")
    def test_init_with_api_key(self, mock_genai, mock_settings):
        from src.services.media_processor import MediaProcessor
        mock_settings.GEMINI_API_KEY = "test-key"
        processor = MediaProcessor()
        mock_genai.Client.assert_called_once()

    @patch("src.services.media_processor.settings")
    def test_init_without_api_key_raises(self, mock_settings):
        from src.services.media_processor import MediaProcessor
        mock_settings.GEMINI_API_KEY = None
        with pytest.raises(RuntimeError, match="GEMINI_API_KEY"):
            MediaProcessor()

    @patch("src.services.media_processor.settings")
    @patch("src.services.media_processor.genai")
    async def test_upload_success(self, mock_genai, mock_settings):
        from src.services.media_processor import MediaProcessor
        mock_settings.GEMINI_API_KEY = "test-key"

        mock_uploaded = MagicMock()
        mock_uploaded.uri = "files/123"
        mock_uploaded.state = "ACTIVE"

        mock_client = MagicMock()
        mock_client.aio.files.upload = AsyncMock(return_value=mock_uploaded)
        mock_genai.Client.return_value = mock_client

        processor = MediaProcessor()
        result = await processor.upload_video_for_analysis(io.BytesIO(b"data"), "video/mp4", "test.mp4")
        assert result.uri == "files/123"

    @patch("src.services.media_processor.settings")
    @patch("src.services.media_processor.genai")
    async def test_upload_failure_raises(self, mock_genai, mock_settings):
        from src.services.media_processor import MediaProcessor, VideoProcessingError
        mock_settings.GEMINI_API_KEY = "test-key"

        mock_client = MagicMock()
        mock_client.aio.files.upload = AsyncMock(side_effect=Exception("Network error"))
        mock_genai.Client.return_value = mock_client

        processor = MediaProcessor()
        with pytest.raises(VideoProcessingError, match="Video upload failed"):
            await processor.upload_video_for_analysis(io.BytesIO(b"data"), "video/mp4", "test.mp4")

    @patch("src.services.media_processor.settings")
    @patch("src.services.media_processor.genai")
    async def test_wait_for_processing_active(self, mock_genai, mock_settings):
        from src.services.media_processor import MediaProcessor
        mock_settings.GEMINI_API_KEY = "test-key"

        mock_file = MagicMock()
        mock_file.state = MagicMock()
        mock_file.state.name = "ACTIVE"

        mock_client = MagicMock()
        mock_client.aio.files.get = AsyncMock(return_value=mock_file)
        mock_genai.Client.return_value = mock_client

        processor = MediaProcessor()
        result = await processor.wait_for_processing("files/123", timeout_seconds=5)
        assert result is mock_file

    @patch("src.services.media_processor.settings")
    @patch("src.services.media_processor.genai")
    async def test_wait_for_processing_failed(self, mock_genai, mock_settings):
        from src.services.media_processor import MediaProcessor, VideoProcessingError
        mock_settings.GEMINI_API_KEY = "test-key"

        mock_file = MagicMock()
        mock_file.state = MagicMock()
        mock_file.state.name = "FAILED"

        mock_client = MagicMock()
        mock_client.aio.files.get = AsyncMock(return_value=mock_file)
        mock_genai.Client.return_value = mock_client

        processor = MediaProcessor()
        with pytest.raises(VideoProcessingError, match="failed"):
            await processor.wait_for_processing("files/123", timeout_seconds=5)

    @patch("src.services.media_processor.settings")
    @patch("src.services.media_processor.genai")
    def test_get_media_processor_factory(self, mock_genai, mock_settings):
        from src.services.media_processor import get_media_processor
        mock_settings.GEMINI_API_KEY = "test-key"
        processor = get_media_processor()
        assert processor is not None
