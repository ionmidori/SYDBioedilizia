"""
Unit Tests - Quota System
===========================
Tests for quota management and rate limiting with tiered limits.
"""
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timedelta
from src.tools.quota import (
    check_quota, 
    increment_quota, 
    QUOTA_LIMITS_ANONYMOUS,
    QUOTA_LIMITS_AUTHENTICATED
)


class TestQuotaCheckDevelopment:
    """Test quota checks in development environment."""
    
    def test_development_env_bypasses_quota(self, mock_env_development):
        """GIVEN development environment
        WHEN check_quota is called
        THEN should return unlimited quota without checking database
        """
        # Act: No need to mock Firestore since dev mode returns early
        allowed, remaining, reset_at = check_quota("test-user", "generate_render")
        
        # Assert: Development mode returns unlimited
        assert allowed is True
        assert remaining == 9999
        assert reset_at > datetime.utcnow() + timedelta(days=360)


class TestQuotaCheckProduction:
    """Test quota checks in production environment."""
    
    def test_first_use_allowed(self, mock_env_production, mock_firestore_client):
        """GIVEN production environment with no prior usage
        WHEN check_quota is called for the first time
        THEN should allow the operation and return limit - 1
        """
        # Arrange: Mock Firestore to return non-existent document
        mock_snapshot = MagicMock()
        mock_snapshot.exists = False
        mock_firestore_client.collection().document().get.return_value = mock_snapshot
        
        with patch('src.tools.quota.firestore.client', return_value=mock_firestore_client):
            allowed, remaining, reset_at = check_quota("authenticatedUser123", "generate_render")
        
        # Assert
        assert allowed is True
        # authenticatedUser123 is authenticated, so limit is 2 from QUOTA_LIMITS_AUTHENTICATED
        assert remaining == 1  # 2 - 1 = 1
        assert reset_at > datetime.utcnow()
    
    def test_within_quota_allowed(self, mock_env_production, mock_firestore_client):
        """GIVEN authenticated user has used 0 out of 2 renders
        WHEN check_quota is called
        THEN should allow the operation
        """
        # Arrange: Mock existing quota document for authenticated user
        now = datetime.utcnow()
        mock_snapshot = MagicMock()
        mock_snapshot.exists = True
        mock_snapshot.to_dict.return_value = {
            "count": 0,  # No renders used yet
            "window_start": now - timedelta(hours=1)
        }
        mock_firestore_client.collection().document().get.return_value = mock_snapshot

        with patch('src.tools.quota.firestore.client', return_value=mock_firestore_client):
            allowed, remaining, reset_at = check_quota("authenticatedUser123", "generate_render")

        # Assert
        assert allowed is True
        assert remaining == 2  # Authenticated limit is 2, 0 used
    
    def test_quota_exceeded(self, mock_env_production, mock_firestore_client):
        """GIVEN user has exhausted quota (2/2 renders used)
        WHEN check_quota is called
        THEN should deny the operation
        """
        # Arrange
        now = datetime.utcnow()
        mock_snapshot = MagicMock()
        mock_snapshot.exists = True
        mock_snapshot.to_dict.return_value = {
            "count": 2,
            "window_start": now - timedelta(hours=1)
        }
        mock_firestore_client.collection().document().get.return_value = mock_snapshot
        
        with patch('src.tools.quota.firestore.client', return_value=mock_firestore_client):
            allowed, remaining, reset_at = check_quota("authenticatedUser123", "generate_render")
        
        # Assert
        assert allowed is False
        assert remaining == 0
    
    def test_quota_window_reset(self, mock_env_production, mock_firestore_client):
        """GIVEN quota window has expired (>24h since window_start)
        WHEN check_quota is called
        THEN should reset and allow operation
        """
        # Arrange: Window started 25 hours ago
        now = datetime.utcnow()
        mock_snapshot = MagicMock()
        mock_snapshot.exists = True
        mock_snapshot.to_dict.return_value = {
            "count": 2,  # Previously exhausted
            "window_start": now - timedelta(hours=25)
        }
        mock_firestore_client.collection().document().get.return_value = mock_snapshot
        
        with patch('src.tools.quota.firestore.client', return_value=mock_firestore_client):
            allowed, remaining, reset_at = check_quota("authenticatedUser123", "generate_render")
        
        # Assert: Window expired, quota reset
        assert allowed is True
        # Authenticated user, so limit is 2
        assert remaining == 1  # 2 - 1 = 1


class TestQuotaIncrement:
    """Test quota increment operations."""
    
    def test_increment_first_use(self, mock_env_production, mock_firestore_client):
        """GIVEN no prior usage
        WHEN increment_quota is called
        THEN should create new documents with count=1 (Daily and Weekly)
        """
        # Arrange
        mock_transaction = MagicMock()
        mock_snapshot = MagicMock()
        mock_snapshot.exists = False
        mock_firestore_client.transaction.return_value = mock_transaction
        
        with patch('src.tools.quota.firestore.client', return_value=mock_firestore_client):
            with patch('src.tools.quota.firestore.transactional'):
                increment_quota("authenticatedUser123", "generate_render")
        
        # Assert: Transactions were created (2 for generate_render: daily and weekly)
        assert mock_firestore_client.transaction.call_count == 2
