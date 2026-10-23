"""Security audit 2026-10-03, M4: the Admin SDK (which bypasses Storage rules)
may only read the current session's files in the app bucket."""
from unittest.mock import MagicMock, patch

import pytest
from src.utils.download import _admin_read_allowed, download_image_smart

BUCKET = "app-bucket"


@pytest.fixture(autouse=True)
def _bucket():
    with patch("src.utils.download.settings.FIREBASE_STORAGE_BUCKET", BUCKET):
        yield


@pytest.mark.parametrize(
    ("bucket", "path", "session", "allowed"),
    [
        (BUCKET, "user-uploads/s1/a.jpg", "s1", True),
        (BUCKET, "projects/s1/uploads/a.jpg", "s1", True),
        (BUCKET, "renders/s1/r.png", "s1", True),
        (BUCKET, "user-uploads/s2/a.jpg", "s1", False),  # another user's session
        (BUCKET, "projects/s10/uploads/a.jpg", "s1", False),  # prefix lookalike
        (BUCKET, "user-uploads/s1/../s2/a.jpg", "s1", False),
        ("other-bucket", "user-uploads/s1/a.jpg", "s1", False),
        (BUCKET, "user-uploads/s1/a.jpg", None, False),
    ],
)
def test_admin_read_scope(bucket, path, session, allowed):
    assert _admin_read_allowed(bucket, path, session) is allowed


@patch("src.utils.download.httpx.AsyncClient")
@patch("src.utils.download.storage")
async def test_foreign_path_never_uses_admin_sdk(mock_storage, mock_httpx_cls):
    client = MagicMock()
    client.__aenter__.side_effect = RuntimeError("http blocked in test")
    mock_httpx_cls.return_value = client

    with pytest.raises(Exception):  # noqa: B017 - only the Admin SDK matters here
        await download_image_smart(
            f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/user-uploads%2Fvictim%2Fa.jpg?alt=media",
            owner_session_id="attacker",
        )
    mock_storage.bucket.assert_not_called()


# ── storage_path_from_url (Phase 128: persist paths, not expiring URLs) ──────

import pytest as _pytest  # noqa: E402
from src.utils.download import storage_path_from_url  # noqa: E402


@_pytest.mark.parametrize(
    "url,expected",
    [
        (
            "https://storage.googleapis.com/bkt/renders/s1/1700-abcd1234.png?X-Goog-Signature=x",
            "renders/s1/1700-abcd1234.png",
        ),
        (
            "https://firebasestorage.googleapis.com/v0/b/bkt/o/projects%2Fp1%2Fuploads%2Fa.jpg?alt=media",
            "projects/p1/uploads/a.jpg",
        ),
        ("https://example.com/a.png", None),
        ("", None),
        (None, None),
    ],
)
def test_storage_path_from_url(url, expected):
    assert storage_path_from_url(url) == expected


# ── session_media_path / download_session_media (Phase 138: read by path) ────

from src.utils.download import MediaUnavailableError, download_session_media, session_media_path  # noqa: E402


@_pytest.mark.parametrize(
    "ref,expected",
    [
        (f"https://storage.googleapis.com/{BUCKET}/user-uploads/s1/a.jpg?X-Goog-Expires=3600", "user-uploads/s1/a.jpg"),
        (f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/projects%2Fs1%2Fuploads%2Fa.jpg?alt=media",
         "projects/s1/uploads/a.jpg"),
        (f"https://{BUCKET}/renders/s1/r.png", "renders/s1/r.png"),
        (f"gs://{BUCKET}/user-uploads/s1/clip.mp4", "user-uploads/s1/clip.mp4"),
        ("user-uploads/s1/a.jpg", "user-uploads/s1/a.jpg"),
        (f"https://storage.googleapis.com/{BUCKET}/user-uploads/s2/a.jpg", None),  # another session
        ("gs://other-bucket/user-uploads/s1/a.jpg", None),
        ("https://evil.example.com/user-uploads/s1/a.jpg", None),
        ("user-uploads/s1/../s2/a.jpg", None),
        ("files/abc", None),
        ("", None),
        (None, None),
    ],
)
def test_session_media_path(ref, expected):
    assert session_media_path(ref, "s1") == expected


def _storage_with(blob):
    storage = MagicMock()
    storage.bucket.return_value.get_blob.return_value = blob
    return storage


async def test_download_session_media_reads_by_path():
    blob = MagicMock(size=3, content_type="image/png")
    blob.download_as_bytes.return_value = b"png"
    storage = _storage_with(blob)
    with patch("src.utils.download.storage", storage):
        assert await download_session_media(f"gs://{BUCKET}/renders/s1/r.png", "s1") == (b"png", "image/png")
    storage.bucket.assert_called_once_with(BUCKET)
    storage.bucket.return_value.get_blob.assert_called_once_with("renders/s1/r.png")


@_pytest.mark.parametrize(
    ("ref", "blob"),
    [
        ("user-uploads/s2/a.jpg", MagicMock(size=1)),  # outside the session
        ("user-uploads/s1/a.jpg", None),  # deleted
        ("user-uploads/s1/a.jpg", MagicMock(size=10)),  # larger than the cap
    ],
)
async def test_download_session_media_refuses(ref, blob):
    storage = _storage_with(blob)
    with patch("src.utils.download.storage", storage), _pytest.raises(MediaUnavailableError):
        await download_session_media(ref, "s1", max_bytes=5)
    if blob is not None:
        blob.download_as_bytes.assert_not_called()
