"""Phase 138 PR-1: REST routes of the rooms, room_id on uploads and chat turns,
render → photo link by file id, all with the owner checks of the project routes."""
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from main import app
from src.auth.jwt_handler import verify_token
from src.core.config import settings
from src.db.projects import media
from src.repositories import room_repository
from src.repositories.conversation_repository import ConversationRepository
from src.repositories.room_repository import RoomRepository
from src.schemas.internal import UserSession
from src.services.orchestrator_factory import get_orchestrator
from src.services.quote_dossier import _render_sources
from src.tools import generate_render
from src.tools.quota import QuotaDecision
from src.utils.datetime_utils import utc_now
from tests.unit.firestore_fakes import FakeDb

PID = "proj1"
T0 = datetime(2026, 10, 1, tzinfo=UTC)
_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
_MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 256


@pytest.fixture()
def db(monkeypatch: pytest.MonkeyPatch) -> FakeDb:
    monkeypatch.setattr("src.middleware.app_check.ENABLE_APP_CHECK", False)
    app.dependency_overrides[verify_token] = lambda: UserSession(uid="owner", is_authenticated=True)
    fake = FakeDb()
    fake.put("projects", PID, {"userId": "owner"})
    fake.put("projects", "foreign", {"userId": "someone-else"})
    with patch("src.api.routes.projects_router.get_async_firestore_client", return_value=fake), \
         patch.object(room_repository, "get_async_firestore_client", return_value=fake):
        yield fake
    app.dependency_overrides.clear()


async def _call(method: str, url: str, **kwargs):
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.request(method, url, **kwargs)


# ── Rooms REST ───────────────────────────────────────────────────────────────

async def test_first_listing_creates_the_default_room(db):
    db.put("projects", PID, "files", "f1", {"type": "image", "uploadedAt": T0})
    resp = await _call("GET", f"/api/projects/{PID}/rooms")

    assert resp.status_code == 200
    assert [(r["room_id"], r["label"]) for r in resp.json()] == [("generale", "Generale")]
    assert resp.json()[0]["created_at"].endswith("Z")
    assert db.get_data("projects", PID, "files", "f1")["roomId"] == "generale"


async def test_create_rename_and_list(db):
    created = await _call("POST", f"/api/projects/{PID}/rooms", json={"label": "Bagno", "room_type": "bagno"})
    assert created.status_code == 201
    room_id = created.json()["room_id"]

    renamed = await _call("PATCH", f"/api/projects/{PID}/rooms/{room_id}", json={"label": "Bagno ospiti"})
    assert renamed.status_code == 200 and renamed.json()["label"] == "Bagno ospiti"

    listed = await _call("GET", f"/api/projects/{PID}/rooms")
    assert [r["label"] for r in listed.json()] == ["Bagno ospiti"]  # no default room once one exists


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "/rooms", None),
        ("POST", "/rooms", {"label": "Bagno", "room_type": "bagno"}),
        ("PATCH", "/rooms/generale", {"label": "X"}),
        ("PATCH", "/files/f1", {"room_id": "generale"}),
    ],
)
async def test_foreign_project_is_forbidden(db, method, path, body):
    db.put("projects", "foreign", "rooms", "generale", {"room_id": "generale"})
    resp = await _call(method, f"/api/projects/foreign{path}", json=body)
    assert resp.status_code == 403
    assert db.get_data("projects", "foreign", "rooms", "generale") == {"room_id": "generale"}


async def test_invalid_bodies_and_unknown_rooms(db):
    bad_type = await _call("POST", f"/api/projects/{PID}/rooms", json={"label": "Box", "room_type": "garage"})
    assert bad_type.status_code == 422
    unknown = await _call("PATCH", f"/api/projects/{PID}/rooms/nope", json={"label": "X"})
    assert unknown.status_code == 404 and unknown.json()["error_code"] == "ROOM_NOT_FOUND"
    missing_project = await _call("GET", "/api/projects/missing/rooms")
    assert missing_project.status_code == 404


async def test_move_a_file_to_a_room(db):
    room_id = (await _call("POST", f"/api/projects/{PID}/rooms", json={"label": "Cucina", "room_type": "cucina"})).json()["room_id"]
    db.put("projects", PID, "files", "f1", {"type": "image", "roomId": "generale"})

    resp = await _call("PATCH", f"/api/projects/{PID}/files/f1", json={"room_id": room_id})
    assert resp.status_code == 200
    assert db.get_data("projects", PID, "files", "f1")["roomId"] == room_id

    missing = await _call("PATCH", f"/api/projects/{PID}/files/nope", json={"room_id": room_id})
    assert missing.status_code == 404 and missing.json()["error_code"] == "FILE_NOT_FOUND"


