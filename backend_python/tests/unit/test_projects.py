"""
Unit Tests - Projects Module
=============================
Tests for project CRUD operations and API endpoints.
"""
import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from main import app
from src.models.project import (
    ProjectDocument,
    ProjectListItem,
    ProjectStatus,
)
from src.utils.datetime_utils import utc_now


class TestProjectModels:
    """Test Pydantic models for projects."""

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


class TestProjectsFailClosed:
    """Regression tests for the blind-except fail-open bugs (BLE001 ratchet).

    Each test here pins a behaviour that a `except Exception: return <neutral>` used to
    swallow, silently turning an infrastructure outage into an apparent success.
    """

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

        with patch('src.db.projects.queries.get_async_firestore_client', return_value=mock_db):
            with caplog.at_level(logging.WARNING, logger="src.db.projects"):
                projects = await projects_db.get_user_projects("user-123")

        assert len(projects) == 1
        assert projects[0].has_quote is False
        assert any(
            record.levelno == logging.WARNING and "project-abc" in record.getMessage()
            for record in caplog.records
        ), "Expected a warning naming the project whose quote lookup failed"



async def test_get_user_projects_hides_chats_merged_into_another():
    """Phase 139: a guest chat merged into the account's chat is archived; its
    messages now live in the account's chat, so the list must not show it twice."""
    from src.db import projects as projects_db
    from tests.unit.firestore_fakes import FakeDb

    db = FakeDb()
    for sid, extra in (("account-chat", {}), ("guest-chat", {"merged_into": "account-chat"})):
        db.put("sessions", sid, {"userId": "user-123", "title": "Casa", "status": "draft",
                                 "updatedAt": utc_now(), "messageCount": 1, **extra})

    with patch('src.db.projects.queries.get_async_firestore_client', return_value=db):
        projects = await projects_db.get_user_projects("user-123")

    assert [p.session_id for p in projects] == ["account-chat"]


@pytest.mark.parametrize(("method", "path"), [
    ("post", "/api/projects"),
    ("patch", "/api/projects/{session_id}"),
    ("delete", "/api/projects/{session_id}"),
])
def test_projects_cannot_be_created_renamed_or_deleted(method, path):
    """Phase 139: one chat per user, chosen by the backend; its data goes only with
    the account (DELETE /api/users/me). The routes are gone, not just hidden."""
    assert method not in app.openapi()["paths"].get(path, {})
