import pytest
from unittest.mock import patch, MagicMock
from src.utils.auth_guard import require_auth, AUTH_REQUIRED_SIGNAL
import pytest_asyncio

# Mock function to be decorated
@require_auth
async def protected_tool(arg1, user_id=None):
    return f"Success: {arg1}"

@pytest.mark.asyncio
async def test_auth_guard_authenticated_explicit():
    """Test access with explicit valid user_id."""
    result = await protected_tool("test", user_id="User1234567890")
    assert result == "Success: test"

@pytest.mark.asyncio
async def test_auth_guard_authenticated_context():
    """Test access with valid user_id from context."""
    with patch("src.utils.auth_guard.get_current_user_id", return_value="User1234567890"):
        result = await protected_tool("test")
        assert result == "Success: test"

@pytest.mark.asyncio
async def test_auth_guard_anonymous_explicit():
    """Test blocked access with explicit guest user_id."""
    result = await protected_tool("test", user_id="guest_123")
    assert result == AUTH_REQUIRED_SIGNAL

@pytest.mark.asyncio
async def test_auth_guard_anonymous_context():
    """Test blocked access with guest user_id from context."""
    with patch("src.utils.auth_guard.get_current_user_id", return_value="guest_123"):
        result = await protected_tool("test")
        assert result == AUTH_REQUIRED_SIGNAL

@pytest.mark.asyncio
async def test_auth_guard_default_user():
    """Test blocked access with 'default' user_id."""
    with patch("src.utils.auth_guard.get_current_user_id", return_value="default"):
        result = await protected_tool("test")
        assert result == AUTH_REQUIRED_SIGNAL

@pytest.mark.asyncio
async def test_auth_guard_short_uid():
    """Test blocked access with short (invalid) UID."""
    with patch("src.utils.auth_guard.get_current_user_id", return_value="abc"):
        result = await protected_tool("test")
        assert result == AUTH_REQUIRED_SIGNAL
