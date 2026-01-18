"""
Unit Tests - Sync Wrappers
===========================
Tests for synchronous tool wrappers and quota integration.
"""
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timedelta
from src.tools.sync_wrappers import get_market_prices_sync, generate_render_sync

class TestMarktPricesSync:
    """Test get_market_prices_sync wrapper."""
    
    def test_quota_exceeded(self):
        """GIVEN quota check returns False
        WHEN get_market_prices_sync is called
        THEN should return quota warning message
        """
        # Arrange
        reset_time = datetime.now() + timedelta(minutes=30)
        with patch('src.tools.sync_wrappers.check_quota', return_value=(False, 0, reset_time)):
            # Act
            result = get_market_prices_sync("test query", "user1")
        
        # Assert
        assert "raggiunto il limite" in result
        assert reset_time.strftime("%H:%M") in result

    def test_successful_execution(self):
        """GIVEN quota check passes
        WHEN get_market_prices_sync is called
        THEN should execute fetch, increment quota, and return content
        """
        # Arrange
        mock_fetch = MagicMock()
        mock_fetch.return_value = {"content": "Market data"}
        
        # We need to mock the async execution inside the sync wrapper
        # The wrapper creates a new loop. We can patch asyncio to run our mock.
        async def async_mock(*args, **kwargs):
            return mock_fetch()

        with patch('src.tools.sync_wrappers.check_quota', return_value=(True, 5, datetime.now())):
            with patch('src.tools.sync_wrappers.increment_quota') as mock_inc:
                with patch('src.tools.sync_wrappers.fetch_market_prices', side_effect=async_mock):
                    # Act
                    result = get_market_prices_sync("query", "user1")
        
        # Assert
        assert result == "Market data"
        mock_inc.assert_called_once_with("user1", "get_market_prices")


class TestGenerateRenderSync:
    """Test generate_render_sync wrapper."""
    
    def test_quota_exceeded(self):
        """GIVEN quota check returns False
        WHEN generate_render_sync is called
        THEN should return quota warning
        """
        # Arrange
        reset_time = datetime.now() + timedelta(hours=1)
        with patch('src.tools.sync_wrappers.check_quota', return_value=(False, 0, reset_time)):
            # Act
            result = generate_render_sync("prompt", "kitchen", "modern", "session1", user_id="user1")
        
        # Assert
        assert "raggiunto il limite" in result
    
    def test_successful_execution(self):
        """GIVEN quota check passes
        WHEN generate_render_sync is called
        THEN should generate render and increment quota
        """
        # Arrange
        async def async_mock(*args, **kwargs):
            return "http://render.url/img.png"

        with patch('src.tools.sync_wrappers.check_quota', return_value=(True, 2, datetime.now())):
            with patch('src.tools.sync_wrappers.increment_quota') as mock_inc:
                with patch('src.tools.sync_wrappers.generate_render_wrapper', side_effect=async_mock):
                    # Act
                    result = generate_render_sync("prompt", "room", "style", "sess", user_id="user1")
        
        # Assert
        assert "http://render.url" in result
        mock_inc.assert_called_once_with("user1", "generate_render")

    def test_execution_failure_handles_error(self):
        """GIVEN generation fails
        WHEN generate_render_sync is called
        THEN should return error message
        """
        # Arrange
        async def async_fail(*args, **kwargs):
            raise Exception("Render failed")

        with patch('src.tools.sync_wrappers.check_quota', return_value=(True, 2, datetime.now())):
            with patch('src.tools.sync_wrappers.generate_render_wrapper', side_effect=async_fail):
                # Act
                result = generate_render_sync("p", "r", "s", "sess")
        
        # Assert
        assert "Errore" in result
        assert "Render failed" in result
