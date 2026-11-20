"""Unit tests for archived-message filtering, ConversationRepository.clear_messages,
chat_history archived pagination, and ADK session invalidation / revision-aware resync.
"""
from __future__ import annotations

import copy
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.adk.errors.session_not_found_error import SessionNotFoundError
from google.adk.sessions import InMemorySessionService
from src.adk import adk_orchestrator
from src.adk.adk_orchestrator import _APP_NAME, SyncMarker
from src.api.routes import chat_history
from src.auth.jwt_handler import verify_token
from src.db.projects.constants import ARCHIVED_AT, HISTORY_REVISION
from src.repositories import conversation_repository
from src.repositories.conversation_repository import ConversationRepository
from src.schemas.internal import UserSession
from tests.unit.firestore_fakes import FakeDb

T0 = datetime(2026, 11, 20, 9, 0, tzinfo=UTC)
T_ARCHIVE_1 = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)
T_ARCHIVE_2 = datetime(2026, 11, 20, 13, 0, tzinfo=UTC)


def _ts(minutes: int) -> datetime:
    return T0 + timedelta(minutes=minutes)


def _seed_msg(
    db: FakeDb,
    session_id: str,
    msg_id: str,
    *,
    minute: int,
    role: str = "user",
    content: str = "msg",
    room_id: str | None = None,
    archived: bool | None = None,
    archived_at: datetime | None = None,
) -> None:
    payload: dict[str, Any] = {
        "role": role,
        "content": content,
        "timestamp": _ts(minute),
    }
    if room_id is not None:
        payload["metadata"] = {"room_id": room_id}
    if archived is not None:
        payload["archived"] = archived
    if archived_at is not None:
        payload[ARCHIVED_AT] = archived_at
    db.put("sessions", session_id, "messages", msg_id, payload)


# ── Sync Firestore double for chat_history.py & get_history_sync ─────────────


class _SyncSnap:
    def __init__(self, doc_id: str, data: dict[str, Any] | None) -> None:
        self.id = doc_id
        self._data = copy.deepcopy(data)
        self.exists = data is not None

    def to_dict(self) -> dict[str, Any] | None:
        return copy.deepcopy(self._data)


class _SyncQuery:
    def __init__(
        self,
        db: FakeDb,
        path: tuple[str, ...],
        *,
        order_field: str | None = None,
        desc: bool = False,
        start_after_id: str | None = None,
        limit_n: int | None = None,
    ) -> None:
        self._db = db
        self._path = path
        self._order_field = order_field
        self._desc = desc
        self._start_after_id = start_after_id
        self._limit_n = limit_n

    def document(self, doc_id: str) -> _SyncDocRef:
        return _SyncDocRef(self._db, (*self._path, doc_id))

    def order_by(self, field: str, direction: Any = "ASCENDING") -> _SyncQuery:
        return _SyncQuery(
            self._db,
            self._path,
            order_field=field,
            desc="DESC" in str(direction).upper(),
            start_after_id=self._start_after_id,
            limit_n=self._limit_n,
        )

    def start_after(self, cursor_snap: _SyncSnap) -> _SyncQuery:
        return _SyncQuery(
            self._db,
            self._path,
            order_field=self._order_field,
            desc=self._desc,
            start_after_id=cursor_snap.id,
            limit_n=self._limit_n,
        )

    def limit(self, n: int) -> _SyncQuery:
        return _SyncQuery(
            self._db,
            self._path,
            order_field=self._order_field,
            desc=self._desc,
            start_after_id=self._start_after_id,
            limit_n=n,
        )

    def stream(self) -> list[_SyncSnap]:
        depth = len(self._path) + 1
        paths = [
            p for p in sorted(self._db.docs) if len(p) == depth and p[: len(self._path)] == self._path
        ]
        if self._order_field:
            field = self._order_field
            paths = [p for p in paths if self._db.docs[p].get(field) is not None]
            paths.sort(key=lambda p: self._db.docs[p][field], reverse=self._desc)
        if self._start_after_id is not None:
            ids = [p[-1] for p in paths]
            if self._start_after_id in ids:
                paths = paths[ids.index(self._start_after_id) + 1 :]
        if self._limit_n is not None:
            paths = paths[: self._limit_n]
        return [_SyncSnap(p[-1], self._db.docs[p]) for p in paths]


