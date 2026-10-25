"""
Tests for ConversationRepository — Firestore-backed conversation storage.

Patches are applied at the IMPORT SITE (conversation_repository module),
not at the definition site, to correctly intercept already-bound names.
"""
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel
from src.core.exceptions import PermissionDenied
from src.db.session_retention import EXPIRE_AT

_MODULE = "src.repositories.conversation_repository"


class AsyncIter:
    """Helper for mocking async iterators."""
    def __init__(self, items):
        self.items = items

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self.items:
            raise StopAsyncIteration
        return self.items.pop(0)


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_fs():
    """Mocked firebase_admin.firestore module."""
    m = MagicMock()
    m.SERVER_TIMESTAMP = "SERVER_TIMESTAMP"
    m.Increment = lambda x: f"Increment({x})"
    m.Query.DESCENDING = "DESCENDING"
    return m


@pytest.fixture
def mock_db():
    return MagicMock()


@pytest.fixture
def mock_sync():
    return AsyncMock()


@pytest.fixture
def repo(mock_db, mock_fs, mock_sync):
    """ConversationRepository with all Firestore deps patched."""
    with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
         patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
         patch(f"{_MODULE}.async_firestore", mock_fs), \
         patch(f"{_MODULE}.sync_project_cover", mock_sync):
        from src.repositories.conversation_repository import ConversationRepository
        return ConversationRepository()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _doc(data: dict, exists: bool = True):
    d = MagicMock()
    d.exists = exists
    d.to_dict.return_value = data
    return d


# ════════════════════════════════════════════════════════════════════════════
# save_message
# ════════════════════════════════════════════════════════════════════════════

