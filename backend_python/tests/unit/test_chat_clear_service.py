"""Unit tests for the quote-aware chat clear service (`src/services/chat_clear.py`)."""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterator
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from google.api_core.exceptions import ServiceUnavailable
from src.core.exceptions import ChatMerged, PermissionDenied, RoomNotFoundError
from src.db.projects.constants import ARCHIVED_AT, HISTORY_REVISION, MERGED_INTO
from src.repositories import conversation_repository, room_repository, spec_store
from src.repositories.conversation_repository import ConversationRepository
from src.schemas.chat_clear import ClearChatResponse
from src.schemas.room import RoomBrief
from src.services import chat_clear, room_brief
from src.services.audit import AuditAction, AuditResourceType
from src.services.chat_clear import clear_chat, quote_covers_scope
from tests.unit.firestore_fakes import FakeDb

UID = "owner-uid-1"
OTHER_UID = "other-uid-2"
SID = "secret-session-123"
T0 = datetime(2026, 11, 20, 10, 0, tzinfo=UTC)
T1 = T0 + timedelta(minutes=10)
T2 = T0 + timedelta(minutes=20)


@pytest.fixture()
def db(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeDb]:
    fake = FakeDb()
    monkeypatch.setattr(chat_clear, "get_async_firestore_client", lambda: fake)
    monkeypatch.setattr(conversation_repository, "get_async_firestore_client", lambda: fake)
    monkeypatch.setattr(room_repository, "get_async_firestore_client", lambda: fake)
    monkeypatch.setattr(spec_store, "get_async_firestore_client", lambda: fake)
    yield fake


