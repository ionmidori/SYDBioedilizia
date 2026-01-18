"""
Request context management using contextvars.

This module provides a clean way to pass request-scoped data (like user_id)
to tools without modifying their signatures. Uses Python's contextvars for
thread-safe context propagation.
"""

from contextvars import ContextVar
from typing import Optional

# Context variable for the current user's ID
# Used by tools to access user identity for quota tracking
current_user_id: ContextVar[str] = ContextVar("current_user_id", default="default")


def get_current_user_id() -> str:
    """Get the current user's ID from context.
    
    Returns:
        User ID string (UID or guest_IP), or "default" if not set.
    """
    return current_user_id.get()


def set_current_user_id(user_id: str) -> None:
    """Set the current user's ID in context.
    
    Args:
        user_id: User identifier to set (UID or guest_IP)
    """
    current_user_id.set(user_id)
