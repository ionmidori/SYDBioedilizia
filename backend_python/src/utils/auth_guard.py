import functools
import logging
from typing import Any, Callable, Union
from src.utils.context import get_current_user_id, get_is_anonymous

logger = logging.getLogger(__name__)

# Signal string that the frontend listens for to trigger the Login Modal/Widget
AUTH_REQUIRED_SIGNAL = "LOGIN_REQUIRED_UI_TRIGGER"

def require_auth(func: Callable) -> Callable:
    """
    Decorator to enforce strict authentication for tool execution.
    
    If the user is anonymous (guest_*, session_*, default), it blocks execution
    and returns the AUTH_REQUIRED_SIGNAL. This signal is intercepted by the 
    frontend (MessageItem.tsx) to display the <LoginRequest /> widget.
    """
    @functools.wraps(func)
    async def wrapper(*args, **kwargs) -> Any:
        # 1. Try to get user_id from arguments (explicit) or context (implicit)
        user_id = kwargs.get("user_id")
        if not user_id or user_id == "default":
            # Fallback to context var
            user_id = get_current_user_id()
            
        # 2. Check if Anonymous (Reliable check via Context)
        is_anonymous = get_is_anonymous()
            
        # 3. Block or Allow
        if is_anonymous:
            logger.warning(f"[AuthGuard] 🔒 Blocked anonymous access to {func.__name__} (User: {user_id})")
            return AUTH_REQUIRED_SIGNAL
            
        # 4. Proceed
        return await func(*args, **kwargs)
        
    return wrapper