@pytest.fixture(autouse=True)
def recalc(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """The draft recomputed after a clear (confirmation_service, tested there)."""
    mock = AsyncMock(return_value=True)
    monkeypatch.setattr(chat_clear, "recalculate_after_clear", mock)
    return mock


@pytest.fixture(autouse=True)
async def _clean_room_brief_state():
    room_brief._watermark.clear()
    room_brief._running.clear()
    room_brief._dirty.clear()
    room_brief._saves.clear()
    yield
    pending = list(room_brief._running.values())
    room_brief._watermark.clear()
    room_brief._running.clear()
    room_brief._dirty.clear()
    room_brief._saves.clear()
    for task in pending:
        if not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


def _seed_room(
    db: FakeDb,
    project_id: str,
    room_id: str,
    *,
    label: str,
    room_type: str,
    floor_mq: float = 9.0,
) -> dict[str, Any]:
    doc = {
        "room_id": room_id,
        "label": label,
        "room_type": room_type,
        "created_at": T0,
        "updated_at": T0,
        "brief": RoomBrief(floor_mq=floor_mq, decisions=[f"decision-{room_id}"]).model_dump(),
        "summary": f"{label} summary",
        "reference_photo_id": f"file-{room_id}",
        "intervention_spec": {"room_type": room_type},
        "photo_estimate": {"source_hash": "a" * 64},
    }
    db.put("projects", project_id, "rooms", room_id, doc)
    return doc


def _seed_message(
    db: FakeDb,
    session_id: str,
    msg_id: str,
    *,
    minute: int,
    role: str = "user",
    content: str = "hello",
    room_id: str | None = None,
) -> None:
    doc: dict[str, Any] = {
        "role": role,
        "content": content,
        "timestamp": T0 + timedelta(minutes=minute),
    }
    if room_id is not None:
        doc["metadata"] = {"room_id": room_id}
    db.put("sessions", session_id, "messages", msg_id, doc)


# ── quote_covers_scope matrix (Review Focus #5) ──────────────────────────────


@pytest.mark.parametrize(
    ("quote_data", "room_id", "expected"),
    [
        # No quote or soft-deleted quote -> always hard_delete.
        (None, None, False),
        (None, "bagno", False),
        ({}, None, False),
        ({}, "bagno", False),
        ({"status": "deleted"}, None, False),
        ({"status": "deleted", "rooms": [{"room_id": "bagno"}]}, "bagno", False),
        ({"status": "deleted", "items": [{"room_id": "bagno"}]}, None, False),
        # Active quotes with full-chat scope (room_id=None) -> soft_archive.
        ({"status": "draft"}, None, True),
        ({"status": "pending_review"}, None, True),
        ({"status": "in_review"}, None, True),
        ({"status": "approved"}, None, True),
        ({"status": "sent"}, None, True),
        ({"status": "rejected"}, None, True),
        # Multi-room quote referencing only `bagno` via rooms.
        ({"status": "draft", "rooms": [{"room_id": "bagno"}]}, "bagno", True),
        ({"status": "draft", "rooms": [{"room_id": "bagno"}]}, "cucina", False),
        # References `bagno` only in `items`.
        ({"status": "pending_review", "rooms": [], "items": [{"room_id": "bagno"}]}, "bagno", True),
        ({"status": "pending_review", "rooms": [], "items": [{"room_id": "bagno"}]}, "cucina", False),
        # References `bagno` only in `request.manual_work`.
        (
            {
                "status": "sent",
                "rooms": [],
                "items": [],
                "request": {"manual_work": [{"room_id": "bagno", "work": "Nicchia", "origin": "client_request"}]},
            },
            "bagno",
            True,
        ),
        (
            {
                "status": "sent",
                "rooms": [],
                "items": [],
                "request": {"manual_work": [{"room_id": "bagno", "work": "Nicchia", "origin": "client_request"}]},
            },
            "cucina",
            False,
        ),
        # References `bagno` only in `request.ai_warnings`.
        (
            {
                "status": "draft",
                "rooms": [],
                "items": [],
                "request": {"ai_warnings": [{"room_id": "bagno", "kind": "check", "message": "Verifica scarico"}]},
            },
            "bagno",
            True,
        ),
        (
            {
                "status": "draft",
                "rooms": [],
                "items": [],
                "request": {"ai_warnings": [{"room_id": "bagno", "kind": "check", "message": "Verifica scarico"}]},
            },
            "cucina",
            False,
        ),
        # Legacy room-less quote -> conservatively soft-archive any room clear.
        ({"status": "draft", "rooms": [], "items": [{"room_id": None}]}, "bagno", True),
        ({"status": "sent", "rooms": [], "items": []}, "bagno", True),
    ],
)
def test_quote_covers_scope_matrix(quote_data: dict[str, Any] | None, room_id: str | None, expected: bool) -> None:
    assert quote_covers_scope(quote_data, room_id) is expected


# ── clear_chat orchestration ─────────────────────────────────────────────────


async def test_clear_chat_hard_deletes_when_no_quote_and_preserves_media(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    db.put("sessions", SID, {"userId": UID, "messageCount": 3})
    _seed_room(db, SID, "bagno", label="Bagno", room_type="bagno", floor_mq=8.5)
    cucina_before = _seed_room(db, SID, "cucina", label="Cucina", room_type="cucina", floor_mq=14.0)
    _seed_message(db, SID, "b1", minute=1, room_id="bagno", content="bagno msg 1")
    _seed_message(db, SID, "b2", minute=2, room_id="bagno", role="assistant", content="bagno msg 2")
    _seed_message(db, SID, "c1", minute=3, room_id="cucina", content="cucina msg 1")
    img_file = {"type": "image", "roomId": "bagno", "url": "https://storage/img.jpg"}
    render_file = {"type": "render", "roomId": "bagno", "url": "https://storage/render.png"}
    db.put("projects", SID, "files", "f-img", img_file)
    db.put("projects", SID, "files", "f-rnd", render_file)

    # Seed in-memory room_brief state for both rooms + verify ordering before Firestore writes.
    room_brief._watermark[(SID, "bagno")] = "b2"
    room_brief._watermark[(SID, "cucina")] = "c1"
    events: list[str] = []
    real_invalidate_brief = room_brief.invalidate_room_brief_state
    real_clear_messages = ConversationRepository.clear_messages

    def tracked_invalidate_brief(session_id: str, room_id: str | None = None) -> None:
        events.append("invalidate_room_brief_state")
        real_invalidate_brief(session_id, room_id)

    async def tracked_clear_messages(self: ConversationRepository, session_id: str, **kwargs: Any) -> int:
        events.append("clear_messages")
        return await real_clear_messages(self, session_id, **kwargs)

    adk_mock = AsyncMock()
    audited: list[tuple[tuple[Any, ...], dict[str, Any]]] = []
    monkeypatch.setattr(chat_clear, "invalidate_room_brief_state", tracked_invalidate_brief)
    monkeypatch.setattr(ConversationRepository, "clear_messages", tracked_clear_messages)
    monkeypatch.setattr(chat_clear, "invalidate_adk_session", adk_mock)
    monkeypatch.setattr(chat_clear, "emit_audit_event", lambda *a, **kw: audited.append((a, kw)))
    monkeypatch.setattr(chat_clear, "utc_now", lambda: T1)
    monkeypatch.setattr(room_repository, "utc_now", lambda: T1)

    with caplog.at_level(logging.INFO):
        resp = await clear_chat(SID, UID, room_id="bagno")

    assert resp == ClearChatResponse(mode="hard_delete", room_id="bagno", affected_count=2, rooms_reset=1)
    assert events == ["invalidate_room_brief_state", "clear_messages"]

    # Targeted messages removed; other room untouched.
    assert db.get_data("sessions", SID, "messages", "b1") is None
    assert db.get_data("sessions", SID, "messages", "b2") is None
    assert db.get_data("sessions", SID, "messages", "c1") is not None

    # Session metadata updated cleanly.
    session_after = db.get_data("sessions", SID)
    assert session_after is not None
    assert session_after["messageCount"] == 1
    assert session_after[HISTORY_REVISION] == 1

    # Targeted room brief reset; spec, photo_estimate, metadata, other room, and files preserved.
    bagno_after = db.get_data("projects", SID, "rooms", "bagno")
    assert bagno_after is not None
    assert bagno_after["brief"] == RoomBrief().model_dump()
    assert bagno_after["summary"] is None
    assert bagno_after["updated_at"] == T1
    assert bagno_after["intervention_spec"] == {"room_type": "bagno"}
    assert bagno_after["photo_estimate"] == {"source_hash": "a" * 64}
    assert bagno_after["reference_photo_id"] == "file-bagno"
    assert db.get_data("projects", SID, "rooms", "cucina") == cucina_before
    assert db.get_data("projects", SID, "files", "f-img") == img_file
    assert db.get_data("projects", SID, "files", "f-rnd") == render_file

    # Invalidations and audit.
    assert (SID, "bagno") not in room_brief._watermark
    assert room_brief._watermark[(SID, "cucina")] == "c1"
    adk_mock.assert_awaited_once_with(UID, SID)
    assert len(audited) == 1
    audit_args, audit_kwargs = audited[0]
    assert audit_args[0] is AuditAction.CHAT_CLEAR
    assert audit_args[1] is AuditResourceType.PROJECT
    assert audit_kwargs["resource_id"] == SID
    assert audit_kwargs["user_id"] == UID
    assert audit_kwargs["metadata"] == {
        "mode": "hard_delete",
        "room_id": "bagno",
        "affected_count": 2,
        "rooms_reset": 1,
    }
    assert SID not in caplog.text


async def test_clear_chat_soft_archives_when_quote_covers_scope_and_preserves_quote(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    db.put("sessions", SID, {"userId": UID, "messageCount": 3})
    _seed_room(db, SID, "bagno", label="Bagno", room_type="bagno")
    _seed_room(db, SID, "cucina", label="Cucina", room_type="cucina")
    _seed_message(db, SID, "b1", minute=1, room_id="bagno", content="bagno 1")
    _seed_message(db, SID, "b2", minute=2, room_id="bagno", role="assistant", content="bagno 2")
    _seed_message(db, SID, "c1", minute=3, room_id="cucina", content="cucina 1")
    db.put("projects", SID, "files", "f1", {"type": "image", "roomId": "bagno"})
    quote_doc = {
        "status": "draft",
        "quote_number": "PRV-2026-0007",
        "rooms": [{"room_id": "bagno", "room_label": "Bagno", "room_type": "bagno"}],
        "items": [{"sku": "BAG-01", "room_id": "bagno"}],
    }
    db.put("projects", SID, "private_data", "quote", quote_doc)

    adk_mock = AsyncMock()
    monkeypatch.setattr(chat_clear, "invalidate_adk_session", adk_mock)
    monkeypatch.setattr(chat_clear, "emit_audit_event", lambda *a, **kw: None)
    monkeypatch.setattr(chat_clear, "utc_now", lambda: T1)
    monkeypatch.setattr(room_repository, "utc_now", lambda: T1)

    resp = await clear_chat(SID, UID, room_id="bagno")
    assert resp == ClearChatResponse(mode="soft_archive", room_id="bagno", affected_count=2, rooms_reset=1)

    for msg_id in ("b1", "b2"):
        msg = db.get_data("sessions", SID, "messages", msg_id)
        assert msg is not None
        assert msg["archived"] is True
        assert msg[ARCHIVED_AT] == T1

    assert db.get_data("sessions", SID, "messages", "c1") is not None
    assert "archived" not in (db.get_data("sessions", SID, "messages", "c1") or {})
    assert db.get_data("projects", SID, "private_data", "quote") == quote_doc
    assert db.get_data("projects", SID, "files", "f1") == {"type": "image", "roomId": "bagno"}

    # Admin dossier still sees soft-archived rows; user get_context skips them.
    repo = ConversationRepository()
    admin_rows = await repo.list_for_admin(SID, limit=10)
    assert [r["id"] for r in admin_rows] == ["b1", "b2", "c1"]
    assert [m["id"] for m in await repo.get_context(SID, limit=10)] == ["c1"]

    # Re-clearing an already-archived scope is idempotent and preserves original archived_at.
    monkeypatch.setattr(chat_clear, "utc_now", lambda: T2)
    second = await clear_chat(SID, UID, room_id="bagno")
    assert second == ClearChatResponse(mode="soft_archive", room_id="bagno", affected_count=0, rooms_reset=1)
    assert db.get_data("sessions", SID, "messages", "b1")[ARCHIVED_AT] == T1  # type: ignore[index]

    # Clearing an unquoted room on the same multi-room quote still hard-deletes!
    cucina_resp = await clear_chat(SID, UID, room_id="cucina")
    assert cucina_resp == ClearChatResponse(mode="hard_delete", room_id="cucina", affected_count=1, rooms_reset=1)
    assert db.get_data("sessions", SID, "messages", "c1") is None
    assert db.get_data("projects", SID, "private_data", "quote") == quote_doc


async def test_clear_chat_full_scope_resets_all_rooms(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    db.put("sessions", SID, {"userId": UID, "messageCount": 3})
    _seed_room(db, SID, "bagno", label="Bagno", room_type="bagno")
    _seed_room(db, SID, "cucina", label="Cucina", room_type="cucina")
    _seed_message(db, SID, "m1", minute=1, room_id="bagno", content="bagno")
    _seed_message(db, SID, "m2", minute=2, room_id="cucina", content="cucina")
    _seed_message(db, SID, "m3", minute=3, content="project-wide")
    db.put("projects", SID, "private_data", "quote", {"status": "deleted"})
    db.put("projects", SID, "files", "f1", {"type": "render", "url": "https://storage/r.png"})

    adk_mock = AsyncMock()
    audited: list[dict[str, Any]] = []
    monkeypatch.setattr(chat_clear, "invalidate_adk_session", adk_mock)
    monkeypatch.setattr(chat_clear, "emit_audit_event", lambda *a, **kw: audited.append(kw))
    monkeypatch.setattr(chat_clear, "utc_now", lambda: T1)
    monkeypatch.setattr(room_repository, "utc_now", lambda: T1)

    resp = await clear_chat(SID, UID, room_id=None)

    assert resp == ClearChatResponse(mode="hard_delete", room_id=None, affected_count=3, rooms_reset=2)
    assert db.get_data("sessions", SID, "messages", "m1") is None
    assert db.get_data("sessions", SID, "messages", "m2") is None
    assert db.get_data("sessions", SID, "messages", "m3") is None
    for rid in ("bagno", "cucina"):
        room = db.get_data("projects", SID, "rooms", rid)
        assert room is not None
        assert room["brief"] == RoomBrief().model_dump()
        assert room["summary"] is None
        assert room["intervention_spec"] == {"room_type": rid}
    assert db.get_data("projects", SID, "files", "f1") is not None
    assert db.get_data("projects", SID, "private_data", "quote") == {"status": "deleted"}
    adk_mock.assert_awaited_once_with(UID, SID)
    assert audited[0]["metadata"] == {
        "mode": "hard_delete",
        "room_id": None,
        "affected_count": 3,
        "rooms_reset": 2,
    }


async def test_clear_chat_rejects_non_owner_merged_chat_and_unknown_room(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    adk_mock = AsyncMock()
    monkeypatch.setattr(chat_clear, "invalidate_adk_session", adk_mock)

    db.put("sessions", SID, {"userId": UID})
    _seed_message(db, SID, "m1", minute=1, room_id="bagno", content="keep me")

    # Foreign user -> 403 PermissionDenied.
    with pytest.raises(PermissionDenied):
        await clear_chat(SID, OTHER_UID, room_id=None)
    assert db.get_data("sessions", SID, "messages", "m1") is not None

    # Legacy guest_* placeholder -> 403 PermissionDenied.
    db.put("sessions", "legacy-guest", {"userId": "guest_12345678"})
    with pytest.raises(PermissionDenied):
        await clear_chat("legacy-guest", UID, room_id=None)

    # Merged chat -> 409 ChatMerged for owner, 403 for non-owner.
    db.put("sessions", SID, {"userId": UID, MERGED_INTO: "target-chat"})
    with pytest.raises(PermissionDenied):
        await clear_chat(SID, OTHER_UID, room_id=None)
    with pytest.raises(ChatMerged):
        await clear_chat(SID, UID, room_id=None)

    # Unknown room on active owned session -> 404 RoomNotFoundError.
    db.put("sessions", SID, {"userId": UID})
    with pytest.raises(RoomNotFoundError):
        await clear_chat(SID, UID, room_id="missing_room")

    # Missing session with room_id -> 404 RoomNotFoundError.
    with pytest.raises(RoomNotFoundError):
        await clear_chat("no-such-session", UID, room_id="bagno")

    adk_mock.assert_not_called()


async def test_clear_chat_nonexistent_session_full_scope_is_idempotent(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    adk_mock = AsyncMock()
    brief_mock = patch.object(chat_clear, "invalidate_room_brief_state")
    monkeypatch.setattr(chat_clear, "invalidate_adk_session", adk_mock)

    with brief_mock as spy_brief:
        resp = await clear_chat("fresh-guest-session", UID, room_id=None)

    assert resp == ClearChatResponse(mode="hard_delete", room_id=None, affected_count=0, rooms_reset=0)
    assert db.get_data("sessions", "fresh-guest-session") is None
    spy_brief.assert_called_once_with("fresh-guest-session", None)
    adk_mock.assert_awaited_once_with(UID, "fresh-guest-session")



# ── Archived rooms (PR 3 of the card fixes, D7/D8) ────────────────────────────

async def test_a_room_clear_archives_the_room_and_recomputes_the_draft(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch, recalc: AsyncMock
) -> None:
    db.put("sessions", SID, {"userId": UID, "messageCount": 1})
    _seed_room(db, SID, "bagno", label="Bagno", room_type="bagno")
    _seed_message(db, SID, "b1", minute=1, room_id="bagno", content="bagno 1")
    monkeypatch.setattr(chat_clear, "invalidate_adk_session", AsyncMock())
    monkeypatch.setattr(chat_clear, "emit_audit_event", lambda *a, **kw: None)
    monkeypatch.setattr(room_repository, "utc_now", lambda: T1)

    await clear_chat(SID, UID, room_id="bagno")

    assert db.get_data("projects", SID, "rooms", "bagno")["cleared_at"] == T1  # type: ignore[index]
    recalc.assert_awaited_once_with(SID, UID)
    # A room clear leaves the project's own specs (the whole chat) alone.
    assert db.get_data("projects", SID, "private_data", "intervention_specs") is None


async def test_a_full_clear_archives_the_project_specs_too(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch, recalc: AsyncMock
) -> None:
    db.put("sessions", SID, {"userId": UID, "messageCount": 1})
    db.put("projects", SID, "private_data", "intervention_specs", {"chat": {"measures": []}})
    _seed_message(db, SID, "m1", minute=1, content="bagno da rifare")
    monkeypatch.setattr(chat_clear, "invalidate_adk_session", AsyncMock())
    monkeypatch.setattr(chat_clear, "emit_audit_event", lambda *a, **kw: None)
    monkeypatch.setattr(chat_clear, "utc_now", lambda: T1)

    await clear_chat(SID, UID, room_id=None)

    stored = db.get_data("projects", SID, "private_data", "intervention_specs")
    assert stored is not None and stored["chat"] == {"measures": []}  # kept for the team
    assert set(stored["archived"]) == {"chat", "generale"}
    recalc.assert_awaited_once_with(SID, UID)


async def test_a_failed_recomputation_does_not_fail_the_clear(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch, recalc: AsyncMock, caplog: pytest.LogCaptureFixture
) -> None:
    db.put("sessions", SID, {"userId": UID, "messageCount": 1})
    _seed_room(db, SID, "bagno", label="Bagno", room_type="bagno")
    monkeypatch.setattr(chat_clear, "invalidate_adk_session", AsyncMock())
    monkeypatch.setattr(chat_clear, "emit_audit_event", lambda *a, **kw: None)
    recalc.side_effect = ServiceUnavailable("firestore down")

    with caplog.at_level(logging.WARNING):
        resp = await clear_chat(SID, UID, room_id="bagno")

    assert resp.rooms_reset == 1
    assert "draft" in caplog.text.lower() and SID not in caplog.text