async def test_dashboard_file_cannot_point_at_another_projects_object(db):
    body = {"file_id": "f1", "url": "https://x", "name": "a.jpg", "type": "image", "size": 1,
            "storage_path": "user-uploads/victim/a.jpg"}
    resp = await _call("POST", f"/api/projects/{PID}/files", json=body)
    assert resp.status_code == 422


# ── Uploads ──────────────────────────────────────────────────────────────────

def _own_repo() -> ConversationRepository:
    doc = MagicMock(exists=True)
    doc.to_dict.return_value = {"userId": "owner"}
    fs = MagicMock()
    fs.collection.return_value.document.return_value.get = AsyncMock(return_value=doc)
    repo = ConversationRepository()
    repo._get_async_db = MagicMock(return_value=fs)  # type: ignore[method-assign]
    repo.save_file_metadata = AsyncMock(return_value="id")  # type: ignore[method-assign]
    return repo


async def _upload(kind: str, data: dict, repo: ConversationRepository):
    file = ("a.png", _PNG, "image/png") if kind == "image" else ("clip.mp4", _MP4, "video/mp4")
    with patch("src.api.routes.upload.get_conversation_repository", return_value=repo), \
         patch("src.api.routes.upload.enforce_quota", new=AsyncMock(return_value=QuotaDecision(True, 5, utc_now()))), \
         patch("src.api.routes.upload.increment_quota", new=AsyncMock()), \
         patch("src.api.routes.upload._firebase_upload", return_value=("https://signed", "https://signed")), \
         patch("src.api.routes.upload._firebase_upload_stream", return_value=("gs://b/p.mp4", "https://signed")):
        return await _call("POST", f"/api/upload/{kind}", data={"session_id": PID, **data}, files={"file": file})


@pytest.mark.parametrize("kind", ["image", "video"])
async def test_upload_files_the_media_in_its_room(db, kind):
    db.put("projects", PID, "rooms", "bagno", {"room_id": "bagno", "label": "Bagno", "room_type": "bagno",
                                               "created_at": T0, "updated_at": T0})
    repo = _own_repo()
    resp = await _upload(kind, {"room_id": "bagno"}, repo)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["room_id"] == "bagno"
    saved = repo.save_file_metadata.await_args
    assert saved.kwargs == {"file_id": body["id"], "room_id": "bagno"}
    assert saved.args[1]["type"] == kind
    assert saved.args[1]["metadata"]["storage_path"] == f"user-uploads/{PID}/{body['id']}.{'png' if kind == 'image' else 'mp4'}"


@pytest.mark.parametrize("kind", ["image", "video"])
async def test_upload_to_an_unknown_room_is_refused_before_storage(db, kind):
    repo = _own_repo()
    resp = await _upload(kind, {"room_id": "nope"}, repo)
    assert resp.status_code == 404
    repo.save_file_metadata.assert_not_awaited()


async def test_upload_without_room_is_unassigned(db):
    repo = _own_repo()
    resp = await _upload("video", {}, repo)
    assert resp.status_code == 200
    assert resp.json()["room_id"] is None
    assert repo.save_file_metadata.await_args.kwargs["room_id"] is None


# ── Chat turns ───────────────────────────────────────────────────────────────

async def _empty_stream(*_args, **_kwargs):
    if False:  # pragma: no cover - an async generator that yields nothing
        yield ""


@pytest.mark.parametrize(("room_exists", "expected"), [(True, "bagno"), (False, None)])
async def test_chat_turn_is_tagged_only_with_a_room_of_the_project(db, room_exists, expected):
    if room_exists:
        db.put("projects", PID, "rooms", "bagno", {"room_id": "bagno", "label": "Bagno", "room_type": "bagno",
                                                   "created_at": T0, "updated_at": T0})
    orchestrator = MagicMock()
    orchestrator.stream_chat = MagicMock(side_effect=_empty_stream)
    app.dependency_overrides[get_orchestrator] = lambda: orchestrator
    repo = MagicMock(ensure_session=AsyncMock(), save_message=AsyncMock())
    db.put("users", "owner", {"chat_id": PID})  # the user's chat (Phase 139)

    body = {"sessionId": PID, "roomId": "bagno", "messages": [{"id": "m1", "role": "user", "content": "ciao"}]}
    with patch("main.get_room_repository", return_value=RoomRepository()), \
         patch("main.get_async_firestore_client", return_value=db), \
         patch("src.repositories.conversation_repository.get_conversation_repository", return_value=repo):
        resp = await _call("POST", "/chat/stream", json=body)

    assert resp.status_code == 200
    assert repo.save_message.await_args.kwargs["room_id"] == expected
    assert orchestrator.stream_chat.call_args.args[0].room_id == expected


# ── Render → source photo ────────────────────────────────────────────────────

