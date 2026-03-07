"""
Tests for ConversationRepository — Firestore-backed conversation storage.

Patches are applied at the IMPORT SITE (conversation_repository module),
not at the definition site, to correctly intercept already-bound names.
"""
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime, timezone

_MODULE = "src.repositories.conversation_repository"


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
         patch(f"{_MODULE}.firestore", mock_fs), \
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
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.save_message(session_id="s1", role="user", content="Hello")

        msgs_ref.add.assert_called_once()
        data = msgs_ref.add.call_args[0][0]
        assert data["role"] == "user"
        assert data["content"] == "Hello"

    @pytest.mark.asyncio
    async def test_timestamp_used_when_provided(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)
        ts = datetime(2024, 1, 1, tzinfo=timezone.utc)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.save_message("s1", "assistant", "Hi", timestamp=ts)

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert data["timestamp"] == ts

    @pytest.mark.asyncio
    async def test_server_timestamp_when_none(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.save_message("s1", "user", "msg")

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert data["timestamp"] == "SERVER_TIMESTAMP"

    @pytest.mark.asyncio
    async def test_metadata_included_when_provided(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.save_message("s1", "user", "msg", metadata={"src": "web"})

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert data["metadata"] == {"src": "web"}

    @pytest.mark.asyncio
    async def test_metadata_omitted_when_none(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.save_message("s1", "user", "msg")

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert "metadata" not in data

    @pytest.mark.asyncio
    async def test_plain_dict_tool_calls_stored(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)
        tcs = [{"name": "gen_render", "args": {}}]

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.save_message("s1", "assistant", "", tool_calls=tcs)

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert data["tool_calls"] == tcs

    @pytest.mark.asyncio
    async def test_pydantic_tool_calls_are_dumped(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)
        pydantic_tc = MagicMock()
        pydantic_tc.model_dump.return_value = {"name": "tool"}

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.save_message("s1", "assistant", "", tool_calls=[pydantic_tc])

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert data["tool_calls"] == [{"name": "tool"}]

    @pytest.mark.asyncio
    async def test_tool_call_id_stored(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.save_message("s1", "tool", "result", tool_call_id="tc-1")

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert data["tool_call_id"] == "tc-1"

    @pytest.mark.asyncio
    async def test_attachments_stored(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db)
        atts = [{"url": "gs://b/f.jpg"}]

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.save_message("s1", "user", "see image", attachments=atts)

        msgs_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        data = msgs_ref.add.call_args[0][0]
        assert data["attachments"] == atts

    @pytest.mark.asyncio
    async def test_creates_session_doc_when_missing(self, repo, mock_db, mock_fs):
        sess_ref, _ = self._setup_db(mock_db, session_exists=False)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.save_message("new-sess", "user", "hi")

        sess_ref.set.assert_called_once()
        call_data = sess_ref.set.call_args[0][0]
        assert call_data.get("createdAt") == "SERVER_TIMESTAMP"

    @pytest.mark.asyncio
    async def test_swallows_exceptions(self, repo, mock_db, mock_fs):
        mock_db.collection.side_effect = Exception("Firestore down")

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            # Must not raise
            await repo.save_message("s1", "user", "msg")


# ════════════════════════════════════════════════════════════════════════════
# get_context
# ════════════════════════════════════════════════════════════════════════════

class TestGetContext:

    def _setup_db(self, mock_db, stream_docs):
        msgs_ref = MagicMock()
        msgs_ref.order_by.return_value = msgs_ref
        msgs_ref.limit.return_value = msgs_ref
        msgs_ref.stream.return_value = stream_docs

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
             patch(f"{_MODULE}.firestore", mock_fs):
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
             patch(f"{_MODULE}.firestore", mock_fs):
            result = await repo.get_context("s1")

        assert result[0]["tool_calls"] == [{"name": "t"}]
        assert result[0]["tool_call_id"] == "tc-1"
        assert result[0]["attachments"] == [{"url": "gs://x"}]

    @pytest.mark.asyncio
    async def test_defaults_role_to_user(self, repo, mock_db, mock_fs):
        doc = _doc({"content": "msg"})  # no 'role'
        self._setup_db(mock_db, [doc])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            result = await repo.get_context("s1")

        assert result[0]["role"] == "user"

    @pytest.mark.asyncio
    async def test_returns_empty_list_on_exception(self, repo, mock_db, mock_fs):
        mock_db.collection.side_effect = Exception("DB error")

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            result = await repo.get_context("s1")

        assert result == []

    @pytest.mark.asyncio
    async def test_empty_session(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db, [])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            result = await repo.get_context("s1")

        assert result == []


# ════════════════════════════════════════════════════════════════════════════
# ensure_session
# ════════════════════════════════════════════════════════════════════════════

class TestEnsureSession:

    def _build_collections(self, mock_db, session_doc, project_doc):
        """Build distinct refs for sessions and projects collections."""
        sess_ref = MagicMock()
        sess_ref.get = MagicMock(return_value=session_doc)  # SYNC call in code
        sess_ref.set = MagicMock()                          # SYNC call in code
        sess_ref.update = AsyncMock()                       # async call in code

        proj_ref = MagicMock()
        proj_ref.get = AsyncMock(return_value=project_doc)  # async
        proj_ref.set = AsyncMock()                          # async
        proj_ref.update = AsyncMock()                       # async

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
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.ensure_session("new-sess", user_id="user123")

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
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.ensure_session("abcdefgh-rest", user_id=None)

        sess_data = sess_ref.set.call_args[0][0]
        assert sess_data["userId"].startswith("guest_")

    @pytest.mark.asyncio
    async def test_claims_guest_session_for_real_user(self, repo, mock_db, mock_fs):
        sess_doc = _doc({"userId": "guest_abcdefgh"}, exists=True)
        proj_doc = _doc({}, exists=True)
        sess_ref, proj_ref = self._build_collections(mock_db, sess_doc, proj_doc)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.ensure_session("sess1", user_id="real-uid")

        sess_ref.update.assert_called_once()
        update = sess_ref.update.call_args[0][0]
        assert update["userId"] == "real-uid"

    @pytest.mark.asyncio
    async def test_backfills_missing_project(self, repo, mock_db, mock_fs):
        sess_doc = _doc({"userId": "real-user", "title": "Proj"}, exists=True)
        proj_doc = _doc({}, exists=False)
        _, proj_ref = self._build_collections(mock_db, sess_doc, proj_doc)

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.ensure_session("sess1", user_id="real-user")

        proj_ref.set.assert_called_once()

    @pytest.mark.asyncio
    async def test_swallows_exceptions(self, repo, mock_db, mock_fs):
        mock_db.collection.side_effect = Exception("DB error")

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            await repo.ensure_session("s1", user_id="u1")  # no raise


# ════════════════════════════════════════════════════════════════════════════
# save_file_metadata
# ════════════════════════════════════════════════════════════════════════════

class TestSaveFileMetadata:

    def _setup_db(self, mock_db, existing_docs):
        files_ref = MagicMock()
        where_chain = MagicMock()
        where_chain.limit.return_value.get = AsyncMock(return_value=existing_docs)
        files_ref.where.return_value = where_chain
        files_ref.add = AsyncMock()

        proj_ref = MagicMock()
        proj_ref.collection.return_value = files_ref
        mock_db.collection.return_value.document.return_value = proj_ref
        return files_ref

    @pytest.mark.asyncio
    async def test_saves_new_file(self, repo, mock_db, mock_fs, mock_sync):
        files_ref = self._setup_db(mock_db, [])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs), \
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
             patch(f"{_MODULE}.firestore", mock_fs), \
             patch(f"{_MODULE}.sync_project_cover", mock_sync):
            await repo.save_file_metadata("proj1", {"url": "gs://b/existing.jpg"})

        files_ref.add.assert_not_called()
        mock_sync.assert_not_called()

    @pytest.mark.asyncio
    async def test_uses_defaults_for_missing_fields(self, repo, mock_db, mock_fs, mock_sync):
        files_ref = self._setup_db(mock_db, [])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs), \
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
             patch(f"{_MODULE}.firestore", mock_fs), \
             patch(f"{_MODULE}.sync_project_cover", mock_sync):
            await repo.save_file_metadata("proj1", {"url": "gs://x"})  # no raise


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
             patch(f"{_MODULE}.firestore", mock_fs):
            result = repo.get_history_sync("s1", limit=20)

        assert len(result) == 2
        assert result[0]["role"] == "user"
        assert result[1]["role"] == "assistant"

    def test_defaults_role_to_user(self, repo, mock_db, mock_fs):
        doc = _doc({"content": "msg"})
        self._setup_db(mock_db, [doc])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            result = repo.get_history_sync("s1")

        assert result[0]["role"] == "user"

    def test_returns_empty_on_exception(self, repo, mock_db, mock_fs):
        mock_db.collection.side_effect = Exception("DB error")

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
            assert repo.get_history_sync("s1") == []

    def test_empty_session(self, repo, mock_db, mock_fs):
        self._setup_db(mock_db, [])

        with patch(f"{_MODULE}.get_firestore_client", return_value=mock_db), \
             patch(f"{_MODULE}.firestore", mock_fs):
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
             patch(f"{_MODULE}.firestore", mock_fs), \
             patch(f"{_MODULE}.sync_project_cover", mock_sync):
            from src.repositories.conversation_repository import ConversationRepository
            r = ConversationRepository()
            db = r._get_db()

        assert db is mock_db
