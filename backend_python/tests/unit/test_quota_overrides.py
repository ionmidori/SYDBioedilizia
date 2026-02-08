import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timedelta
from src.tools.quota import check_quota, QUOTA_LIMITS_AUTHENTICATED, QUOTA_LIMITS_WEEKLY

# Mock datetime properly to support comparisons and fromtimestamp
class MockDatetime(datetime):
    @classmethod
    def utcnow(cls):
        return datetime(2023, 1, 1, 12, 0, 0)

@pytest.fixture
def mock_datetime():
    with patch("src.tools.quota.datetime", MockDatetime):
        yield

@pytest.fixture
def mock_settings():
    with patch("src.tools.quota.settings") as mock_settings:
        mock_settings.ENV = "production"
        yield mock_settings

@pytest.fixture
def mock_firestore():
    with patch("src.tools.quota.firestore") as mock_fs:
        yield mock_fs

def test_check_quota_bypass(mock_datetime, mock_firestore, mock_settings):
    """Test bypass_quota flag allows unlimited access."""
    mock_db = mock_firestore.client.return_value
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = {
        "bypass_quota": True,
        "window_start": datetime(2023, 1, 1, 10, 0, 0) # Valid start
    }
    mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
    
    allowed, remaining, _ = check_quota("user123", "generate_render")
    
    assert allowed is True
    assert remaining == 9999

def test_check_quota_override(mock_datetime, mock_firestore, mock_settings):
    """Test override_limit replaces default limit."""
    mock_db = mock_firestore.client.return_value
    mock_doc = MagicMock()
    mock_doc.exists = True
    # Default is 2, override is 10
    mock_doc.to_dict.return_value = {
        "override_limit": 10, 
        "count": 5,
        "window_start": datetime(2023, 1, 1, 10, 0, 0) # Valid start
    }
    mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
    
    allowed, remaining, _ = check_quota("user123", "generate_render")
    
    assert allowed is True
    assert remaining == 5

def test_check_quota_weekly_limit_exceeded(mock_datetime, mock_firestore, mock_settings):
    """Test weekly limit blocks access."""
    mock_db = mock_firestore.client.return_value
    
    # Daily quota doc (exists, no override)
    mock_daily = MagicMock()
    mock_daily.exists = True
    mock_daily.to_dict.return_value = {
        "count": 0,
        "window_start": datetime(2023, 1, 1, 10, 0, 0)
    }
    
    # Weekly quota doc (exists, exceeded)
    mock_weekly = MagicMock()
    mock_weekly.exists = True
    # Limit is 7, count is 7
    mock_weekly.to_dict.return_value = {
        "count": 7, 
        "window_start": datetime(2023, 1, 1, 10, 0, 0) 
    }
    
    # Mocking side effects for multiple get() calls
    # 1. Daily get() -> returns daily doc
    # 2. Weekly get() -> returns weekly doc
    # But check_quota implementation calls daily doc request first to look for overrides, 
    # then weekly check, then daily check logic.
    # Actually, verify implementation order:
    # 1. Fetch Daily Doc (for overrides)
    # 2. Check Overrides
    # 3. Fetch Weekly Doc (if applicable)
    
    def get_side_effect():
        # This is tricky to mock with a single side effect because calls depend on args.
        # Let's mock the document() call sequence instead or inspect call args.
        pass

    # Simpler: Mock the document return values based on call
    def document_side_effect(path):
        m = MagicMock()
        if path.endswith("_weekly"):
            m.get.return_value = mock_weekly
        else:
            m.get.return_value = mock_daily
        return m
            
    mock_db.collection.return_value.document.side_effect = document_side_effect
    
    allowed, remaining, _ = check_quota("user123", "generate_render")
    
    assert allowed is False
    assert remaining == 0
