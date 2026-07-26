"""
Unit Tests - Projects Module
=============================
Tests for project CRUD operations and API endpoints.
"""
import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from src.models.project import (
    ProjectCreate,
    ProjectDocument,
    ProjectListItem,
    ProjectStatus,
)
from src.utils.datetime_utils import utc_now


class TestProjectModels:
    """Test Pydantic models for projects."""

    def test_project_create_default_title(self):
        """GIVEN no title provided
        WHEN ProjectCreate is instantiated
        THEN should use default title
        """
        project = ProjectCreate()
        assert project.title == "Nuovo Progetto"

    def test_project_create_custom_title(self):
        """GIVEN a custom title
        WHEN ProjectCreate is instantiated
        THEN should use provided title
        """
        project = ProjectCreate(title="Ristrutturazione Cucina")
        assert project.title == "Ristrutturazione Cucina"

    def test_project_status_enum(self):
        """GIVEN ProjectStatus enum
        THEN should have expected values
        """
        assert ProjectStatus.DRAFT.value == "draft"
        assert ProjectStatus.ANALYZING.value == "analyzing"
        assert ProjectStatus.QUOTED.value == "quoted"
        assert ProjectStatus.RENDERING.value == "rendering"
        assert ProjectStatus.COMPLETED.value == "completed"

    def test_project_document_creation(self):
        """GIVEN valid project data
        WHEN ProjectDocument is created
        THEN should have all fields
        """
        now = utc_now()
        project = ProjectDocument(
            session_id="test-session-123",
            user_id="user-456",
            title="Test Project",
            status=ProjectStatus.DRAFT,
            created_at=now,
            updated_at=now,
        )

        assert project.session_id == "test-session-123"
        assert project.user_id == "user-456"
        assert project.title == "Test Project"
        assert project.status == ProjectStatus.DRAFT
        assert project.message_count == 0
        assert project.thumbnail_url is None

    def test_project_list_item_creation(self):
        """GIVEN minimal list item data
        WHEN ProjectListItem is created
        THEN should serialize correctly
        """
        now = utc_now()
        item = ProjectListItem(
            session_id="session-abc",
            title="Quick Project",
            status=ProjectStatus.QUOTED,
            updated_at=now,
        )

        assert item.session_id == "session-abc"
        assert item.status == ProjectStatus.QUOTED


