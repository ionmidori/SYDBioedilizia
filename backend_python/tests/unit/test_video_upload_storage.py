"""
/api/upload/video stores the video in Firebase Storage (no Gemini File API, no
AI Studio key) and returns a gs:// URI that the orchestrator hands to Vertex.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from main import app
from src.adk.adk_orchestrator import _video_parts
from src.auth.jwt_handler import verify_token
from src.repositories.conversation_repository import ConversationRepository
from src.schemas.internal import UserSession

_MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 256
_BUCKET = "app-bucket"


def _repo_with_owner(owner: str | None) -> ConversationRepository:
    doc = MagicMock(exists=owner is not None)
    doc.to_dict.return_value = {"userId": owner}
    db = MagicMock()
    db.collection.return_value.document.return_value.get = AsyncMock(return_value=doc)
    repo = ConversationRepository()
    repo._get_async_db = MagicMock(return_value=db)  # type: ignore[method-assign]
    return repo


def _bucket() -> MagicMock:
    bucket = MagicMock()
    bucket.name = _BUCKET
    bucket.blob.return_value.generate_signed_url.return_value = "https://signed"
    return bucket


@pytest.fixture()
def _auth(monkeypatch: pytest.MonkeyPatch):
    # The middleware reads its module-level copy of the flag, not settings.
    monkeypatch.setattr("src.middleware.app_check.ENABLE_APP_CHECK", False)
    app.dependency_overrides[verify_token] = lambda: UserSession(uid="owner-uid", is_authenticated=True)
    yield
    app.dependency_overrides.clear()


async def _upload(repo: ConversationRepository, bucket: MagicMock, data: dict[str, str] | None = None):
    increment = AsyncMock()
    with patch("src.api.routes.upload.get_conversation_repository", return_value=repo), \
         patch("src.api.routes.upload._enforce_quota", new=AsyncMock(return_value=5)), \
         patch("src.api.routes.upload.increment_quota", new=increment), \
         patch("src.api.routes.upload.fb_storage.bucket", return_value=bucket):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/upload/video",
                data={"session_id": "sess-1"} if data is None else data,
                files={"file": ("clip.mp4", _MP4, "video/mp4")},
            )
    return resp, increment


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_video_is_streamed_to_storage_and_returns_gs_uri():
    bucket = _bucket()
    resp, increment = await _upload(_repo_with_owner("owner-uid"), bucket)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    path = body["file_path"]
    assert path.startswith("user-uploads/sess-1/") and path.endswith(".mp4")
    assert body["file_uri"] == f"gs://{_BUCKET}/{path}"
    assert body["url"] == "https://signed"
    assert body["mime_type"] == "video/mp4"
    assert body["size_bytes"] == len(_MP4)

    # Resumable upload in fixed chunks, straight from the spooled file
    _, kwargs = bucket.blob.call_args
    assert kwargs["chunk_size"] == 8 * 1024 * 1024
    upload = bucket.blob.return_value.upload_from_file
    upload.assert_called_once()
    assert upload.call_args.kwargs["content_type"] == "video/mp4"
    increment.assert_awaited_once_with("owner-uid", "upload_video")


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_video_upload_to_foreign_session_is_rejected():
    bucket = _bucket()
    resp, increment = await _upload(_repo_with_owner("victim-uid"), bucket)

    assert resp.status_code == 403
    bucket.blob.assert_not_called()
    increment.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_video_over_size_cap_is_rejected(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("src.api.routes.upload.MAX_VIDEO_SIZE", 64)
    bucket = _bucket()
    resp, increment = await _upload(_repo_with_owner("owner-uid"), bucket)

    assert resp.status_code == 413
    bucket.blob.assert_not_called()
    increment.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_video_upload_requires_session_id():
    resp, _ = await _upload(_repo_with_owner("owner-uid"), _bucket(), data={})
    assert resp.status_code == 422


# ── Orchestrator: which video URIs reach the model ───────────────────────────

def _uris(parts) -> list[tuple[str, str]]:
    return [(p.file_data.file_uri, p.file_data.mime_type) for p in parts]


def test_video_parts_accepts_own_session_files_with_mime_from_extension():
    uris = [
        f"gs://{_BUCKET}/user-uploads/sess-1/a.mp4",
        f"gs://{_BUCKET}/projects/sess-1/uploads/b.mov",
        f"gs://{_BUCKET}/user-uploads/sess-1/c.webm",
    ]
    parts = _video_parts(uris, session_id="sess-1", bucket=_BUCKET, vertex=True)
    assert _uris(parts) == [
        (uris[0], "video/mp4"),
        (uris[1], "video/quicktime"),
        (uris[2], "video/webm"),
    ]


@pytest.mark.parametrize(
    "uri",
    [
        f"gs://{_BUCKET}/user-uploads/other-session/a.mp4",  # another user's session
        f"gs://{_BUCKET}/user-uploads/sess-10/a.mp4",  # prefix lookalike
        f"gs://{_BUCKET}/user-uploads/sess-1/../other/a.mp4",  # traversal
        "gs://foreign-bucket/user-uploads/sess-1/a.mp4",
        "https://generativelanguage.googleapis.com/v1beta/files/abc",  # old File API URI
        f"gs://{_BUCKET}/portfolio/a.mp4",
    ],
)
def test_video_parts_rejects_uris_outside_the_session(uri):
    assert _video_parts([uri], session_id="sess-1", bucket=_BUCKET, vertex=True) == []


def test_video_parts_skipped_without_vertex():
    uri = f"gs://{_BUCKET}/user-uploads/sess-1/a.mp4"
    assert _video_parts([uri], session_id="sess-1", bucket=_BUCKET, vertex=False) == []
