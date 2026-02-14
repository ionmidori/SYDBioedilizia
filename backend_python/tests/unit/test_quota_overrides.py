import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from datetime import datetime, timedelta, timezone
from src.tools.quota import check_quota, QUOTA_LIMITS_AUTHENTICATED, QUOTA_LIMITS_WEEKLY

# Mock datetime properly to support comparisons and fromtimestamp
class MockDatetime(datetime):
    @classmethod
    def utcnow(cls):
        return datetime(2023, 1, 1, 12, 0, 0)

@pytest.fixture
def mock_datetime():
    # Use timezone-aware datetime for utc_now
    fixed_now = datetime(2023, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    with patch("src.tools.quota.utc_now", return_value=fixed_now):
        # Also patch datetime for other usages if necessary, but importantly utc_now
        yield

@pytest.fixture
def mock_settings():
    with patch("src.tools.quota.settings") as mock_settings:
        mock_settings.ENV = "production"
        yield mock_settings

@pytest.fixture
def mock_async_firestore():
    """Mock Async Firestore client."""
    mock_client = MagicMock()
    mock_collection = MagicMock()
    mock_doc_ref = MagicMock()
    mock_snapshot = MagicMock()
    
    # Configure chain
    mock_client.collection.return_value = mock_collection
    mock_collection.document.return_value = mock_doc_ref
    
    # Async methods
    mock_doc_ref.get = AsyncMock(return_value=mock_snapshot)
    
    return mock_client

@pytest.mark.asyncio
async def test_check_quota_bypass(mock_datetime, mock_async_firestore, mock_settings):
    """Test bypass_quota flag allows unlimited access."""
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = {
        "bypass_quota": True,
        "window_start": datetime(2023, 1, 1, 10, 0, 0, tzinfo=timezone.utc) # Valid start
    }
    mock_async_firestore.collection.return_value.document.return_value.get.return_value = mock_doc
    
    with patch('src.tools.quota.get_async_firestore_client', return_value=mock_async_firestore):
        allowed, remaining, _ = await check_quota("user123", "generate_render")
    
    assert allowed is True
    assert remaining == 9999

@pytest.mark.asyncio
async def test_check_quota_override(mock_datetime, mock_async_firestore, mock_settings):
    """Test override_limit replaces default limit."""
    mock_doc = MagicMock()
    mock_doc.exists = True
    # Default is 2, override is 10
    mock_doc.to_dict.return_value = {
        "override_limit": 10, 
        "count": 5,
        "window_start": datetime(2023, 1, 1, 10, 0, 0, tzinfo=timezone.utc) # Valid start
    }
    mock_async_firestore.collection.return_value.document.return_value.get.return_value = mock_doc
    
    with patch('src.tools.quota.get_async_firestore_client', return_value=mock_async_firestore):
        allowed, remaining, _ = await check_quota("user123", "generate_render")
    
    assert allowed is True
    assert remaining == 5

@pytest.mark.asyncio
async def test_check_quota_weekly_limit_exceeded(mock_datetime, mock_async_firestore, mock_settings):
    """Test weekly limit blocks access."""
    
    # Daily quota doc (exists, no override)
    mock_daily = MagicMock()
    mock_daily.exists = True
    mock_daily.to_dict.return_value = {
        "count": 0,
        "window_start": datetime(2023, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    }
    
    # Weekly quota doc (exists, exceeded)
    mock_weekly = MagicMock()
    mock_weekly.exists = True
    # Limit is 7, count is 7
    mock_weekly.to_dict.return_value = {
        "count": 7, 
        "window_start": datetime(2023, 1, 1, 10, 0, 0, tzinfo=timezone.utc) 
    }
    
    # Mock return values for calls
    # Call 1: Daily -> returns mock_daily
    # Call 2: Weekly -> returns mock_weekly
    
    # Since we can't easily side_effect the chained mock with args, 
    # we'll mock the get() method to return side_effect based on time or call count,
    # OR we can just rely on the fact that check_quota constructs doc_id.
    
    # Use side_effect on document() to return different refs based on arg
    def document_side_effect(arg):
        m = AsyncMock() # Must return an object with awaitable get()
        if arg.endswith("_weekly"):
            m.get.return_value = mock_weekly
        else:
            m.get.return_value = mock_daily
        return m

    mock_async_firestore.collection.return_value.document.side_effect = document_side_effect
    
    with patch('src.tools.quota.get_async_firestore_client', return_value=mock_async_firestore):
        allowed, remaining, _ = await check_quota("user123", "generate_render")
    
    assert allowed is False
    assert remaining == 0
