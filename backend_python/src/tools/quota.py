"""
Quota management system for rate-limiting expensive operations.

This module provides Firestore-based quota tracking to prevent API abuse
by limiting the number of renders and quotes per user per 24-hour window.
Mirrors the logic from ai_core/src/tool-quota.ts.
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Tuple
from firebase_admin import firestore

logger = logging.getLogger(__name__)

# Quota limits - Tiered based on authentication
# Anonymous users: 1 render per 24h (to encourage signup)
# Authenticated users: 3 renders per 24h
QUOTA_LIMITS_ANONYMOUS = {
    "generate_render": 1,
    "get_market_prices": 2,
}

QUOTA_LIMITS_AUTHENTICATED = {
    "generate_render": 3,
    "get_market_prices": 5,
}

QUOTA_WINDOW_HOURS = 24


def _is_authenticated_user(user_id: str) -> bool:
    """
    Check if user is authenticated based on user_id format.
    
    Authenticated users have Firebase UIDs (alphanumeric format).
    Anonymous users have IDs like 'default', 'guest_*', or session IDs.
    """
    if not user_id or user_id == "default":
        return False
    
    # Check if it's a Firebase UID pattern (28 chars alphanumeric)
    # or any non-guest identifier
    if user_id.startswith("guest_") or user_id.startswith("session_"):
        return False
    
    # Assume authenticated if it looks like a real UID
    return len(user_id) > 10 and user_id.isalnum()


class QuotaExceededError(Exception):
    """Raised when a user exceeds their quota for a specific tool."""
    
    def __init__(self, tool_name: str, reset_at: datetime):
        self.tool_name = tool_name
        self.reset_at = reset_at
        super().__init__(
            f"Quota exceeded for {tool_name}. Resets at {reset_at.isoformat()}"
        )


def check_quota(user_id: str, tool_name: str) -> Tuple[bool, int, datetime]:
    """
    Check if the user has remaining quota for the specified tool.
    
    Args:
        user_id: Unique user identifier (UID or guest_IP)
        tool_name: Tool identifier (e.g., 'generate_render', 'get_market_prices')
    
    Returns:
        Tuple of (allowed, remaining, reset_at):
            - allowed: True if quota is available
            - remaining: Number of remaining uses
            - reset_at: When the quota window resets
    
    Example:
        >>> allowed, remaining, reset_at = check_quota("user123", "generate_render")
        >>> if not allowed:
        ...     raise QuotaExceededError("generate_render", reset_at)
    """
    # ✅ FIX: Move `now` outside try block to ensure it's always defined
    now = datetime.utcnow()
    
    # ENVIRONMENT OVERRIDE: Unlimited quota in development
    env = os.getenv("ENV", "development")
    if env == "development":
        logging.info(f"[Quota] Dev mode active: Bypassing quota for {tool_name}")
        # Return infinite remaining and a reset in the far future
        return True, 9999, now + timedelta(days=365)
    
    db = firestore.client()
    quota_ref = db.collection("usage_quotas").document(f"{user_id}_{tool_name}")
    
    try:
        doc = quota_ref.get()
        
        # ✅ Use tiered limits based on authentication
        is_authenticated = _is_authenticated_user(user_id)
        limits = QUOTA_LIMITS_AUTHENTICATED if is_authenticated else QUOTA_LIMITS_ANONYMOUS
        limit = limits.get(tool_name, float('inf'))
        
        logger.info(
            f"[Quota] User {user_id} ({'authenticated' if is_authenticated else 'anonymous'}) "
            f"quota for {tool_name}: limit={limit}"
        )
        
        if not doc.exists:
            # First use: Create quota document
            reset_at = now + timedelta(hours=QUOTA_WINDOW_HOURS)
            return True, limit - 1, reset_at
        
        data = doc.to_dict()
        count = data.get("count", 0)
        window_start = data.get("window_start")
        
        # Convert Firestore timestamp to datetime if needed
        if hasattr(window_start, 'timestamp'):
            window_start = datetime.fromtimestamp(window_start.timestamp())
        
        # Check if window has expired
        if now >= window_start + timedelta(hours=QUOTA_WINDOW_HOURS):
            # Reset window
            reset_at = now + timedelta(hours=QUOTA_WINDOW_HOURS)
            return True, limit - 1, reset_at
        
        # Window still active
        reset_at = window_start + timedelta(hours=QUOTA_WINDOW_HOURS)
        remaining = max(0, limit - count)
        allowed = count < limit
        
        if not allowed:
            logger.warning(
                f"[Quota] User {user_id} exceeded quota for {tool_name} "
                f"({count}/{limit}). Resets at {reset_at}"
            )
        
        return allowed, remaining, reset_at
    
    except Exception as e:
        logger.error(f"[Quota] Error checking quota: {e}")
        # Fail open: Allow operation if quota check fails
        return True, 0, now + timedelta(hours=QUOTA_WINDOW_HOURS)


def increment_quota(user_id: str, tool_name: str) -> None:
    """
    Increment the quota counter for the user and tool.
    
    This should be called AFTER successfully executing an expensive operation.
    Uses Firestore transactions to ensure atomic increments.
    
    Args:
        user_id: Unique user identifier
        tool_name: Tool identifier
    
    Example:
        >>> # After successful render generation
        >>> increment_quota("user123", "generate_render")
    """
    db = firestore.client()
    quota_ref = db.collection("usage_quotas").document(f"{user_id}_{tool_name}")
    
    @firestore.transactional
    def update_in_transaction(transaction, ref):
        snapshot = ref.get(transaction=transaction)
        now = datetime.utcnow()
        
        if not snapshot.exists:
            # First use: Initialize
            transaction.set(ref, {
                "count": 1,
                "window_start": now,
                "user_id": user_id,
                "tool_name": tool_name,
                "last_used": now
            })
        else:
            data = snapshot.to_dict()
            count = data.get("count", 0)
            window_start = data.get("window_start")
            
            # Convert timestamp if needed
            if hasattr(window_start, 'timestamp'):
                window_start = datetime.fromtimestamp(window_start.timestamp())
            
            # Check if window expired
            if now >= window_start + timedelta(hours=QUOTA_WINDOW_HOURS):
                # Reset window
                transaction.update(ref, {
                    "count": 1,
                    "window_start": now,
                    "last_used": now
                })
            else:
                # Increment counter
                transaction.update(ref, {
                    "count": count + 1,
                    "last_used": now
                })
    
    try:
        transaction = db.transaction()
        update_in_transaction(transaction, quota_ref)
        logger.info(f"[Quota] Incremented quota for user {user_id}, tool {tool_name}")
    except Exception as e:
        logger.error(f"[Quota] Error incrementing quota: {e}")
        # Best effort: Don't fail the operation if increment fails
