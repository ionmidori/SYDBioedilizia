"""
Unit Tests - Projects Module
=============================
Tests for project CRUD operations and API endpoints.
"""
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime
from src.utils.datetime_utils import utc_now

from src.models.project import (
    ProjectCreate,
    ProjectDocument,
    ProjectListItem,
    ProjectStatus,
    ProjectUpdate,
)


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
        
        # Mock: Project exists with guest owner
        # DocumentSnapshot.to_dict() is synchronous, so use MagicMock
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"userId": "guest_abc12345"}
        
        # doc_ref.get() is async, so use AsyncMock that returns the sync snapshot
        mock_doc_ref = AsyncMock()
        mock_doc_ref.get.return_value = mock_doc
        
        mock_db = MagicMock()
        mock_db.collection.return_value.document.return_value = mock_doc_ref
        
        with patch('src.db.projects.get_async_firestore_client', return_value=mock_db):
            result = await projects_db.claim_project("session-xyz", "new-user-456")
        
        # Assert: Should update
        assert result is True
        mock_doc_ref.update.assert_called_once()
        update_args = mock_doc_ref.update.call_args[0][0]
        assert update_args["userId"] == "new-user-456"

