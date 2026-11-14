"""Unit tests for Task 2: backend PDF document upload endpoint and ADK PDF handling."""

from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, UploadFile
from google.genai import types
from httpx import ASGITransport, AsyncClient
from main import app
from src.adk import adk_orchestrator
from src.adk.adk_orchestrator import ADKOrchestrator, _attachment_labels, _RestoreContext
from src.adk.media_model_plugin import _is_customer_media
from src.auth.jwt_handler import verify_token
from src.core import media_policy
from src.models.media import DocumentMediaAsset
from src.repositories.conversation_repository import ConversationRepository
from src.schemas.internal import UserSession
from src.schemas.room import RoomSchema
from src.tools import quota, room_tools
from src.utils.datetime_utils import utc_now
from starlette.datastructures import Headers

_VALID_PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"


def _own_session_repo(*, owner_uid: str = "owner-uid") -> ConversationRepository:
    doc = MagicMock(exists=True)
    doc.to_dict.return_value = {"userId": owner_uid}
    db = MagicMock()
    db.collection.return_value.document.return_value.get = AsyncMock(return_value=doc)
    repo = ConversationRepository()
    repo._get_async_db = MagicMock(return_value=db)  # type: ignore[method-assign]
    repo.save_file_metadata = AsyncMock()  # type: ignore[method-assign]
    return repo


def _room_repo_with(room_id: str | None = "r_cucina") -> MagicMock:
    repo = MagicMock()
    repo.get_room = AsyncMock(return_value=MagicMock(room_id=room_id) if room_id else None)
    repo.require_room = AsyncMock(return_value=None)
    repo.list_rooms = AsyncMock(return_value=[])
    repo.list_files = AsyncMock(return_value=[])
    repo.find_file_by_storage_path = AsyncMock(return_value=None)
    return repo


