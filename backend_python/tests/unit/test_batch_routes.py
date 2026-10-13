"""
Unit tests for batch quote submission data models and validators.

Tests cover:
- CreateBatchBody validation
"""
import pytest
from src.api.routes.batch_routes import CreateBatchBody
from src.schemas.internal import UserSession


@pytest.fixture
def user_session():
    """Mock authenticated user session."""
    session = UserSession(uid="user_123", claims={"role": "user"})
    return session


@pytest.fixture
def admin_session():
    """Mock admin user session."""
    session = UserSession(uid="admin_456", claims={"role": "admin"})
    return session


class TestCreateBatchBody:
    """Tests for CreateBatchBody request validation."""

    def test_valid_single_project(self):
        """Accept single project ID."""
        body = CreateBatchBody(project_ids=["proj_001"])
        assert body.project_ids == ["proj_001"]

    def test_valid_multiple_projects(self):
        """Accept multiple project IDs (up to 20)."""
        ids = [f"proj_{i:03d}" for i in range(20)]
        body = CreateBatchBody(project_ids=ids)
        assert len(body.project_ids) == 20

    def test_reject_empty_list(self):
        """Reject empty project ID list."""
        with pytest.raises(ValueError):
            CreateBatchBody(project_ids=[])

    def test_reject_too_many_projects(self):
        """Reject more than 20 projects."""
        ids = [f"proj_{i:03d}" for i in range(21)]
        with pytest.raises(ValueError):
            CreateBatchBody(project_ids=ids)

    def test_accept_valid_characters(self):
        """Accept project IDs with alphanumeric, underscore, hyphen."""
        body = CreateBatchBody(project_ids=["proj-001_v2"])
        assert body.project_ids == ["proj-001_v2"]