class _SyncDocRef:
    def __init__(self, db: FakeDb, path: tuple[str, ...]) -> None:
        self._db = db
        self._path = path

    def collection(self, name: str) -> _SyncQuery:
        return _SyncQuery(self._db, (*self._path, name))

    def get(self) -> _SyncSnap:
        return _SyncSnap(self._path[-1], self._db.docs.get(self._path))


class _SyncFakeDb:
    def __init__(self, async_db: FakeDb) -> None:
        self._db = async_db

    def collection(self, name: str) -> _SyncQuery:
        return _SyncQuery(self._db, (name,))


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch) -> FakeDb:
    db = FakeDb()
    sync_db = _SyncFakeDb(db)
    monkeypatch.setattr(conversation_repository, "get_async_firestore_client", lambda: db)
    monkeypatch.setattr(conversation_repository, "get_firestore_client", lambda: sync_db)
    return db


@pytest.fixture(autouse=True)
def _clean_sync_markers():
    yield
    for key in list(adk_orchestrator._synced_marker):
        if key[0].startswith("clear-test-"):
            adk_orchestrator._synced_marker.pop(key, None)


# ── ConversationRepository archived filtering ────────────────────────────────


async def test_get_context_skips_archived_and_keeps_legacy_unflagged_messages(fake_db: FakeDb) -> None:
    # Seed 5 active messages (mix of legacy without `archived` and explicit `archived=False`)
    # plus 15 newer/interleaved archived messages so limit=5 would starve without over-scanning.
    _seed_msg(fake_db, "s1", "active-1", minute=1, content="legacy 1")  # no `archived` field
    _seed_msg(fake_db, "s1", "active-2", minute=2, content="explicit false", archived=False)
    for i in range(5):
        _seed_msg(fake_db, "s1", f"arch-mid-{i}", minute=3 + i, content=f"archived mid {i}", archived=True)
    _seed_msg(fake_db, "s1", "active-3", minute=10, content="legacy 2")
    _seed_msg(fake_db, "s1", "active-4", minute=11, content="explicit false 2", archived=False)
    _seed_msg(fake_db, "s1", "active-5", minute=12, content="legacy 3")
    for i in range(10):
        _seed_msg(fake_db, "s1", f"arch-top-{i}", minute=20 + i, content=f"archived top {i}", archived=True)

    repo = ConversationRepository()
    result = await repo.get_context("s1", limit=5)

    assert [m["id"] for m in result] == ["active-1", "active-2", "active-3", "active-4", "active-5"]
    assert [m["content"] for m in result] == [
        "legacy 1",
        "explicit false",
        "legacy 2",
        "explicit false 2",
        "legacy 3",
    ]


async def test_get_context_room_filter_skips_archived_in_room(fake_db: FakeDb) -> None:
    _seed_msg(fake_db, "s1", "b1", minute=1, room_id="bagno", content="bagno 1")
    _seed_msg(fake_db, "s1", "b2", minute=2, room_id="bagno", content="bagno old", archived=True)
    _seed_msg(fake_db, "s1", "c1", minute=3, room_id="cucina", content="cucina 1")
    _seed_msg(fake_db, "s1", "b3", minute=4, room_id="bagno", content="bagno 2", archived=False)

    repo = ConversationRepository()
    bagno = await repo.get_context("s1", limit=5, room_id="bagno")

    assert [m["id"] for m in bagno] == ["b1", "b3"]


async def test_latest_assistant_message_id_skips_archived(fake_db: FakeDb) -> None:
    _seed_msg(fake_db, "s1", "u1", minute=1, role="user", content="ciao")
    _seed_msg(fake_db, "s1", "a1", minute=2, role="assistant", content="old active")
    _seed_msg(fake_db, "s1", "a2", minute=3, role="assistant", content="newer archived", archived=True)

    repo = ConversationRepository()
    assert await repo.latest_assistant_message_id("s1") == "a1"

    # When all assistant messages are archived, returns None.
    fake_db.apply_update(("sessions", "s1", "messages", "a1"), {"archived": True})
    assert await repo.latest_assistant_message_id("s1") is None