class TestSaveMessage:

    def _setup_db(self, mock_db, session_exists: bool = True):
        """Wire mock_db for save_message call chain."""
        session_doc = _doc({}, exists=session_exists)

        sess_ref = MagicMock()
        sess_ref.get = AsyncMock(return_value=session_doc)
        sess_ref.set = AsyncMock()

        msgs_ref = MagicMock()
        msgs_ref.add = AsyncMock()
        sess_ref.collection.return_value = msgs_ref

        mock_db.collection.return_value.document.return_value = sess_ref
        return sess_ref, msgs_ref

    @pytest.mark.asyncio
    async def test_saves_basic_message(self, repo, mock_db, mock_fs):
        sess_ref, msgs_ref = self._setup_db(mock_db)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.save_message(session_id="s1", role="user", content="Hello", is_guest=False)

        msgs_ref.add.assert_called_once()
        data = msgs_ref.add.call_args[0][0]
        assert data["role"] == "user"
        assert data["content"] == "Hello"

    @pytest.mark.asyncio
    async def test_explicit_message_id_uses_document_set_not_add(self, repo, mock_db, mock_fs):
        # A stable id (assigned by the orchestrator / forwarded from the client)
        # must be used as the Firestore document id so the streamed message and
        # its persisted row share one identity — no post-turn id swap on the client.
        sess_ref, msgs_ref = self._setup_db(mock_db)
        doc_ref = MagicMock()
        doc_ref.set = AsyncMock()
        msgs_ref.document.return_value = doc_ref

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.save_message("s1", "assistant", "Hi", message_id="assist-123", is_guest=False)

        msgs_ref.document.assert_called_once_with("assist-123")
        doc_ref.set.assert_called_once()
        msgs_ref.add.assert_not_called()
        data = doc_ref.set.call_args[0][0]
        assert data["role"] == "assistant"
        assert data["content"] == "Hi"

    @pytest.mark.asyncio
    async def test_auto_id_used_when_message_id_absent(self, repo, mock_db, mock_fs):
        sess_ref, msgs_ref = self._setup_db(mock_db)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.save_message("s1", "user", "Hello", is_guest=False)

        msgs_ref.add.assert_called_once()
        msgs_ref.document.assert_not_called()

    @pytest.mark.asyncio
    async def test_timestamp_used_when_provided(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)
        ts = datetime(2024, 1, 1, tzinfo=UTC)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.save_message("s1", "assistant", "Hi", timestamp=ts, is_guest=False)

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert data["timestamp"] == ts

    @pytest.mark.asyncio
    async def test_server_timestamp_when_none(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.save_message("s1", "user", "msg", is_guest=False)

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert data["timestamp"] == "SERVER_TIMESTAMP"

    @pytest.mark.asyncio
    async def test_metadata_included_when_provided(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.save_message("s1", "user", "msg", metadata={"src": "web"}, is_guest=False)

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert data["metadata"] == {"src": "web"}

    @pytest.mark.asyncio
    async def test_metadata_omitted_when_none(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.save_message("s1", "user", "msg", is_guest=False)

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert "metadata" not in data

    @pytest.mark.asyncio
    async def test_plain_dict_tool_calls_stored(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)
        tcs = [{"name": "gen_render", "args": {}}]

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.save_message("s1", "assistant", "", tool_calls=tcs, is_guest=False)

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert data["tool_calls"] == tcs

    @pytest.mark.asyncio
    async def test_pydantic_tool_calls_are_dumped(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)

        # A real Pydantic model — the repo dumps it via isinstance(x, BaseModel).
        class _ToolCall(BaseModel):
            name: str

        pydantic_tc = _ToolCall(name="tool")

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.save_message("s1", "assistant", "", tool_calls=[pydantic_tc], is_guest=False)

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert data["tool_calls"] == [{"name": "tool"}]

    @pytest.mark.asyncio
    async def test_tool_call_id_stored(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.save_message("s1", "tool", "result", tool_call_id="tc-1", is_guest=False)

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert data["tool_call_id"] == "tc-1"

    @pytest.mark.asyncio
    async def test_attachments_stored(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)
        atts = [{"url": "gs://b/f.jpg"}]

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.save_message("s1", "user", "see image", attachments=atts, is_guest=False)

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert data["attachments"] == atts

    @pytest.mark.asyncio
    async def test_creates_session_doc_when_missing(self, repo, mock_db, mock_fs):
        sess_ref, _ = self._setup_db(mock_db, session_exists=False)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.save_message("new-sess", "user", "hi", is_guest=False)

        sess_ref.set.assert_called_once()
        call_data = sess_ref.set.call_args[0][0]
        assert call_data.get("createdAt") == "SERVER_TIMESTAMP"

    @pytest.mark.asyncio
    async def test_swallows_exceptions(self, repo, mock_db, mock_fs):
        mock_db.collection.side_effect = Exception("Firestore down")

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            # Must not raise
            await repo.save_message("s1", "user", "msg", is_guest=False)


# ════════════════════════════════════════════════════════════════════════════
# get_context
# ════════════════════════════════════════════════════════════════════════════

class TestGetContext:

    def _setup_db(self, mock_db, stream_docs):
        msgs_ref = MagicMock()
        msgs_ref.order_by.return_value = msgs_ref
        msgs_ref.limit.return_value = msgs_ref
        msgs_ref.stream.return_value = AsyncIter(stream_docs)

        sess_ref = MagicMock()
        sess_ref.collection.return_value = msgs_ref
        mock_db.collection.return_value.document.return_value = sess_ref

    @pytest.mark.asyncio
    async def test_returns_chronological_order(self, repo, mock_db, mock_fs):
        doc1 = _doc({"role": "user", "content": "Hi"})
        doc2 = _doc({"role": "assistant", "content": "Hello"})
        # DB returns newest-first; code reverses
        self._setup_db(mock_db, [doc2, doc1])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            result = await repo.get_context("s1", limit=10)

        assert len(result) == 2
        assert result[0]["role"] == "user"
        assert result[1]["role"] == "assistant"

    @pytest.mark.asyncio
    async def test_includes_optional_fields(self, repo, mock_db, mock_fs):
        doc = _doc({
            "role": "assistant", "content": "",
            "tool_calls": [{"name": "t"}],
            "tool_call_id": "tc-1",
            "attachments": [{"url": "gs://x"}],
        })
        self._setup_db(mock_db, [doc])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            result = await repo.get_context("s1")

        assert result[0]["tool_calls"] == [{"name": "t"}]
        assert result[0]["tool_call_id"] == "tc-1"
        assert result[0]["attachments"] == [{"url": "gs://x"}]

    @pytest.mark.asyncio
    async def test_includes_the_room_of_a_tagged_message(self, repo, mock_db, mock_fs):
        """The quote splits one read of the chat into project-wide and per-room talk."""
        tagged = _doc({"role": "user", "content": "doccia", "metadata": {"room_id": "bagno1"}})
        untagged = _doc({"role": "user", "content": "casa", "metadata": {"user_id": "u1"}})
        self._setup_db(mock_db, [tagged, untagged])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            result = await repo.get_context("s1")

        assert [m.get("room_id") for m in result] == [None, "bagno1"]

    @pytest.mark.asyncio
    async def test_defaults_role_to_user(self, repo, mock_db, mock_fs):
        doc = _doc({"content": "msg"})  # no 'role'
        self._setup_db(mock_db, [doc])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            result = await repo.get_context("s1")

        assert result[0]["role"] == "user"

    @pytest.mark.asyncio
    async def test_returns_empty_list_on_exception(self, repo, mock_db, mock_fs):
        mock_db.collection.side_effect = Exception("DB error")

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            result = await repo.get_context("s1")

        assert result == []

    @pytest.mark.asyncio
    async def test_empty_session(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db, [])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            result = await repo.get_context("s1")

        assert result == []

    @pytest.mark.asyncio
    async def test_includes_document_id(self, repo, mock_db, mock_fs):
        doc = _doc({"role": "assistant", "content": "Ciao"})
        doc.id = "msg-1"
        self._setup_db(mock_db, [doc])

        with patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            result = await repo.get_context("s1")

        assert result[0]["id"] == "msg-1"


# ════════════════════════════════════════════════════════════════════════════
# latest_assistant_message_id
# ════════════════════════════════════════════════════════════════════════════

class TestLatestAssistantMessageId:

    def _setup_db(self, mock_db, stream_docs):
        msgs_ref = MagicMock()
        msgs_ref.order_by.return_value = msgs_ref
        msgs_ref.select.return_value = msgs_ref
        msgs_ref.limit.return_value = msgs_ref
        msgs_ref.stream.return_value = AsyncIter(stream_docs)
        mock_db.collection.return_value.document.return_value.collection.return_value = msgs_ref
        return msgs_ref

    @staticmethod
    def _message(role: str, msg_id: str):
        doc = _doc({"role": role, "content": "x"})
        doc.id = msg_id
        return doc

    @pytest.mark.asyncio
    async def test_returns_the_newest_assistant_message(self, repo, mock_db, mock_fs):
        # newest first, as the DESC query returns them
        msgs_ref = self._setup_db(mock_db, [
            self._message("tool", "t2"),
            self._message("assistant", "a2"),
            self._message("assistant", "a1"),
        ])

        with patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            result = await repo.latest_assistant_message_id("s1")

        assert result == "a2"
        msgs_ref.order_by.assert_called_once_with("timestamp", direction="DESCENDING")
        msgs_ref.select.assert_called_once_with(["role"])
        msgs_ref.limit.assert_called_once_with(20)

    @pytest.mark.asyncio
    async def test_none_without_assistant_messages(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db, [self._message("user", "u1")])

        with patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            result = await repo.latest_assistant_message_id("s1")

        assert result is None


# ════════════════════════════════════════════════════════════════════════════
# ensure_session
# ════════════════════════════════════════════════════════════════════════════

class TestEnsureSession:

    def _build_collections(self, mock_db, session_doc, project_doc):
        """Build distinct refs for sessions and projects collections."""
        sess_ref = MagicMock()
        sess_ref.get = AsyncMock(return_value=session_doc)
        sess_ref.set = AsyncMock()
        sess_ref.update = AsyncMock()

        proj_ref = MagicMock()
        proj_ref.get = AsyncMock(return_value=project_doc)
        proj_ref.set = AsyncMock()
        proj_ref.update = AsyncMock()

        def _coll(name):
            c = MagicMock()
            c.document.return_value = sess_ref if name == "sessions" else proj_ref
            return c

        mock_db.collection.side_effect = _coll
        return sess_ref, proj_ref

    @pytest.mark.asyncio
    async def test_creates_session_and_project_when_new(self, repo, mock_db, mock_fs):
        sess_ref, proj_ref = self._build_collections(
            mock_db, _doc({}, exists=False), _doc({}, exists=False)
        )

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.ensure_session("new-sess", user_id="user123", is_guest=False)

        sess_ref.set.assert_called_once()
        proj_ref.set.assert_called_once()
        proj_data = proj_ref.set.call_args[0][0]
        assert proj_data["userId"] == "user123"

    @pytest.mark.asyncio
    async def test_guest_id_when_no_user(self, repo, mock_db, mock_fs):
        sess_ref, _ = self._build_collections(
            mock_db, _doc({}, exists=False), _doc({}, exists=False)
        )

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.ensure_session("abcdefgh-rest", user_id=None, is_guest=True)

        sess_data = sess_ref.set.call_args[0][0]
        assert sess_data["userId"].startswith("guest_")

    @pytest.mark.asyncio
    async def test_claims_guest_session_for_real_user(self, repo, mock_db, mock_fs):
        sess_doc = _doc({"userId": "guest_abcdefgh"}, exists=True)
        proj_doc = _doc({}, exists=True)
        sess_ref, proj_ref = self._build_collections(mock_db, sess_doc, proj_doc)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.ensure_session("sess1", user_id="real-uid", is_guest=False)

        sess_ref.update.assert_called_once()
        update = sess_ref.update.call_args[0][0]
        assert update["userId"] == "real-uid"

    @pytest.mark.asyncio
    async def test_rejects_session_owned_by_another_user(self, repo, mock_db, mock_fs):
        sess_doc = _doc({"userId": "victim-uid"}, exists=True)
        sess_ref, proj_ref = self._build_collections(mock_db, sess_doc, _doc({}, exists=True))

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db),              patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db),              patch(f"{_MODULE}.async_firestore", mock_fs),              pytest.raises(PermissionDenied):
            await repo.ensure_session("sess1", user_id="attacker-uid", is_guest=False)

        sess_ref.update.assert_not_called()
        proj_ref.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_owner_keeps_access_to_own_session(self, repo, mock_db, mock_fs):
        sess_doc = _doc({"userId": "owner-uid"}, exists=True)
        sess_ref, _ = self._build_collections(mock_db, sess_doc, _doc({}, exists=True))

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db),              patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db),              patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.ensure_session("sess1", user_id="owner-uid", is_guest=False)

        # Nothing changes for the owner of a permanent session: no write at all.
        sess_ref.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_backfills_missing_project(self, repo, mock_db, mock_fs):
        sess_doc = _doc({"userId": "real-user", "title": "Proj"}, exists=True)
        proj_doc = _doc({}, exists=False)
        _, proj_ref = self._build_collections(mock_db, sess_doc, proj_doc)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.ensure_session("sess1", user_id="real-user", is_guest=False)

        proj_ref.set.assert_called_once()

    @pytest.mark.asyncio
    async def test_swallows_exceptions(self, repo, mock_db, mock_fs):
        mock_db.collection.side_effect = Exception("DB error")

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            await repo.ensure_session("s1", user_id="u1", is_guest=False)  # no raise


