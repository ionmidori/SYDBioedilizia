"""
Unit tests for batch quote submission data models and validators.

Tests cover:
- CreateBatchBody validation
- ProjectDecisionBody validation
- _require_admin() authorization check
"""
import pytest
from fastapi import HTTPException

from src.api.routes.batch_routes import (
    CreateBatchBody,
    ProjectDecisionBody,
    _require_admin,
)
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


class TestProjectDecisionBody:
    """Tests for ProjectDecisionBody request validation."""

    def test_valid_approve(self):
        """Accept 'approve' decision."""
        body = ProjectDecisionBody(decision="approve")
        assert body.decision == "approve"

    def test_valid_reject(self):
        """Accept 'reject' decision."""
        body = ProjectDecisionBody(decision="reject")
        assert body.decision == "reject"

    def test_reject_invalid_decision(self):
        """Reject invalid decision value."""
        with pytest.raises(ValueError):
            ProjectDecisionBody(decision="maybe")

    def test_valid_with_notes(self):
        """Accept decision with admin notes."""
        body = ProjectDecisionBody(decision="reject", notes="Does not meet spec.")
        assert body.notes == "Does not meet spec."

    def test_reject_notes_too_long(self):
        """Reject notes exceeding max length."""
        long_notes = "x" * 2001
        with pytest.raises(ValueError):
            ProjectDecisionBody(decision="reject", notes=long_notes)

    def test_default_empty_notes(self):
        """Notes default to empty string."""
        body = ProjectDecisionBody(decision="approve")
        assert body.notes == ""


class TestRequireAdmin:
    """Tests for _require_admin() authorization check."""

    def test_admin_allowed(self, admin_session):
        """Admin role passes authorization."""
        # Should not raise
        _require_admin(admin_session)

    def test_user_denied(self, user_session):
        """Regular user role is denied."""
        with pytest.raises(HTTPException) as exc:
            _require_admin(user_session)
        assert exc.value.status_code == 403

    def test_missing_role_denied(self):
        """User with missing role is denied."""
        session = UserSession(uid="user_999", claims={})
        with pytest.raises(HTTPException) as exc:
            _require_admin(session)
        assert exc.value.status_code == 403