class TestProjectDbOperations:
    """Test project database operations with mocked Firestore."""

    @pytest.mark.asyncio
    async def test_create_project_returns_session_id(self):
        """GIVEN valid user_id and project data
        WHEN create_project is called
        THEN should return a UUID session_id
        """
        from src.db import projects as projects_db

        # Mock async Firestore client
        mock_doc_ref = AsyncMock()
        mock_db = MagicMock()
        mock_db.collection.return_value.document.return_value = mock_doc_ref

        with patch('src.db.projects.get_async_firestore_client', return_value=mock_db):
            session_id = await projects_db.create_project(
                user_id="test-user-123",
                data=ProjectCreate(title="My Kitchen")
            )

        # Assert: Should return a valid UUID
        assert len(session_id) == 36  # UUID format
        assert "-" in session_id

        # Assert: Firestore set was called
        mock_doc_ref.set.assert_called_once()
        call_args = mock_doc_ref.set.call_args[0][0]
        assert call_args["userId"] == "test-user-123"
        assert call_args["title"] == "My Kitchen"
        assert call_args["status"] == "draft"
        # Regression guard: new projects MUST initialize is_deleted = False
        assert call_args["is_deleted"] is False

    @pytest.mark.asyncio
    async def test_claim_project_only_works_for_guest(self):
        """GIVEN a project owned by a real user
        WHEN claim_project is called
        THEN should return False (not allowed)
        """
        from src.db import projects as projects_db

        # Mock: Project exists with real user ID
        # DocumentSnapshot.to_dict() is synchronous, so use MagicMock
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"userId": "real-user-abc123"}

        # doc_ref.get() is async
        mock_doc_ref = AsyncMock()
        mock_doc_ref.get.return_value = mock_doc

        mock_db = MagicMock()
        mock_db.collection.return_value.document.return_value = mock_doc_ref

        with patch('src.db.projects.get_async_firestore_client', return_value=mock_db):
            result = await projects_db.claim_project("session-xyz", "new-user-456")

        # Assert: Should NOT update
        assert result is False
        mock_doc_ref.update.assert_not_called()


    @pytest.mark.asyncio
    async def test_claim_project_succeeds_for_guest(self):
        """GIVEN a project owned by guest_*
        WHEN claim_project is called
        THEN should update userId and return True
        """
        from src.db import projects as projects_db

        # Mock: Project snapshot
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"userId": "guest_abc12345"}

        # Mock: Document reference (synchronous methods, async get)
        mock_doc_ref = MagicMock()
        mock_doc_ref.get = AsyncMock(return_value=mock_doc)

        # Mock: Batch (synchronous update/set, async commit)
        mock_batch = MagicMock()
        mock_batch.commit = AsyncMock()

        # Mock: Files Stream (Async generator)
        async def mock_stream():
            if False:
                yield

        mock_files_col = MagicMock()
        mock_files_col.stream.side_effect = mock_stream

        mock_doc_ref.collection.return_value = mock_files_col

        # Mock: Database Client
        mock_db = MagicMock()
        mock_db.batch.return_value = mock_batch
        mock_db.collection.return_value.document.return_value = mock_doc_ref

        with patch('src.db.projects.get_async_firestore_client', return_value=mock_db):
            result = await projects_db.claim_project("session-xyz", "new-user-456")

        # Assert: Should return True
        assert result is True

        # Assert: Batch logic verification
        mock_batch.commit.assert_called_once()
        # Verify any update call reached the batch for the target user
        found_update = False
        for call in mock_batch.update.call_args_list:
            if call[0][1].get("userId") == "new-user-456":
                found_update = True
                break
        assert found_update is True


    @pytest.mark.asyncio
    async def test_count_user_projects_excludes_deleted(self):
        """GIVEN a user with 3 active + 2 soft-deleted projects
        WHEN count_user_projects is called
        THEN should return 3 (deleted projects are excluded).
        """
        from src.db import projects as projects_db

        def _make_doc(is_deleted: bool):
            """Helper: returns a MagicMock document snapshot."""
            doc = MagicMock()
            doc.to_dict.return_value = {"is_deleted": is_deleted}
            return doc

        active_docs = [_make_doc(False), _make_doc(False), _make_doc(False)]
        deleted_docs = [_make_doc(True), _make_doc(True)]
        all_docs = active_docs + deleted_docs

        # Mock: aggregation query raises (simulates missing composite index)
        mock_agg_query = MagicMock()
        mock_agg_query.get = AsyncMock(side_effect=Exception("index not ready"))

        # Mock: fallback stream (async generator)
        async def mock_stream():
            for doc in all_docs:
                yield doc

        mock_fallback_col = MagicMock()
        mock_fallback_col.where.return_value = mock_fallback_col
        mock_fallback_col.select.return_value = mock_fallback_col
        mock_fallback_col.stream.side_effect = mock_stream

        mock_filtered_col = MagicMock()
        mock_filtered_col.where.return_value = mock_filtered_col
        mock_filtered_col.count.return_value = mock_agg_query

        # The real code does two separate .collection() chains:
        # one for the aggregation query (with both filters) and one for the fallback.
        # We keep it simple by patching the whole chain.
        mock_db = MagicMock()
        mock_db.collection.return_value = mock_filtered_col
        mock_filtered_col.where.return_value = mock_fallback_col

        with patch('src.db.projects.get_async_firestore_client', return_value=mock_db):
            count = await projects_db.count_user_projects("user-with-mixed-projects")

        # Only active projects should be counted
        assert count == 3, f"Expected 3 active projects, got {count}"


