"""
Unit Tests - Construction Site Details
======================================
Tests for ProjectDetails Pydantic models and database operations.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.models.project import (
    Address,
    ProjectDetails,
    PropertyType,
)


class TestConstructionDetailsModels:
    """Test Pydantic models for construction details."""

    def test_address_model_validation(self):
        """GIVEN valid address data
        WHEN Address is instantiated
        THEN should succeed
        """
        addr = Address(street="Via Roma 10", city="Milano", zip="20121")
        assert addr.street == "Via Roma 10"
        assert addr.city == "Milano"
        assert addr.zip == "20121"

    def test_address_model_invalid(self):
        """GIVEN missing required fields
        WHEN Address is instantiated
        THEN should raise ValidationError
        """
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            Address(street="", city="Milano") # Missing zip and empty street

    def test_project_details_serialization(self):
        """GIVEN valid project details
        WHEN ProjectDetails is instantiated and serialized
        THEN should have expected values
        """
        details = ProjectDetails(
            id="test-session-123",
            footage_sqm=120.5,
            property_type=PropertyType.APARTMENT,
            address=Address(street="Via Test 1", city="Torino", zip="10100"),
            budget_cap=50000.0,
            technical_notes="Note di test",
            renovation_constraints=["Vincolo 1", "Vincolo 2"]
        )

        assert details.id == "test-session-123"
        assert details.footage_sqm == 120.5
        assert details.property_type == PropertyType.APARTMENT
        assert details.address.street == "Via Test 1"
        assert details.budget_cap == 50000.0
        assert details.renovation_constraints == ["Vincolo 1", "Vincolo 2"]


class TestConstructionDetailsDbOperations:
    """Test database operations for construction details."""

    @pytest.mark.asyncio
    async def test_update_project_details_success(self):
        """GIVEN valid details and authorized user
        WHEN update_project_details is called
        THEN should return True and call Firestore update
        """
        from src.db import projects as projects_db

        # Mock Firestore
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"userId": "user-123"}

        mock_doc_ref = AsyncMock()
        mock_doc_ref.get.return_value = mock_doc

        mock_db = MagicMock()
        mock_db.collection.return_value.document.return_value = mock_doc_ref

        details = ProjectDetails(
            id="session-abc",
            footage_sqm=100,
            property_type=PropertyType.VILLA,
            address=Address(street="Street", city="City", zip="12345"),
            budget_cap=10000,
            renovation_constraints=[]
        )

        with patch('src.db.projects.get_async_firestore_client', return_value=mock_db):
            result = await projects_db.update_project_details("session-abc", "user-123", details)

        assert result is True
        mock_doc_ref.update.assert_called_once()
        update_data = mock_doc_ref.update.call_args[0][0]
        assert "constructionDetails" in update_data
        assert update_data["constructionDetails"]["property_type"] == "villa"

    @pytest.mark.asyncio
    async def test_update_project_details_unauthorized(self):
        """GIVEN a user who does not own the project
        WHEN update_project_details is called
        THEN should return False and NOT call Firestore update
        """
        from src.db import projects as projects_db

        # Mock Firestore: Project exists but belongs to a different user
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"userId": "different-user"}

        mock_doc_ref = AsyncMock()
        mock_doc_ref.get.return_value = mock_doc

        mock_db = MagicMock()
        mock_db.collection.return_value.document.return_value = mock_doc_ref

        details = ProjectDetails(
            id="session-abc",
            footage_sqm=100,
            property_type=PropertyType.VILLA,
            address=Address(street="Street", city="City", zip="12345"),
            budget_cap=10000,
            renovation_constraints=[]
        )

        with patch('src.db.projects.get_async_firestore_client', return_value=mock_db):
            result = await projects_db.update_project_details("session-abc", "user-123", details)

        assert result is False
        # update should NOT be called except for possibly other calls, but we check this specific one
        mock_doc_ref.update.assert_not_called()