@pytest.fixture()
def _auth(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("src.middleware.app_check.ENABLE_APP_CHECK", False)
    app.dependency_overrides[verify_token] = lambda: UserSession(uid="owner-uid", is_authenticated=True)
    yield
    app.dependency_overrides.clear()


# ── Magic-bytes validator unit tests ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_validate_document_magic_bytes_accepts_pdf():
    from src.utils.security import validate_document_magic_bytes

    upload = UploadFile(
        file=BytesIO(_VALID_PDF),
        filename="planimetria.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )
    mime = await validate_document_magic_bytes(upload)
    assert mime == "application/pdf"
    assert await upload.read() == _VALID_PDF


@pytest.mark.asyncio
async def test_validate_document_magic_bytes_rejects_spoofed_bytes():
    from src.utils.security import validate_document_magic_bytes

    upload = UploadFile(
        file=BytesIO(b"MZ\x90\x00not-a-pdf"),
        filename="malware.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )
    with pytest.raises(HTTPException) as exc:
        await validate_document_magic_bytes(upload)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_validate_document_magic_bytes_rejects_mime_mismatch():
    from src.utils.security import validate_document_magic_bytes

    upload = UploadFile(
        file=BytesIO(_VALID_PDF),
        filename="notes.txt",
        headers=Headers({"content-type": "text/plain"}),
    )
    with pytest.raises(HTTPException) as exc:
        await validate_document_magic_bytes(upload)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_validate_document_magic_bytes_rejects_short_payload():
    from src.utils.security import validate_document_magic_bytes

    upload = UploadFile(
        file=BytesIO(b"%PDF"),
        filename="tiny.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )
    with pytest.raises(HTTPException) as exc:
        await validate_document_magic_bytes(upload)
    assert exc.value.status_code == 400


# ── HTTP endpoint POST /api/upload/document ──────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_upload_document_valid_pdf_returns_200_and_saves_metadata():
    repo = _own_session_repo()
    signed = "https://storage.googleapis.com/test-bucket/user-uploads/sess-1/doc.pdf"
    with patch("src.api.routes.upload.get_conversation_repository", return_value=repo), \
         patch("src.api.routes.upload.get_room_repository", return_value=_room_repo_with("r_cucina")), \
         patch("src.api.routes.upload.enforce_quota", new=AsyncMock()), \
         patch("src.api.routes.upload.increment_quota", new=AsyncMock()) as inc_quota, \
         patch("src.api.routes.upload._firebase_upload", return_value=(signed, signed)) as fb_upload:
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/upload/document",
                data={"session_id": "sess-1", "room_id": "r_cucina"},
                files={"file": ("planimetria finale.pdf", _VALID_PDF, "application/pdf")},
            )

    assert resp.status_code == 200
    asset = DocumentMediaAsset.model_validate(resp.json())
    assert asset.asset_type == "document"
    assert asset.mime_type == "application/pdf"
    assert asset.size_bytes == len(_VALID_PDF)
    assert asset.url == signed
    assert asset.signed_url == signed
    assert asset.room_id == "r_cucina"
    assert asset.file_path == f"user-uploads/sess-1/{asset.id}.pdf"

    fb_upload.assert_called_once()
    file_path_arg, content_arg, content_type_arg, _ = fb_upload.call_args.args
    assert file_path_arg == asset.file_path
    assert content_arg == _VALID_PDF
    assert content_type_arg == "application/pdf"

    repo.save_file_metadata.assert_awaited_once()
    saved_session_id, file_data = repo.save_file_metadata.await_args.args
    save_kwargs = repo.save_file_metadata.await_args.kwargs
    assert saved_session_id == "sess-1"
    assert file_data["type"] == "document"
    assert file_data["mimeType"] == "application/pdf"
    assert file_data["metadata"]["storage_path"] == asset.file_path
    assert save_kwargs["room_id"] == "r_cucina"
    assert save_kwargs["file_id"] == asset.id

    inc_quota.assert_awaited_once_with("owner-uid", "upload_document")


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_upload_document_rejects_spoofed_magic_bytes():
    repo = _own_session_repo()
    with patch("src.api.routes.upload.get_conversation_repository", return_value=repo), \
         patch("src.api.routes.upload.enforce_quota", new=AsyncMock()), \
         patch("src.api.routes.upload._firebase_upload") as fb_upload:
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/upload/document",
                data={"session_id": "sess-1"},
                files={"file": ("evil.pdf", b"MZ\x90\x00payload", "application/pdf")},
            )

    assert resp.status_code == 400
    fb_upload.assert_not_called()
    repo.save_file_metadata.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_upload_document_rejects_mime_mismatch():
    repo = _own_session_repo()
    with patch("src.api.routes.upload.get_conversation_repository", return_value=repo), \
         patch("src.api.routes.upload.enforce_quota", new=AsyncMock()):
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/upload/document",
                data={"session_id": "sess-1"},
                files={"file": ("plan.txt", _VALID_PDF, "text/plain")},
            )

    assert resp.status_code == 400


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_upload_document_rejects_oversized_pdf():
    max_doc_size = media_policy.MAX_DOCUMENT_SIZE
    assert max_doc_size == 25 * 1024 * 1024
    repo = _own_session_repo()
    with patch("src.api.routes.upload.get_conversation_repository", return_value=repo), \
         patch("src.api.routes.upload.enforce_quota", new=AsyncMock()):
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Early Content-Length guard (> 2x max_file_size)
            resp_header = await client.post(
                "/api/upload/document",
                data={"session_id": "sess-1"},
                files={"file": ("huge.pdf", _VALID_PDF, "application/pdf")},
                headers={"content-length": str(max_doc_size * 2 + 1)},
            )
            assert resp_header.status_code == 413

            # 2. Chunked stream reader limit (> MAX_DOCUMENT_SIZE actual payload)
            with patch("src.api.routes.upload.MAX_DOCUMENT_SIZE", 16):
                resp_body = await client.post(
                    "/api/upload/document",
                    data={"session_id": "sess-1"},
                    files={"file": ("over.pdf", _VALID_PDF, "application/pdf")},
                )
            assert resp_body.status_code == 413


@pytest.mark.asyncio
@pytest.mark.usefixtures("_auth")
async def test_upload_document_rejects_foreign_session_ownership():
    repo = _own_session_repo(owner_uid="another-user")
    with patch("src.api.routes.upload.get_conversation_repository", return_value=repo):
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/upload/document",
                data={"session_id": "sess-1"},
                files={"file": ("plan.pdf", _VALID_PDF, "application/pdf")},
            )

    assert resp.status_code == 403


# ── Labels, Quota & Multimodal ADK wiring ────────────────────────────────────


def test_media_label_and_quota_label_for_document():
    assert room_tools.media_label("document", "doc123", "Cucina") == "[Documento doc123 · Cucina]"
    assert room_tools.media_label("document", "doc123", None) == "[Documento doc123 · senza stanza]"
    assert quota._TOOL_LABELS["upload_document"] == "caricamenti documenti"


