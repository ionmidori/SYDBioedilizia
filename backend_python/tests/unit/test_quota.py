"""
Unit Tests - Quota System
===========================
Tests for quota management and rate limiting with tiered limits.
"""
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from datetime import datetime, timedelta
from src.utils.datetime_utils import utc_now
from src.tools.quota import (
    check_quota, 
    increment_quota, 
    QUOTA_LIMITS_ANONYMOUS,
    QUOTA_LIMITS_AUTHENTICATED
)

@pytest.fixture
def mock_async_firestore():
    """Mock Async Firestore client."""
    mock_client = MagicMock() # Client itself is sync
    
    # Mock collection -> document -> get/set/update
    mock_collection = MagicMock()
    # DocumentReference itself is sync, methods are async
    mock_doc_ref = MagicMock() 
    mock_snapshot = MagicMock()
    
    # Configure chain
    mock_client.collection.return_value = mock_collection
    mock_collection.document.return_value = mock_doc_ref
    
    # Default snapshot state (exists=False)
    mock_snapshot.exists = False
    
    # Async methods
    mock_doc_ref.get = AsyncMock(return_value=mock_snapshot)
    mock_doc_ref.set = AsyncMock()
    mock_doc_ref.update = AsyncMock()
    
    return mock_client

@pytest.mark.asyncio
class TestQuotaCheckDevelopment:
    """Test quota checks in development environment."""
    
    async def test_development_env_bypasses_quota(self, mock_env_development):
        """GIVEN development environment
        WHEN check_quota is called
        THEN should return unlimited quota without checking database
        """
        # Act: No need to mock Firestore since dev mode returns early
        allowed, remaining, reset_at = await check_quota("test-user", "generate_render")
        
        # Assert: Development mode returns unlimited
        assert allowed is True
        assert remaining == 9999
        assert reset_at > utc_now() + timedelta(days=360)


@pytest.mark.asyncio
class TestQuotaCheckProduction:
    """Test quota checks in production environment."""
    
    async def test_first_use_allowed(self, mock_env_production, mock_async_firestore):
        """GIVEN production environment with no prior usage
        WHEN check_quota is called for the first time
        THEN should allow the operation and return limit - 1
        """
        # Arrange: Mock Firestore to return non-existent document
        mock_snapshot = MagicMock()
        mock_snapshot.exists = False
        mock_async_firestore.collection.return_value.document.return_value.get.return_value = mock_snapshot
        
        with patch('src.tools.quota.get_async_firestore_client', return_value=mock_async_firestore):
            allowed, remaining, reset_at = await check_quota("authenticatedUser123", "generate_render")
        
        # Assert
        assert allowed is True
        # authenticatedUser123 is authenticated, so limit is 2 from QUOTA_LIMITS_AUTHENTICATED
        assert remaining == 1  # 2 - 1 = 1
        assert reset_at > utc_now()
    
    async def test_within_quota_allowed(self, mock_env_production, mock_async_firestore):
        """GIVEN authenticated user has used 0 out of 2 renders
        WHEN check_quota is called
        THEN should allow the operation
        """
        # Arrange: Mock existing quota document for authenticated user
        now = utc_now()
        mock_snapshot = MagicMock()
        mock_snapshot.exists = True
        mock_snapshot.to_dict.return_value = {
            "count": 0,  # No renders used yet
            "window_start": now - timedelta(hours=1)
        }
        mock_async_firestore.collection.return_value.document.return_value.get.return_value = mock_snapshot

        with patch('src.tools.quota.get_async_firestore_client', return_value=mock_async_firestore):
            allowed, remaining, reset_at = await check_quota("authenticatedUser123", "generate_render")

        # Assert
        assert allowed is True
        assert remaining == 2  # Authenticated limit is 2, 0 used
    
    async def test_quota_exceeded(self, mock_env_production, mock_async_firestore):
        """GIVEN user has exhausted quota (2/2 renders used)
        WHEN check_quota is called
        THEN should deny the operation
        """
        # Arrange
        now = utc_now()
        mock_snapshot = MagicMock()
        mock_snapshot.exists = True
        mock_snapshot.to_dict.return_value = {
            "count": 2,
            "window_start": now - timedelta(hours=1)
        }
        mock_async_firestore.collection.return_value.document.return_value.get.return_value = mock_snapshot
        
        with patch('src.tools.quota.get_async_firestore_client', return_value=mock_async_firestore):
            allowed, remaining, reset_at = await check_quota("authenticatedUser123", "generate_render")
        
        # Assert
        assert allowed is False
        assert remaining == 0
    
    async def test_quota_window_reset(self, mock_env_production, mock_async_firestore):
        """GIVEN quota window has expired (>24h since window_start)
        WHEN check_quota is called
        THEN should reset and allow operation
        """
        # Arrange: Window started 25 hours ago
        now = utc_now()
        mock_snapshot = MagicMock()
        mock_snapshot.exists = True
        mock_snapshot.to_dict.return_value = {
            "count": 2,  # Previously exhausted
            "window_start": now - timedelta(hours=25)
        }
        mock_async_firestore.collection.return_value.document.return_value.get.return_value = mock_snapshot
        
        with patch('src.tools.quota.get_async_firestore_client', return_value=mock_async_firestore):
            allowed, remaining, reset_at = await check_quota("authenticatedUser123", "generate_render")
        
        # Assert: Window expired, quota reset
        assert allowed is True
        # Authenticated user, so limit is 2
        assert remaining == 1  # 2 - 1 = 1


@pytest.mark.asyncio
class TestQuotaIncrement:
    """Test quota increment operations."""
    
    async def test_increment_first_use(self, mock_env_production, mock_async_firestore):
        """GIVEN no prior usage
        WHEN increment_quota is called
        THEN should create set new counters
        """
        # Arrange
        mock_snapshot = MagicMock()
        mock_snapshot.exists = False
        mock_async_firestore.collection.return_value.document.return_value.get.return_value = mock_snapshot
        
        with patch('src.tools.quota.get_async_firestore_client', return_value=mock_async_firestore):
             await increment_quota("authenticatedUser123", "generate_render")
        
        # Assert: .set() called twice (daily + weekly)
        assert mock_async_firestore.collection.return_value.document.return_value.set.call_count == 2