# ════════════════════════════════════════════════════════════════════════════
# Retention: only guest sessions carry expireAt (Firestore TTL)
# ════════════════════════════════════════════════════════════════════════════

class TestGuestOnlyExpiry:
    """A registered user's project must never be deleted by the 30-day TTL."""

    def _patches(self, mock_db, mock_fs, clear=None):
        return (
            patch(f"{_MODULE}.get_firestore_client", return_value=mock_db),
            patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db),
            patch(f"{_MODULE}.async_firestore", mock_fs),
            patch(f"{_MODULE}.clear_session_expiry", clear or AsyncMock(return_value=0)),
        )

    # ── save_message ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_guest_message_and_session_expire(self, repo, mock_db, mock_fs):
        sess_ref, msgs_ref = TestSaveMessage()._setup_db(mock_db)
        p1, p2, p3, p4 = self._patches(mock_db, mock_fs)
        with p1, p2, p3, p4:
            await repo.save_message("s1", "user", "hi", is_guest=True)

        assert isinstance(msgs_ref.add.call_args[0][0][EXPIRE_AT], datetime)
        assert isinstance(sess_ref.set.call_args[0][0][EXPIRE_AT], datetime)

    @pytest.mark.asyncio
    async def test_registered_message_and_session_never_expire(self, repo, mock_db, mock_fs):
        sess_ref, msgs_ref = TestSaveMessage()._setup_db(mock_db)
        clear = AsyncMock(return_value=0)
        p1, p2, p3, p4 = self._patches(mock_db, mock_fs, clear)
        with p1, p2, p3, p4:
            await repo.save_message("s1", "user", "hi", is_guest=False)

        assert EXPIRE_AT not in msgs_ref.add.call_args[0][0]
        assert EXPIRE_AT not in sess_ref.set.call_args[0][0]
        clear.assert_not_awaited()  # the session was not marked

    @pytest.mark.asyncio
    async def test_registered_write_makes_a_marked_session_permanent(self, repo, mock_db, mock_fs):
        sess_ref, _ = TestSaveMessage()._setup_db(mock_db)
        sess_ref.get = AsyncMock(return_value=_doc({"userId": "u1", EXPIRE_AT: "old"}))
        clear = AsyncMock(return_value=4)
        p1, p2, p3, p4 = self._patches(mock_db, mock_fs, clear)
        with p1, p2, p3, p4:
            await repo.save_message("s1", "assistant", "ok", is_guest=False)

        clear.assert_awaited_once_with(mock_db, "s1")
        assert EXPIRE_AT not in sess_ref.set.call_args[0][0]

    # ── ensure_session ──────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_new_registered_session_and_project_never_expire(self, repo, mock_db, mock_fs):
        sess_ref, proj_ref = TestEnsureSession()._build_collections(
            mock_db, _doc({}, exists=False), _doc({}, exists=False)
        )
        p1, p2, p3, p4 = self._patches(mock_db, mock_fs)
        with p1, p2, p3, p4:
            await repo.ensure_session("s1", user_id="u1", is_guest=False)

        assert EXPIRE_AT not in sess_ref.set.call_args[0][0]
        assert EXPIRE_AT not in proj_ref.set.call_args[0][0]

    @pytest.mark.asyncio
    async def test_new_guest_session_expires_but_projection_does_not(self, repo, mock_db, mock_fs):
        sess_ref, proj_ref = TestEnsureSession()._build_collections(
            mock_db, _doc({}, exists=False), _doc({}, exists=False)
        )
        p1, p2, p3, p4 = self._patches(mock_db, mock_fs)
        with p1, p2, p3, p4:
            await repo.ensure_session("s1", user_id="anon-uid", is_guest=True)

        assert isinstance(sess_ref.set.call_args[0][0][EXPIRE_AT], datetime)
        # No TTL policy on `projects`: the field there would be dead data.
        assert EXPIRE_AT not in proj_ref.set.call_args[0][0]

    @pytest.mark.asyncio
    async def test_guest_writer_refreshes_expiry(self, repo, mock_db, mock_fs):
        sess_ref, _ = TestEnsureSession()._build_collections(
            mock_db, _doc({"userId": "anon-uid", EXPIRE_AT: "old"}), _doc({}, exists=True)
        )
        clear = AsyncMock(return_value=0)
        p1, p2, p3, p4 = self._patches(mock_db, mock_fs, clear)
        with p1, p2, p3, p4:
            await repo.ensure_session("s1", user_id="anon-uid", is_guest=True)

        assert isinstance(sess_ref.update.call_args[0][0][EXPIRE_AT], datetime)
        clear.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_upgraded_account_makes_its_session_permanent(self, repo, mock_db, mock_fs):
        # Anonymous account upgraded with the same uid: same owner, now registered.
        sess_ref, _ = TestEnsureSession()._build_collections(
            mock_db, _doc({"userId": "uid-1", EXPIRE_AT: "old"}), _doc({}, exists=True)
        )
        clear = AsyncMock(return_value=7)
        p1, p2, p3, p4 = self._patches(mock_db, mock_fs, clear)
        with p1, p2, p3, p4:
            await repo.ensure_session("s1", user_id="uid-1", is_guest=False)

        clear.assert_awaited_once_with(mock_db, "s1")
        # Same owner: clearing the expiry is the only write needed.
        sess_ref.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_claimed_guest_session_becomes_permanent(self, repo, mock_db, mock_fs):
        sess_ref, _ = TestEnsureSession()._build_collections(
            mock_db, _doc({"userId": "guest_abcdefgh", EXPIRE_AT: "old"}), _doc({}, exists=True)
        )
        clear = AsyncMock(return_value=2)
        p1, p2, p3, p4 = self._patches(mock_db, mock_fs, clear)
        with p1, p2, p3, p4:
            await repo.ensure_session("s1", user_id="real-uid", is_guest=False)

        clear.assert_awaited_once_with(mock_db, "s1")
        assert sess_ref.update.call_args[0][0]["userId"] == "real-uid"

    @pytest.mark.asyncio
    async def test_failed_cleanup_never_blocks_the_claim(self, repo, mock_db, mock_fs):
        # The claim is the essential write; the expiry cleanup runs after it and
        # is retried on the next registered write if it fails.
        sess_ref, _ = TestEnsureSession()._build_collections(
            mock_db, _doc({"userId": "guest_abcdefgh", EXPIRE_AT: "old"}), _doc({}, exists=True)
        )
        clear = AsyncMock(side_effect=RuntimeError("batch failed"))
        p1, p2, p3, p4 = self._patches(mock_db, mock_fs, clear)
        with p1, p2, p3, p4:
            await repo.ensure_session("s1", user_id="real-uid", is_guest=False)

        assert sess_ref.update.call_args[0][0]["userId"] == "real-uid"

    @pytest.mark.asyncio
    async def test_failed_cleanup_never_drops_the_session_update(self, repo, mock_db, mock_fs):
        sess_ref, _ = TestSaveMessage()._setup_db(mock_db)
        sess_ref.get = AsyncMock(return_value=_doc({"userId": "u1", EXPIRE_AT: "old"}))
        clear = AsyncMock(side_effect=RuntimeError("batch failed"))
        p1, p2, p3, p4 = self._patches(mock_db, mock_fs, clear)
        with p1, p2, p3, p4:
            await repo.save_message("s1", "assistant", "ok", is_guest=False)

        assert sess_ref.set.call_args[0][0]["messageCount"] == "Increment(1)"

    @pytest.mark.asyncio
    async def test_registered_writer_on_permanent_session_skips_clear(self, repo, mock_db, mock_fs):
        TestEnsureSession()._build_collections(mock_db, _doc({"userId": "u1"}), _doc({}, exists=True))
        clear = AsyncMock(return_value=0)
        p1, p2, p3, p4 = self._patches(mock_db, mock_fs, clear)
        with p1, p2, p3, p4:
            await repo.ensure_session("s1", user_id="u1", is_guest=False)

        clear.assert_not_awaited()