async def test_get_history_sync_skips_archived_messages(fake_db: FakeDb) -> None:
    _seed_msg(fake_db, "s1", "m1", minute=1, content="first")
    _seed_msg(fake_db, "s1", "m2", minute=2, content="archived", archived=True)
    _seed_msg(fake_db, "s1", "m3", minute=3, content="second", archived=False)

    repo = ConversationRepository()
    result = repo.get_history_sync("s1", limit=10)

    assert result == [
        {"role": "user", "content": "first"},
        {"role": "user", "content": "second"},
    ]


async def test_list_for_admin_preserves_archived_messages(fake_db: FakeDb) -> None:
    _seed_msg(fake_db, "s1", "m1", minute=1, content="archived turn", archived=True, archived_at=T_ARCHIVE_1)
    _seed_msg(fake_db, "s1", "m2", minute=2, role="assistant", content="active reply")

    repo = ConversationRepository()
    rows = await repo.list_for_admin("s1", limit=10)

    assert [r["id"] for r in rows] == ["m1", "m2"]
    assert rows[0]["archived"] is True
    assert rows[0][ARCHIVED_AT] == T_ARCHIVE_1


# ── ConversationRepository.clear_messages ────────────────────────────────────


async def test_clear_messages_soft_archive_sets_flags_bumps_revision_and_is_idempotent(fake_db: FakeDb) -> None:
    fake_db.put("sessions", "s1", {"userId": "u1", "messageCount": 4})
    _seed_msg(fake_db, "s1", "b1", minute=1, room_id="bagno", content="bagno 1")
    _seed_msg(fake_db, "s1", "b2", minute=2, room_id="bagno", role="assistant", content="bagno 2")
    _seed_msg(fake_db, "s1", "c1", minute=3, room_id="cucina", content="cucina 1")
    _seed_msg(fake_db, "s1", "u0", minute=4, content="untagged")

    repo = ConversationRepository()
    affected_first = await repo.clear_messages(
        "s1",
        room_id="bagno",
        soft_archive=True,
        archived_at=T_ARCHIVE_1,
    )

    assert affected_first == 2
    for msg_id in ("b1", "b2"):
        doc = fake_db.get_data("sessions", "s1", "messages", msg_id)
        assert doc is not None
        assert doc["archived"] is True
        assert doc[ARCHIVED_AT] == T_ARCHIVE_1

    # Other rooms and untagged docs remain untouched.
    c1 = fake_db.get_data("sessions", "s1", "messages", "c1")
    u0 = fake_db.get_data("sessions", "s1", "messages", "u0")
    assert c1 is not None and "archived" not in c1
    assert u0 is not None and "archived" not in u0

    session = fake_db.get_data("sessions", "s1")
    assert session is not None
    assert session[HISTORY_REVISION] == 1
    assert session["messageCount"] == 4

    # Running soft-archive a second time is idempotent and preserves original archived_at.
    affected_second = await repo.clear_messages(
        "s1",
        room_id="bagno",
        soft_archive=True,
        archived_at=T_ARCHIVE_2,
    )
    assert affected_second == 0
    assert fake_db.get_data("sessions", "s1", "messages", "b1")[ARCHIVED_AT] == T_ARCHIVE_1
    assert fake_db.get_data("sessions", "s1", "messages", "b2")[ARCHIVED_AT] == T_ARCHIVE_1