def test_media_model_plugin_treats_pdf_as_vision_media():
    pdf_part = types.Part(inline_data=types.Blob(mime_type="application/pdf", data=_VALID_PDF))
    assert _is_customer_media(pdf_part) is True


def test_attachment_labels_includes_documents():
    now = utc_now()
    kitchen = RoomSchema(room_id="r_cucina", label="Cucina", room_type="cucina", created_at=now, updated_at=now)
    ctx = _RestoreContext(
        session_id="sess-1",
        rooms=[kitchen],
        active_room_id=None,
        files_by_path={
            "user-uploads/sess-1/doc1.pdf": {"id": "doc1", "type": "document", "roomId": "r_cucina"}
        },
    )
    labels = _attachment_labels({"attachments": {"documents": ["user-uploads/sess-1/doc1.pdf"]}}, ctx)
    assert labels == ["[Documento doc1 · Cucina]"]


def test_extract_chat_attachments_splits_documents_and_keeps_backward_compat():
    from main import _extract_chat_attachments

    req_img_only = MagicMock(
        media_urls=["https://example.com/a.jpg"],
        media_types=["image/jpeg"],
        media_metadata={},
        video_file_uris=[],
    )
    assert _extract_chat_attachments(req_img_only) == {
        "images": ["https://example.com/a.jpg"],
        "videos": [],
    }

    req_mixed = MagicMock(
        media_urls=["https://example.com/a.jpg", "https://example.com/plan.pdf?X-Goog-Signature=sig"],
        media_types=["image/jpeg", "application/pdf"],
        media_metadata={},
        video_file_uris=["gs://bucket/clip.mp4"],
    )
    assert _extract_chat_attachments(req_mixed) == {
        "images": ["https://example.com/a.jpg"],
        "videos": ["gs://bucket/clip.mp4"],
        "documents": ["https://example.com/plan.pdf?X-Goog-Signature=sig"],
    }


@pytest.mark.asyncio
async def test_adk_orchestrator_attaches_pdf_blob_and_document_label():
    now = utc_now()
    kitchen = RoomSchema(room_id="r_cucina", label="Cucina", room_type="cucina", created_at=now, updated_at=now)
    room_repo = _room_repo_with("r_cucina")
    room_repo.list_rooms = AsyncMock(return_value=[kitchen])
    room_repo.find_file_by_storage_path = AsyncMock(return_value=None)

    orch = ADKOrchestrator.__new__(ADKOrchestrator)
    orch.runner = MagicMock()

    async def _empty_events():
        if False:
            yield None

    orch.runner.run_async = MagicMock(return_value=_empty_events())
    conv_repo = AsyncMock()
    conv_repo.save_message = AsyncMock(return_value=True)
    session_svc = AsyncMock()
    session_svc.get_session = AsyncMock(return_value=MagicMock())

    req = MagicMock(
        session_id="sess-1",
        messages=[MagicMock(content="analizza planimetria")],
        media_urls=["https://storage.googleapis.com/b/user-uploads/sess-1/doc1.pdf?X-Goog-Signature=sec"],
        video_file_uris=[],
        media_types=[],
        room_id="r_cucina",
    )
    user = MagicMock(uid="owner-uid", is_guest=False)

    with patch.object(adk_orchestrator, "read_quote_status", new=AsyncMock(return_value=None)), \
         patch.object(adk_orchestrator, "get_room_repository", return_value=room_repo), \
         patch.object(adk_orchestrator, "get_conversation_repository", return_value=conv_repo), \
         patch.object(adk_orchestrator, "get_session_service", return_value=session_svc), \
         patch.object(adk_orchestrator, "get_async_firestore_client"), \
         patch.object(adk_orchestrator, "download_session_media", new=AsyncMock(return_value=(_VALID_PDF, "application/pdf"))), \
         patch.object(adk_orchestrator, "session_media_path", return_value="user-uploads/sess-1/doc1.pdf"):
        _ = [chunk async for chunk in orch._stream_events(req, user, assistant_msg_id="a1")]

    parts = orch.runner.run_async.call_args.kwargs["new_message"].parts
    label_idx = next(i for i, p in enumerate(parts) if p.text and "[Documento · senza stanza]" in p.text)
    pdf_part = parts[label_idx + 1]
    assert pdf_part.inline_data is not None
    assert pdf_part.inline_data.mime_type == "application/pdf"
    assert pdf_part.inline_data.data == _VALID_PDF
