"""
Unit Tests - Projects Module
=============================
Tests for project CRUD operations and API endpoints.
"""

import pytest
from main import app
from src.models.project import (
    ProjectDocument,
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

@pytest.mark.parametrize(("method", "path"), [
    ("post", "/api/projects"),
    ("patch", "/api/projects/{session_id}"),
    ("delete", "/api/projects/{session_id}"),
])
def test_projects_cannot_be_created_renamed_or_deleted(method, path):
    """Phase 139: one chat per user, chosen by the backend; its data goes only with
    the account (DELETE /api/users/me). The routes are gone, not just hidden."""
    assert method not in app.openapi()["paths"].get(path, {})


@pytest.mark.parametrize("path", ["/api/projects", "/api/reports/dashboard", "/api/reports/gallery"])
def test_there_is_no_list_of_projects_nor_cross_project_report(path):
    """Phase 139: the dashboard is the user's one chat (the house). Its files are
    read live from projects/{chat_id}/files; there is nothing to list or sum."""
    assert "get" not in app.openapi()["paths"].get(path, {})