class TestProjectsFailClosed:
    """Regression tests for the blind-except fail-open bugs (BLE001 ratchet).

    Each test here pins a behaviour that a `except Exception: return <neutral>` used to
    swallow, silently turning an infrastructure outage into an apparent success.
    """

    @pytest.mark.asyncio
    async def test_count_user_projects_raises_when_both_attempts_fail(self):
        """GIVEN Firestore is down (both the aggregation and the fallback stream fail)
        WHEN count_user_projects is called
        THEN it must raise, NOT return 0.

        Returning 0 would report "this user owns no projects" to the quota check in
        projects_router.create_project, silently disabling the 5-project limit.
        """
        from src.db import projects as projects_db

        mock_agg_query = MagicMock()
        mock_agg_query.get = AsyncMock(side_effect=Exception("index not ready"))

        mock_fallback_col = MagicMock()
        mock_fallback_col.where.return_value = mock_fallback_col
        mock_fallback_col.select.return_value = mock_fallback_col
        mock_fallback_col.stream.side_effect = Exception("firestore unavailable")

        mock_filtered_col = MagicMock()
        mock_filtered_col.count.return_value = mock_agg_query
        mock_filtered_col.where.return_value = mock_fallback_col

        mock_db = MagicMock()
        mock_db.collection.return_value = mock_filtered_col

        with patch('src.db.projects.get_async_firestore_client', return_value=mock_db):
            with pytest.raises(Exception, match="firestore unavailable"):
                await projects_db.count_user_projects("user-123")

    @pytest.mark.asyncio
    async def test_create_project_endpoint_fails_closed_when_count_unavailable(self):
        """GIVEN the project count cannot be determined (Firestore down)
        WHEN POST /projects is handled
        THEN it must answer 500 and must NOT create the project.

        This is the end-to-end regression of the quota fail-open: with the old
        `return 0` the endpoint happily created a 6th, 7th, ... project.
        """
        from src.api.routes import projects_router

        with (
            patch.object(
                projects_router.projects_db,
                'count_user_projects',
                AsyncMock(side_effect=Exception("firestore unavailable")),
            ),
            patch.object(projects_router.projects_db, 'create_project', AsyncMock()) as mock_create,
        ):
            with pytest.raises(HTTPException) as exc_info:
                await projects_router.create_project(
                    data=ProjectCreate(title="Nuovo Progetto"),
                    user_session=MagicMock(uid="user-123"),
                )

        assert exc_info.value.status_code == 500
        mock_create.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_get_user_projects_warns_when_quote_lookup_fails(self, caplog):
        """GIVEN the per-project quote lookup fails (missing index / denied read)
        WHEN get_user_projects is called
        THEN the project is still listed with has_quote=False AND a warning is logged.

        The fail-safe default is correct here — a missing quote must not break the
        dashboard — but it must be observable instead of `except Exception: pass`.
        """
        from src.db import projects as projects_db

        mock_doc = MagicMock()
        mock_doc.id = "project-abc"
        mock_doc.to_dict.return_value = {
            "title": "Villa",
            "status": "draft",
            "updatedAt": utc_now(),
            "messageCount": 2,
        }

        async def mock_stream():
            yield mock_doc

        mock_col = MagicMock()
        mock_col.where.return_value = mock_col
        mock_col.order_by.return_value = mock_col
        mock_col.limit.return_value = mock_col
        mock_col.stream.side_effect = mock_stream

        # The quote sub-document read blows up
        mock_quote_ref = MagicMock()
        mock_quote_ref.get = AsyncMock(side_effect=Exception("permission denied"))
        mock_col.document.return_value.collection.return_value.document.return_value = mock_quote_ref

        mock_db = MagicMock()
        mock_db.collection.return_value = mock_col

        with patch('src.db.projects.get_async_firestore_client', return_value=mock_db):
            with caplog.at_level(logging.WARNING, logger="src.db.projects"):
                projects = await projects_db.get_user_projects("user-123")

        assert len(projects) == 1
        assert projects[0].has_quote is False
        assert any(
            record.levelno == logging.WARNING and "project-abc" in record.getMessage()
            for record in caplog.records
        ), "Expected a warning naming the project whose quote lookup failed"

    @pytest.mark.asyncio
    async def test_delete_project_fails_closed_when_storage_cleanup_fails(self):
        """GIVEN the Storage blob cleanup fails during a hard delete
        WHEN delete_project is called
        THEN it must return False AND leave the project document in place.

        Reporting True would mark a GDPR erasure as complete while orphaned blobs
        survive on GCS; keeping the document makes the purge retryable.
        """
        from src.db import projects as projects_db

        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"userId": "user-123"}

        mock_doc_ref = MagicMock()
        mock_doc_ref.get = AsyncMock(return_value=mock_doc)
        mock_doc_ref.delete = AsyncMock()

        mock_frontend_ref = MagicMock()
        mock_frontend_ref.delete = AsyncMock()

        mock_sessions_col = MagicMock()
        mock_sessions_col.document.return_value = mock_doc_ref
        mock_frontend_col = MagicMock()
        mock_frontend_col.document.return_value = mock_frontend_ref

        mock_db = MagicMock()
        mock_db.collection.side_effect = lambda name: (
            mock_frontend_col if name == "projects" else mock_sessions_col
        )

        with (
            patch('src.db.projects.get_async_firestore_client', return_value=mock_db),
            patch('src.db.projects._delete_collection_batch', AsyncMock()),
            patch('src.db.projects.get_storage_client', side_effect=Exception("storage down")),
        ):
            result = await projects_db.delete_project("project-abc", "user-123")

        assert result is False, "A partial hard-delete must not report success"
        # The project doc must survive so the purge can be retried
        mock_doc_ref.delete.assert_not_awaited()

