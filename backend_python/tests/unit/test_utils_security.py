"""src.utils.security — filename sanitisation and upload magic-byte validation.

Consolidates the former ``test_security_bytes.py`` and the security sections
of ``test_coverage_boost.py`` into one module-scoped file.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from src.utils.security import (
    sanitize_filename,
    validate_image_magic_bytes,
    validate_video_magic_bytes,
)


def _upload(content: bytes, content_type: str | None) -> AsyncMock:
    file = AsyncMock()
    file.read = AsyncMock(return_value=content)
    file.seek = AsyncMock()
    file.content_type = content_type
    return file


MP4_HEADER = bytes.fromhex("00 00 00 18 66 74 79 70") + b"\x00" * 50
JPEG_HEADER = bytes.fromhex("FF D8 FF E0") + b"\x00" * 20
PNG_HEADER = bytes.fromhex("89 50 4E 47 0D 0A 1A 0A") + b"\x00" * 20


# ─── sanitize_filename ───────────────────────────────────────────────────────

class TestSanitizeFilename:
    async def test_normal_filename(self):
        assert await sanitize_filename("photo.jpg") == "photo.jpg"

    async def test_unix_path_traversal(self):
        result = await sanitize_filename("../../../etc/passwd")
        assert ".." not in result
        assert "/" not in result

    async def test_windows_path_traversal(self):
        result = await sanitize_filename("..\\..\\system32\\config.sys")
        assert ".." not in result
        assert "\\" not in result

    async def test_special_chars_replaced(self):
        result = await sanitize_filename("file<script>.mp4")
        assert "<" not in result
        assert ">" not in result

    async def test_spaces_replaced(self):
        assert await sanitize_filename("my photo.jpg") == "my_photo.jpg"

    async def test_long_filename_with_extension(self):
        result = await sanitize_filename("a" * 300 + ".jpg", max_length=20)
        assert len(result) <= 20
        assert result.endswith(".jpg")

    async def test_long_filename_without_extension(self):
        assert len(await sanitize_filename("a" * 300, max_length=20)) <= 20

    async def test_empty_string(self):
        assert await sanitize_filename("") == "unnamed_file"

    async def test_dots_dashes_underscores_preserved(self):
        assert await sanitize_filename("file-name_v2.0.tar.gz") == "file-name_v2.0.tar.gz"

    async def test_unicode_chars_replaced(self):
        assert ".jpg" in await sanitize_filename("файл.jpg")


# ─── validate_video_magic_bytes ──────────────────────────────────────────────

class TestValidateVideoMagicBytes:
    async def test_valid_mp4_ftyp(self):
        assert await validate_video_magic_bytes(_upload(MP4_HEADER, "video/mp4")) == "video/mp4"

    async def test_valid_webm(self):
        header = bytes.fromhex("1A 45 DF A3") + b"\x00" * 50
        assert await validate_video_magic_bytes(_upload(header, "video/webm")) == "video/webm"

    async def test_valid_quicktime(self):
        header = bytes.fromhex("00 00 00 14 66 74 79 70 71 74") + b"\x00" * 50
        assert await validate_video_magic_bytes(_upload(header, "video/quicktime")) == "video/quicktime"

    async def test_file_too_small(self):
        with pytest.raises(HTTPException) as exc:
            await validate_video_magic_bytes(_upload(b"\x00\x01\x02", "video/mp4"))
        assert exc.value.status_code == 400
        assert "too small" in exc.value.detail

    async def test_unknown_signature(self):
        with pytest.raises(HTTPException) as exc:
            await validate_video_magic_bytes(_upload(b"\xFF" * 10, "video/mp4"))
        assert exc.value.status_code == 400

    async def test_wrong_content_type(self):
        with pytest.raises(HTTPException) as exc:
            await validate_video_magic_bytes(_upload(MP4_HEADER, "application/pdf"))
        assert exc.value.status_code == 400

    async def test_none_content_type(self):
        with pytest.raises(HTTPException) as exc:
            await validate_video_magic_bytes(_upload(MP4_HEADER, None))
        assert exc.value.status_code == 400

    async def test_seek_called_after_read(self):
        file = _upload(MP4_HEADER, "video/mp4")
        await validate_video_magic_bytes(file)
        file.seek.assert_called_with(0)

    async def test_unexpected_exception_returns_500(self):
        file = _upload(b"", "video/mp4")
        file.read = AsyncMock(side_effect=RuntimeError("disk error"))
        with pytest.raises(HTTPException) as exc:
            await validate_video_magic_bytes(file)
        assert exc.value.status_code == 500


# ─── validate_image_magic_bytes ──────────────────────────────────────────────

class TestValidateImageMagicBytes:
    async def test_real_jpeg_fixture_passes(self, sample_image_bytes):
        assert await validate_image_magic_bytes(_upload(sample_image_bytes, "image/jpeg")) == "image/jpeg"

    async def test_valid_jpeg_jfif(self):
        assert await validate_image_magic_bytes(_upload(JPEG_HEADER, "image/jpeg")) == "image/jpeg"

    async def test_valid_jpeg_exif(self):
        header = bytes.fromhex("FF D8 FF E1") + b"\x00" * 20
        assert await validate_image_magic_bytes(_upload(header, "image/jpeg")) == "image/jpeg"

    async def test_valid_png(self):
        assert await validate_image_magic_bytes(_upload(PNG_HEADER, "image/png")) == "image/png"

    async def test_valid_gif87a(self):
        header = bytes.fromhex("47 49 46 38 37 61") + b"\x00" * 20
        assert await validate_image_magic_bytes(_upload(header, "image/gif")) == "image/gif"

    async def test_valid_gif89a(self):
        header = bytes.fromhex("47 49 46 38 39 61") + b"\x00" * 20
        assert await validate_image_magic_bytes(_upload(header, "image/gif")) == "image/gif"

    async def test_valid_webp(self):
        header = bytes.fromhex("52 49 46 46") + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 10
        assert await validate_image_magic_bytes(_upload(header, "image/webp")) == "image/webp"

    async def test_riff_without_webp_marker(self):
        header = bytes.fromhex("52 49 46 46") + b"\x00\x00\x00\x00" + b"AVI " + b"\x00" * 10
        with pytest.raises(HTTPException) as exc:
            await validate_image_magic_bytes(_upload(header, "image/webp"))
        assert exc.value.status_code == 400

    async def test_executable_renamed_to_jpg_rejected(self):
        exe = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00"
        with pytest.raises(HTTPException) as exc:
            await validate_image_magic_bytes(_upload(exe, "image/jpeg"))
        assert exc.value.status_code == 400
        detail = str(exc.value.detail)
        assert "File signature not recognized" in detail or "File claims to be" in detail

    async def test_file_too_small(self):
        with pytest.raises(HTTPException) as exc:
            await validate_image_magic_bytes(_upload(b"\xFF\xD8", "image/jpeg"))
        assert exc.value.status_code == 400

    async def test_unknown_signature(self):
        with pytest.raises(HTTPException) as exc:
            await validate_image_magic_bytes(_upload(b"\x00" * 8, "image/jpeg"))
        assert exc.value.status_code == 400

    async def test_mime_mismatch(self):
        # Valid PNG declared as JPEG.
        with pytest.raises(HTTPException) as exc:
            await validate_image_magic_bytes(_upload(PNG_HEADER, "image/jpeg"))
        assert exc.value.status_code == 400

    async def test_jpeg_alias_image_jpg(self):
        assert await validate_image_magic_bytes(_upload(JPEG_HEADER, "image/jpg")) == "image/jpeg"

    async def test_missing_content_type(self):
        with pytest.raises(HTTPException) as exc:
            await validate_image_magic_bytes(_upload(JPEG_HEADER, None))
        assert exc.value.status_code == 400
        assert "Content-Type" in exc.value.detail

    async def test_unexpected_exception_returns_500(self):
        file = _upload(b"", "image/jpeg")
        file.read = AsyncMock(side_effect=RuntimeError("disk error"))
        with pytest.raises(HTTPException) as exc:
            await validate_image_magic_bytes(file)
        assert exc.value.status_code == 500