async def test_render_links_its_photo_by_file_id_and_inherits_the_room(monkeypatch):
    monkeypatch.setattr(settings, "FIREBASE_STORAGE_BUCKET", "bkt")
    photo = f"https://storage.googleapis.com/bkt/user-uploads/{PID}/a1.jpg?X-Goog-Signature=s"
    rooms = MagicMock(find_file_by_storage_path=AsyncMock(return_value={"id": "a1", "roomId": "bagno"}))
    files = MagicMock(save_file_metadata=AsyncMock(return_value="r1"))
    with patch.object(generate_render, "download_image_smart", new=AsyncMock(return_value=(b"x", "image/jpeg"))), \
         patch.object(generate_render, "analyze_image_triage", new=AsyncMock(return_value={})), \
         patch("src.vision.architect.generate_architectural_prompt", new=AsyncMock(side_effect=RuntimeError)), \
         patch.object(generate_render, "generate_image_i2i",
                      new=AsyncMock(return_value={"success": True, "mime_type": "png", "image_base64": "eA=="})), \
         patch.object(generate_render, "_upload_base64_image_sync",
                      return_value=f"https://storage.googleapis.com/bkt/renders/{PID}/r.png"), \
         patch.object(generate_render, "get_room_repository", return_value=rooms), \
         patch.object(generate_render, "get_conversation_repository", return_value=files):
        result = await generate_render.generate_render_wrapper(
            prompt="moderno", room_type="bagno", style="moderno", session_id=PID,
            mode="modification", source_image_url=photo,
        )

    assert result["status"] == "success"
    rooms.find_file_by_storage_path.assert_awaited_once_with(PID, f"user-uploads/{PID}/a1.jpg")
    args, kwargs = files.save_file_metadata.await_args
    assert args[1]["metadata"]["source_file_id"] == "a1"
    assert args[1]["metadata"]["source_image_id"] is None  # no expiring URL when the file id is known
    assert kwargs == {"room_id": "bagno"}


async def test_dossier_and_cover_follow_source_file_id_and_legacy_urls():
    db = FakeDb()
    db.put("projects", PID, "files", "photo", {"type": "image", "url": "https://signed-photo", "uploadedAt": T0,
                                               "metadata": {"storage_path": f"user-uploads/{PID}/photo.jpg"}})
    db.put("projects", PID, "files", "render", {
        "type": "render", "url": "https://signed-render", "uploadedAt": T0.replace(day=2),
        "metadata": {"storage_path": f"renders/{PID}/r.png", "source_file_id": "photo"},
    })
    db.put("projects", PID, "files", "old-render", {
        "type": "render", "url": "https://x", "uploadedAt": T0,
        "metadata": {"storage_path": f"renders/{PID}/old.png",
                     "source_image_id": f"https://storage.googleapis.com/bkt/user-uploads/{PID}/legacy.jpg?sig=1"},
    })
    assert await _render_sources(db, PID) == {
        f"renders/{PID}/r.png": f"user-uploads/{PID}/photo.jpg",
        f"renders/{PID}/old.png": f"user-uploads/{PID}/legacy.jpg",
    }

    db.put("sessions", PID, {"userId": "owner"})
    with patch.object(media, "get_async_firestore_client", return_value=db):
        assert await media.sync_project_cover(PID)
    assert db.get_data("projects", PID)["originalImageUrl"] == "https://signed-photo"
    assert db.get_data("sessions", PID)["thumbnailUrl"] == "https://signed-render"


@pytest.mark.parametrize(
    ("body", "kept"),
    [
        ({"storage_path": f"projects/{PID}/uploads/a.jpg"}, f"projects/{PID}/uploads/a.jpg"),
        ({"url": f"https://storage.googleapis.com/bkt/projects/{PID}/uploads/a.jpg"}, f"projects/{PID}/uploads/a.jpg"),
        # Security review: a path only derived from the client's URL is filtered too.
        ({"url": "https://storage.googleapis.com/bkt/user-uploads/victim/a.jpg"}, None),
        ({"url": f"https://storage.googleapis.com/bkt/projects/{PID}/uploads/../../victim/a.jpg"}, None),
    ],
)
async def test_dashboard_file_keeps_only_its_own_upload_path(db, body, kept):
    db.put("sessions", PID, {"userId": "owner"})
    payload = {"file_id": "f1", "url": "https://x", "name": "a.jpg", "type": "image", "size": 1, **body}
    with patch("src.db.projects.mutations.get_async_firestore_client", return_value=db):
        resp = await _call("POST", f"/api/projects/{PID}/files", json=payload)
    assert resp.status_code == 200
    assert db.get_data("projects", PID, "files", "f1")["metadata"].get("storage_path") == kept