# ════════════════════════════════════════════════════════════════════════════
# save_file_metadata
# ════════════════════════════════════════════════════════════════════════════

class TestSaveFileMetadata:

    def _setup_db(self, mock_db, existing_docs):
        files_ref = MagicMock()
        files_ref.where.return_value = files_ref
        files_ref.limit.return_value = files_ref
        files_ref.get = AsyncMock(return_value=existing_docs)
        files_ref.add = AsyncMock(return_value=(None, MagicMock(id="auto1")))
        files_ref.document.return_value.set = AsyncMock()
        files_ref.document.return_value.id = "asset1"

        proj_ref = MagicMock()
        proj_ref.collection.return_value = files_ref
        mock_db.collection.return_value.document.return_value = proj_ref
        return files_ref

    @pytest.mark.asyncio
    async def test_saves_new_file(self, repo, mock_db, mock_fs, mock_sync):
        files_ref = self._setup_db(mock_db, [])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs), \
             patch(f"{_MODULE}.sync_project_cover", mock_sync):
            await repo.save_file_metadata("proj1", {"url": "gs://b/f.jpg", "name": "f.jpg"})

        files_ref.add.assert_called_once()
        data = files_ref.add.call_args[0][0]
        assert data["url"] == "gs://b/f.jpg"
        mock_sync.assert_called_once_with("proj1")

    @pytest.mark.asyncio
    async def test_skips_duplicate(self, repo, mock_db, mock_fs, mock_sync):
        existing = MagicMock()
        files_ref = self._setup_db(mock_db, [existing])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs), \
             patch(f"{_MODULE}.sync_project_cover", mock_sync):
            await repo.save_file_metadata("proj1", {"url": "gs://b/existing.jpg"})

        files_ref.add.assert_not_called()
        mock_sync.assert_not_called()

    @pytest.mark.asyncio
    async def test_uses_defaults_for_missing_fields(self, repo, mock_db, mock_fs, mock_sync):
        files_ref = self._setup_db(mock_db, [])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs), \
             patch(f"{_MODULE}.sync_project_cover", mock_sync):
            await repo.save_file_metadata("proj1", {"url": "gs://b/f.jpg"})

        data = files_ref.add.call_args[0][0]
        assert data["type"] == "image"
        assert data["size"] == 0
        assert data["uploadedBy"] == "system"
        assert data["mimeType"] == "application/octet-stream"

    @pytest.mark.asyncio
    async def test_swallows_exceptions(self, repo, mock_db, mock_fs, mock_sync):
        mock_db.collection.side_effect = Exception("DB error")

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs), \
             patch(f"{_MODULE}.sync_project_cover", mock_sync):
            assert await repo.save_file_metadata("proj1", {"url": "gs://x"}) is None  # no raise

    @pytest.mark.asyncio
    async def test_returns_the_auto_id(self, repo, mock_db, mock_fs, mock_sync):
        self._setup_db(mock_db, [])
        with patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs), patch(f"{_MODULE}.sync_project_cover", mock_sync):
            assert await repo.save_file_metadata("proj1", {"url": "gs://b/f.jpg"}) == "auto1"

    @pytest.mark.asyncio
    async def test_file_id_room_and_storage_path(self, repo, mock_db, mock_fs, mock_sync):
        """Phase 138: stable document id (the asset id), room, and always a storage path."""
        files_ref = self._setup_db(mock_db, [])
        url = "https://storage.googleapis.com/bkt/user-uploads/proj1/asset1.jpg?X-Goog-Signature=s"
        with patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs), patch(f"{_MODULE}.sync_project_cover", mock_sync):
            file_id = await repo.save_file_metadata("proj1", {"url": url}, file_id="asset1", room_id="r1")

        assert file_id == "asset1"
        files_ref.document.assert_called_with("asset1")
        files_ref.add.assert_not_called()
        data = files_ref.document.return_value.set.call_args[0][0]
        assert data["roomId"] == "r1"
        assert data["metadata"]["storage_path"] == "user-uploads/proj1/asset1.jpg"

    @pytest.mark.asyncio
    async def test_no_room_field_when_unknown(self, repo, mock_db, mock_fs, mock_sync):
        """Unassigned files have NO roomId (the default room collects them)."""
        files_ref = self._setup_db(mock_db, [])
        with patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs), patch(f"{_MODULE}.sync_project_cover", mock_sync):
            await repo.save_file_metadata("proj1", {"url": "gs://b/f.jpg"})
        assert "roomId" not in files_ref.add.call_args[0][0]


