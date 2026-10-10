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
