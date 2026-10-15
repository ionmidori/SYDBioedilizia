"""src.utils.download.download_image_smart — routing, Admin SDK path, HTTP fallback.

SSRF and admin-scope rules live in ``test_download_ssrf.py`` and
``test_download_admin_scope.py``; this file covers the functional paths.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.utils.download import download_image_smart


def _mock_stream_client(mock_httpx_cls, status_code, headers, body=b"", raise_for_status_error=None):
    """Wire mock_httpx_cls so `async with client.stream(...) as resp:` yields a
    single response with the given status/headers/body (download.py streams
    the response body instead of buffering it via client.get())."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.headers = headers
    resp.raise_for_status = MagicMock(side_effect=raise_for_status_error)

    async def aiter_bytes():
        if body:
            yield body

    resp.aiter_bytes = aiter_bytes

    stream_cm = AsyncMock()
    stream_cm.__aenter__ = AsyncMock(return_value=resp)
    stream_cm.__aexit__ = AsyncMock(return_value=False)

    mock_client = AsyncMock()
    mock_client.stream = MagicMock(return_value=stream_cm)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_httpx_cls.return_value = mock_client
    return mock_client


def _mock_bucket(mock_storage, data: bytes, content_type: str | None) -> None:
    blob = MagicMock()
    blob.download_as_bytes.return_value = data
    blob.content_type = content_type
    bucket = MagicMock()
    bucket.blob.return_value = blob
    mock_storage.bucket.return_value = bucket


class TestGeminiFilePassthrough:
    async def test_gemini_file_api_url_passthrough(self):
        content, mime = await download_image_smart("https://generativelanguage.googleapis.com/v1/files/abc")
        assert mime == "application/vnd.google-apps.file"
        assert b"generativelanguage" in content

    async def test_files_prefix_passthrough(self):
        _, mime = await download_image_smart("files/abc123")
        assert mime == "application/vnd.google-apps.file"


class TestAdminSdkPath:
    @patch("src.utils.download.storage")
    async def test_firebase_storage_url(self, mock_storage):
        _mock_bucket(mock_storage, b"\xff\xd8\xff\xe0", "image/jpeg")
        with patch("src.utils.download.settings.FIREBASE_STORAGE_BUCKET", "my-bucket"):
            content, mime = await download_image_smart(
                "https://firebasestorage.googleapis.com/v0/b/my-bucket/o/user-uploads%2Fs1%2Fphoto.jpg?alt=media",
                owner_session_id="s1",
            )
        assert content == b"\xff\xd8\xff\xe0"
        assert mime == "image/jpeg"

    @patch("src.utils.download.storage")
    async def test_gcs_url_pattern(self, mock_storage):
        _mock_bucket(mock_storage, b"\x89PNG", "image/png")
        with patch("src.utils.download.settings.FIREBASE_STORAGE_BUCKET", "my-bucket"):
            content, mime = await download_image_smart(
                "https://storage.googleapis.com/my-bucket/renders/s1/photo.png",
                owner_session_id="s1",
            )
        assert content == b"\x89PNG"
        assert mime == "image/png"

    @patch("src.utils.download.storage")
    async def test_blob_without_content_type_guesses_from_path(self, mock_storage):
        _mock_bucket(mock_storage, b"\xff\xd8", None)
        with patch("src.utils.download.settings.FIREBASE_STORAGE_BUCKET", "bucket"):
            _, mime = await download_image_smart(
                "https://firebasestorage.googleapis.com/v0/b/bucket/o/user-uploads%2Fs1%2Fphoto.jpg?alt=media",
                owner_session_id="s1",
            )
        assert mime == "image/jpeg"

    @patch("src.utils.download.storage")
    @patch("src.utils.download.httpx.AsyncClient")
    async def test_admin_sdk_failure_falls_back_to_http(self, mock_httpx_cls, mock_storage):
        mock_storage.bucket.side_effect = Exception("Not initialized")
        _mock_stream_client(mock_httpx_cls, 200, {"content-type": "image/jpeg"}, body=b"\xff\xd8\xff\xe0")

        with patch("src.utils.download.settings.FIREBASE_STORAGE_BUCKET", "bucket"):
            content, mime = await download_image_smart(
                "https://firebasestorage.googleapis.com/v0/b/bucket/o/projects%2Fs1%2Fa.jpg?alt=media",
                owner_session_id="s1",
            )
        assert content == b"\xff\xd8\xff\xe0"
        assert mime == "image/jpeg"


class TestHttpPath:
    @patch("src.utils.download.httpx.AsyncClient")
    async def test_regular_http_download(self, mock_httpx_cls):
        _mock_stream_client(mock_httpx_cls, 200, {"content-type": "image/png"}, body=b"\x89PNG\r\n\x1a\n")
        content, mime = await download_image_smart("https://storage.googleapis.com/test-bucket/photo.png")
        assert content == b"\x89PNG\r\n\x1a\n"
        assert mime == "image/png"

    @patch("src.utils.download.httpx.AsyncClient")
    async def test_suspicious_content_type_guessed_from_url(self, mock_httpx_cls):
        _mock_stream_client(mock_httpx_cls, 200, {"content-type": "application/octet-stream"}, body=b"\x89PNG")
        _, mime = await download_image_smart("https://storage.googleapis.com/test-bucket/photo.png")
        assert mime == "image/png"

    @patch("src.utils.download.httpx.AsyncClient")
    async def test_missing_content_type_header(self, mock_httpx_cls):
        _mock_stream_client(mock_httpx_cls, 200, {}, body=b"data")
        _, mime = await download_image_smart("https://storage.googleapis.com/test-bucket/unknown")
        assert mime == "application/octet-stream"

    @patch("src.utils.download.httpx.AsyncClient")
    async def test_http_error_propagation(self, mock_httpx_cls):
        _mock_stream_client(mock_httpx_cls, 404, {}, raise_for_status_error=Exception("404 Not Found"))
        with pytest.raises(Exception, match="Failed to download"):
            await download_image_smart("https://storage.googleapis.com/test-bucket/missing.jpg")