# ════════════════════════════════════════════════════════════════════════════
# get_history_sync
# ════════════════════════════════════════════════════════════════════════════

class TestGetHistorySync:

    def _setup_db(self, mock_db, stream_docs):
        msgs_ref = MagicMock()
        msgs_ref.order_by.return_value = msgs_ref
        msgs_ref.limit.return_value = msgs_ref
        msgs_ref.stream.return_value = stream_docs

        sess_ref = MagicMock()
        sess_ref.collection.return_value = msgs_ref
        mock_db.collection.return_value.document.return_value = sess_ref

    def test_chronological_order(self, repo, mock_db, mock_fs):
        doc1 = _doc({"role": "user", "content": "Hi"})
        doc2 = _doc({"role": "assistant", "content": "Hello"})
        self._setup_db(mock_db, [doc2, doc1])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            result = repo.get_history_sync("s1", limit=20)

        assert len(result) == 2
        assert result[0]["role"] == "user"
        assert result[1]["role"] == "assistant"

    def test_defaults_role_to_user(self, repo, mock_db, mock_fs):
        doc = _doc({"content": "msg"})
        self._setup_db(mock_db, [doc])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            result = repo.get_history_sync("s1")

        assert result[0]["role"] == "user"

    def test_returns_empty_on_exception(self, repo, mock_db, mock_fs):
        mock_db.collection.side_effect = Exception("DB error")

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            assert repo.get_history_sync("s1") == []

    def test_empty_session(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db, [])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs):
            assert repo.get_history_sync("s1") == []


# ════════════════════════════════════════════════════════════════════════════
# factory
# ════════════════════════════════════════════════════════════════════════════

class TestFactory:
    def test_returns_instance(self, repo):
        from src.repositories.conversation_repository import ConversationRepository
        assert isinstance(repo, ConversationRepository)

    def test_get_db_calls_client(self, mock_db, mock_fs, mock_sync):
        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.get_async_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.async_firestore", mock_fs), \
             patch(f"{_MODULE}.sync_project_cover", mock_sync):
            from src.repositories.conversation_repository import ConversationRepository
            r = ConversationRepository()
            db = r._get_db()

        assert db is mock_db
