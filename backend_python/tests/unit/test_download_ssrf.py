"""SSRF / URL-parsing hardening tests for src/utils/download.py.

Covers CodeQL alerts py/full-ssrf (#1), py/incomplete-url-substring-sanitization
(#2, #3) and py/polynomial-redos (#10), plus the SSRF-guard IP-check regression.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.utils.download import (
    _build_allowlisted_request_url,
    _parse_firebase_url,
    _validate_url_for_ssrf,
    download_image_smart,
    is_gemini_file_uri,
)


class TestGeminiFileUri:
    def test_accepts_exact_host(self):
        assert is_gemini_file_uri("https://generativelanguage.googleapis.com/v1/files/abc")

    def test_accepts_files_prefix(self):
        assert is_gemini_file_uri("files/abc123")

    def test_rejects_lookalike_host(self):
        # Substring/startswith would have accepted this; exact hostname must not.
        assert not is_gemini_file_uri("https://generativelanguage.googleapis.com.evil.tld/x")

    def test_rejects_unrelated(self):
        assert not is_gemini_file_uri("https://storage.googleapis.com/b/o.png")


class TestValidateSsrf:
    def test_blocks_non_http_scheme(self):
        with pytest.raises(ValueError, match="scheme"):
            _validate_url_for_ssrf("file:///etc/passwd")

    def test_blocks_metadata_host(self):
        with pytest.raises(ValueError, match="SSRF target"):
            _validate_url_for_ssrf("http://metadata.google.internal/computeMetadata/v1/")

    def test_blocks_link_local_ip_literal(self):
        # Regression: the IP block previously sat inside a try/except ValueError
        # that swallowed its own raise, so this never actually blocked. Use a
        # link-local IP that is NOT in the static _BLOCKED_HOSTS set so the
        # ip-range branch is what rejects it.
        with pytest.raises(ValueError, match="private/reserved IP"):
            _validate_url_for_ssrf("http://169.254.1.1/latest/meta-data/")

    def test_blocks_private_rfc1918(self):
        with pytest.raises(ValueError, match="private/reserved IP"):
            _validate_url_for_ssrf("http://10.0.0.5/x")

    def test_blocks_non_allowlisted_host(self):
        with pytest.raises(ValueError, match="not in download allowlist"):
            _validate_url_for_ssrf("https://evil.example.com/x")

    def test_allows_allowlisted_host(self):
        _validate_url_for_ssrf("https://storage.googleapis.com/bucket/o.png")  # no raise


class TestBuildAllowlistedRequestUrl:
    def test_rebuilds_with_constant_host_and_https(self):
        out = _build_allowlisted_request_url("http://storage.googleapis.com:8080/bucket/o.png?x=1")
        # Scheme pinned to https, user-supplied port dropped, path/query preserved.
        assert out == "https://storage.googleapis.com/bucket/o.png?x=1"

    def test_rejects_non_allowlisted(self):
        with pytest.raises(ValueError):
            _build_allowlisted_request_url("https://evil.example.com/x")

    def test_rejects_internal_ip(self):
        with pytest.raises(ValueError):
            _build_allowlisted_request_url("http://169.254.1.1/x")


class TestParseFirebaseUrl:
    def test_client_url(self):
        bucket, path = _parse_firebase_url(
            "https://firebasestorage.googleapis.com/v0/b/my-bucket/o/images%2Fp.jpg?alt=media"
        )
        assert bucket == "my-bucket"
        assert path == "images/p.jpg"

    def test_signed_url(self):
        bucket, path = _parse_firebase_url("https://storage.googleapis.com/my-bucket/a/b.png")
        assert bucket == "my-bucket"
        assert path == "a/b.png"

    def test_non_firebase_returns_none(self):
        assert _parse_firebase_url("https://replicate.delivery/x/y.png") is None

    def test_redos_payload_returns_none_fast(self):
        # Former regex ran in polynomial time on this shape; urlparse is linear.
        payload = "http://storage.googleapis.com/./" + "a" * 5000
        # storage.googleapis.com IS the signed host, so it parses structurally
        # (bucket='.', path='a...'), no catastrophic backtracking.
        result = _parse_firebase_url(payload)
        assert result is not None


def _make_stream_response(status_code, headers, body=b""):
    """Build a mocked httpx streaming response usable as `async with client.stream(...)`."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.headers = headers
    resp.raise_for_status = MagicMock()

    async def aiter_bytes():
        if body:
            yield body

    resp.aiter_bytes = aiter_bytes

    stream_cm = AsyncMock()
    stream_cm.__aenter__ = AsyncMock(return_value=resp)
    stream_cm.__aexit__ = AsyncMock(return_value=False)
    return stream_cm


class TestRedirectSsrf:
    async def _client_returning(self, stream_responses):
        """Build a mocked httpx AsyncClient whose .stream() yields `stream_responses` in order."""
        mock_client = AsyncMock()
        mock_client.stream = MagicMock(side_effect=stream_responses)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        return mock_client

    @patch("src.utils.download.httpx.AsyncClient")
    async def test_redirect_to_internal_ip_blocked(self, mock_httpx_cls):
        redirect = _make_stream_response(302, {"location": "http://169.254.169.254/latest/"})
        mock_httpx_cls.return_value = await self._client_returning([redirect])

        with pytest.raises(Exception, match="Failed to download"):
            await download_image_smart("https://replicate.delivery/legit/img.png")

    @patch("src.utils.download.httpx.AsyncClient")
    async def test_valid_redirect_followed(self, mock_httpx_cls):
        redirect = _make_stream_response(
            302, {"location": "https://storage.googleapis.com/bucket/final.png"}
        )
        final = _make_stream_response(200, {"content-type": "image/png"}, body=b"\x89PNG")
        mock_httpx_cls.return_value = await self._client_returning([redirect, final])

        content, mime = await download_image_smart("https://replicate.delivery/legit/img.png")
        assert content == b"\x89PNG"
        assert mime == "image/png"

    @patch("src.utils.download.httpx.AsyncClient")
    async def test_oversized_body_rejected_mid_stream(self, mock_httpx_cls):
        # No content-length header, so the cap must be enforced while
        # iterating chunks rather than upfront.
        big_chunk = b"x" * (10 * 1024 * 1024)
        response = _make_stream_response(200, {"content-type": "image/png"})

        async def aiter_bytes():
            for _ in range(6):  # 60MB total, over the 50MB cap
                yield big_chunk

        # Same mocked resp object is returned on every __aenter__ call.
        streamed = await response.__aenter__()
        streamed.aiter_bytes = aiter_bytes

        mock_httpx_cls.return_value = await self._client_returning([response])

        with pytest.raises(Exception, match="Failed to download"):
            await download_image_smart("https://replicate.delivery/legit/img.png")