async def test_clear_messages_hard_delete_removes_docs_clamps_message_count_and_bumps_revision(
    fake_db: FakeDb,
) -> None:
    # Seed messageCount smaller than deleted docs (1 < 2) to verify clamp >= 0.
    fake_db.put("sessions", "s1", {"userId": "u1", "messageCount": 1, HISTORY_REVISION: 2})
    _seed_msg(fake_db, "s1", "b1", minute=1, room_id="bagno", content="bagno 1")
    _seed_msg(fake_db, "s1", "b2", minute=2, room_id="bagno", role="assistant", content="bagno 2")
    _seed_msg(fake_db, "s1", "c1", minute=3, room_id="cucina", content="cucina 1")
    _seed_msg(fake_db, "s1", "u0", minute=4, content="untagged")

    # Files & quote must remain untouched.
    fake_db.put("projects", "s1", "files", "f1", {"url": "https://x/f1.jpg", "roomId": "bagno"})
    fake_db.put("projects", "s1", "private_data", "quote", {"status": "deleted", "version": 1})

    repo = ConversationRepository()
    affected_room = await repo.clear_messages(
        "s1",
        room_id="bagno",
        soft_archive=False,
        archived_at=T_ARCHIVE_1,
    )

    assert affected_room == 2
    assert fake_db.get_data("sessions", "s1", "messages", "b1") is None
    assert fake_db.get_data("sessions", "s1", "messages", "b2") is None
    assert fake_db.get_data("sessions", "s1", "messages", "c1") is not None
    assert fake_db.get_data("sessions", "s1", "messages", "u0") is not None

    session_after_room = fake_db.get_data("sessions", "s1")
    assert session_after_room is not None
    assert session_after_room["messageCount"] == 0
    assert session_after_room[HISTORY_REVISION] == 3

    # Full-chat hard delete (room_id=None) removes remaining active messages.
    affected_all = await repo.clear_messages(
        "s1",
        room_id=None,
        soft_archive=False,
        archived_at=T_ARCHIVE_2,
    )
    assert affected_all == 2
    assert fake_db.get_data("sessions", "s1", "messages", "c1") is None
    assert fake_db.get_data("sessions", "s1", "messages", "u0") is None
    session_after_all = fake_db.get_data("sessions", "s1")
    assert session_after_all is not None
    assert session_after_all["messageCount"] == 0
    assert session_after_all[HISTORY_REVISION] == 4

    # Data preservation boundary.
    assert fake_db.get_data("projects", "s1", "files", "f1") == {"url": "https://x/f1.jpg", "roomId": "bagno"}
    assert fake_db.get_data("projects", "s1", "private_data", "quote") == {"status": "deleted", "version": 1}


# ── GET /api/sessions/{session_id}/messages ──────────────────────────────────


def _history_client(uid: str) -> TestClient:
    app = FastAPI()
    app.include_router(chat_history.router)

    async def override_verify_token() -> UserSession:
        return UserSession(uid=uid, is_authenticated=True)

    app.dependency_overrides[verify_token] = override_verify_token
    return TestClient(app)


def test_chat_history_route_hides_archived_messages(fake_db: FakeDb, monkeypatch: pytest.MonkeyPatch) -> None:
    fake_db.put("sessions", "s1", {"userId": "user-1"})
    _seed_msg(fake_db, "s1", "m1", minute=1, content="active 1")
    _seed_msg(fake_db, "s1", "m2", minute=2, content="archived 2", archived=True)
    _seed_msg(fake_db, "s1", "m3", minute=3, content="active 3", archived=False)
    _seed_msg(fake_db, "s1", "m4", minute=4, content="archived 4", archived=True)
    _seed_msg(fake_db, "s1", "m5", minute=5, content="active 5")

    monkeypatch.setattr(chat_history, "get_firestore_client", lambda: _SyncFakeDb(fake_db))
    client = _history_client("user-1")

    page1 = client.get("/api/sessions/s1/messages?limit=2")
    assert page1.status_code == 200
    body1 = page1.json()
    assert [m["id"] for m in body1["messages"]] == ["m3", "m5"]
    assert body1["has_more"] is True
    assert body1["next_cursor"] == "m3"

    page2 = client.get(f"/api/sessions/s1/messages?limit=2&cursor={body1['next_cursor']}")
    assert page2.status_code == 200
    body2 = page2.json()
    assert [m["id"] for m in body2["messages"]] == ["m1"]
    assert body2["has_more"] is False
    assert body2["next_cursor"] is None


def test_chat_history_route_returns_empty_when_all_messages_archived(
    fake_db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_db.put("sessions", "s1", {"userId": "user-1"})
    _seed_msg(fake_db, "s1", "m1", minute=1, content="archived 1", archived=True)
    _seed_msg(fake_db, "s1", "m2", minute=2, content="archived 2", archived=True)

    monkeypatch.setattr(chat_history, "get_firestore_client", lambda: _SyncFakeDb(fake_db))
    resp = _history_client("user-1").get("/api/sessions/s1/messages?limit=10")

    assert resp.status_code == 200
    assert resp.json() == {"messages": [], "has_more": False, "next_cursor": None}


async def test_clear_messages_missing_session_does_not_create_session_doc(fake_db: FakeDb) -> None:
    repo = ConversationRepository()
    affected = await repo.clear_messages("missing-session", room_id=None, soft_archive=False, archived_at=T_ARCHIVE_1)

    assert affected == 0
    assert fake_db.get_data("sessions", "missing-session") is None


# ── ADK session invalidation & revision-aware resync ─────────────────────────


async def test_invalidate_adk_session_deletes_memory_session_and_sync_marker() -> None:
    service = InMemorySessionService()
    uid = "clear-test-user-1"
    sid = "clear-test-session-1"
    await service.create_session(app_name=_APP_NAME, user_id=uid, session_id=sid, state={"active_room": "bagno"})
    adk_orchestrator._synced_marker[(uid, sid)] = SyncMarker(reply_id="a1", history_revision=0)

    with patch.object(adk_orchestrator, "get_session_service", return_value=service):
        await adk_orchestrator.invalidate_adk_session(uid, sid)
        assert await service.get_session(app_name=_APP_NAME, user_id=uid, session_id=sid) is None
        assert (uid, sid) not in adk_orchestrator._synced_marker

        # Second call is an idempotent no-op.
        await adk_orchestrator.invalidate_adk_session(uid, sid)
        assert (uid, sid) not in adk_orchestrator._synced_marker

    # Also tolerates services that raise SessionNotFoundError on delete_session.
    not_found_service = MagicMock()
    not_found_service.delete_session = AsyncMock(side_effect=SessionNotFoundError())
    adk_orchestrator._synced_marker[(uid, sid)] = SyncMarker(reply_id="a2", history_revision=1)
    with patch.object(adk_orchestrator, "get_session_service", return_value=not_found_service):
        await adk_orchestrator.invalidate_adk_session(uid, sid)
    assert (uid, sid) not in adk_orchestrator._synced_marker

    # Unexpected errors propagate rather than being swallowed silently.
    failing_service = MagicMock()
    failing_service.delete_session = AsyncMock(side_effect=RuntimeError("unexpected failure"))
    with patch.object(adk_orchestrator, "get_session_service", return_value=failing_service):
        with pytest.raises(RuntimeError, match="unexpected failure"):
            await adk_orchestrator.invalidate_adk_session(uid, sid)


async def test_stale_resync_drops_carried_state_on_history_revision_change() -> None:
    state = {"active_room": "bagno", "unreadable_videos": ["gs://b/v.mp4"]}

    # Revision changed (chat clear or merge on another container) -> drop stale carried state.
    assert (
        adk_orchestrator._carried_state_for_resync(
            state,
            SyncMarker(reply_id="a1", history_revision=0),
            SyncMarker(reply_id="a1", history_revision=1),
        )
        is None
    )

    # Same revision, newer reply on another container -> carry state over.
    carried = adk_orchestrator._carried_state_for_resync(
        state,
        SyncMarker(reply_id="a1", history_revision=2),
        SyncMarker(reply_id="a9", history_revision=2),
    )
    assert carried == state
    assert carried is not state

    # End-to-end verification in ADKOrchestrator._stream_events: create_session receives state=None.
    from tests.unit.test_adk_orchestrator import (
        _async_iter,
        _collect_chunks,
        _make_request_and_user,
        _make_text_event,
        _setup_mocks,
    )

    adk_orchestrator._synced_marker[("test-user-abc", "test-session-123")] = SyncMarker("a1", 0)
    try:
        with (
            patch("src.adk.adk_orchestrator.get_session_service") as get_session,
            patch("src.adk.adk_orchestrator.get_conversation_repository") as get_repo,
            patch("src.core.config.settings") as settings,
        ):
            _setup_mocks(get_session, get_repo, settings)
            repo = get_repo.return_value
            repo.latest_assistant_message_id = AsyncMock(return_value="a1")
            repo.history_revision = AsyncMock(return_value=1)
            repo.get_context = AsyncMock(return_value=[])
            session_service = get_session.return_value
            orch = adk_orchestrator.ADKOrchestrator.__new__(adk_orchestrator.ADKOrchestrator)
            orch.runner = MagicMock()
            orch.runner.run_async = MagicMock(return_value=_async_iter([_make_text_event("ok")]))
            req, user = _make_request_and_user()
            await _collect_chunks(orch.stream_chat(req, user))

        assert session_service.create_session.await_args.kwargs["state"] is None
    finally:
        adk_orchestrator._synced_marker.pop(("test-user-abc", "test-session-123"), None)
