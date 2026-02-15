"""
Quota management system for rate-limiting expensive operations.

This module provides Firestore-based quota tracking to prevent API abuse
by limiting the number of renders and quotes per user per 24-hour window.
Mirrors the logic from ai_core/src/tool-quota.ts.

S2 FIX: Migrated from synchronous `firestore.client()` to async `get_async_firestore_client()`
        to prevent blocking the FastAPI main event loop.
S3 FIX: Quota is now tracked per-project (not per-user) to match business rules.
"""

import logging
import re
from datetime import datetime, timedelta, timezone
from src.utils.datetime_utils import utc_now
from typing import Tuple, Optional

from google.cloud.firestore_v1 import Increment
from src.db.firebase_client import get_async_firestore_client
from src.core.config import settings

logger = logging.getLogger(__name__)

# Quota limits - Tiered based on authentication
# Anonymous users: Access is now BLOCKED by AuthGuard (Tier 1).
QUOTA_LIMITS_ANONYMOUS = {
    "generate_render": 0,
    "get_market_prices": 0,
    "upload_video": 0,
    "save_quote": 0,
}

QUOTA_LIMITS_AUTHENTICATED = {
    "generate_render": 2,
    "get_market_prices": 2,
    "save_quote": 2,
    "upload_video": 1,
}

# Weekly limits (7 days rolling window)
QUOTA_LIMITS_WEEKLY = {
    "generate_render": 7
}

QUOTA_WINDOW_HOURS = 24
QUOTA_WINDOW_WEEKLY_HOURS = 24 * 7


# Firebase UIDs: 20-128 chars, alphanumeric plus dash/underscore
_FIREBASE_UID_RE = re.compile(r'^[a-zA-Z0-9_\-]{20,128}$')
_ANONYMOUS_PREFIXES = ("guest_", "session_", "anon_", "debug-")

def _is_authenticated_user(user_id: str) -> bool:
    """
    Check if user is authenticated based on user_id format.

    L4 FIX: Uses proper Firebase UID regex instead of fragile
    heuristics (isalnum, len>10). Firebase UIDs can contain
    dashes and underscores.
    """
    if not user_id or user_id == "default":
        return False
    if any(user_id.startswith(prefix) for prefix in _ANONYMOUS_PREFIXES):
        return False
    return bool(_FIREBASE_UID_RE.match(user_id))


class QuotaExceededError(Exception):
    """Raised when a user exceeds their quota for a specific tool."""
    
    def __init__(self, tool_name: str, reset_at: datetime, period: str = "giornaliero"):
        self.tool_name = tool_name
        self.reset_at = reset_at
        self.period = period
        super().__init__(
            f"Quota {period} exceeded for {tool_name}. Resets at {reset_at.isoformat()}"
        )


def _build_quota_doc_id(user_id: str, tool_name: str, project_id: Optional[str] = None) -> str:
    """
    S3 FIX: Build quota document ID. Uses project_id when available
    for per-project quota tracking (matching business rules).
    Falls back to user_id for backward compatibility.
    """
    scope_id = project_id if project_id else user_id
    return f"{scope_id}_{tool_name}"


async def check_quota(
    user_id: str, 
    tool_name: str, 
    project_id: Optional[str] = None
) -> Tuple[bool, int, datetime]:
    """
    Check if the user has remaining quota for the specified tool.
    Supports Daily + Weekly limits and Administrator Overrides.
    
    S2 FIX: Now fully async using get_async_firestore_client().
    S3 FIX: Quota tracked per-project when project_id is provided.
    
    Args:
        user_id: Firebase UID.
        tool_name: Name of the tool to check quota for.
        project_id: Optional project/session ID for per-project tracking.
    
    Returns:
        Tuple of (allowed, remaining, reset_at).
    """
    now = utc_now()
    
    # ENVIRONMENT OVERRIDE: Unlimited quota in development
    if settings.ENV == "development":
        logging.info(f"[Quota] Dev mode active: Bypassing quota for {tool_name}")
        return True, 9999, now + timedelta(days=365)
    
    db = get_async_firestore_client()
    
    try:
        doc_id = _build_quota_doc_id(user_id, tool_name, project_id)
        quota_ref = db.collection("usage_quotas").document(doc_id)
        doc = await quota_ref.get()
        
        # Override Logic
        custom_limit = None
        if doc.exists:
            data = doc.to_dict()
            if data.get("bypass_quota") is True:
                logger.info(f"[Quota] 🛑 BYPASS ACTIVE for {doc_id} on {tool_name}")
                return True, 9999, now + timedelta(days=365)
            
            if data.get("override_limit") is not None:
                custom_limit = int(data.get("override_limit"))
                logger.info(f"[Quota] 🔧 CUSTOM LIMIT ACTIVE for {doc_id}: {custom_limit}")
        
        # Determine limits
        is_authenticated = _is_authenticated_user(user_id)
        limits = QUOTA_LIMITS_AUTHENTICATED if is_authenticated else QUOTA_LIMITS_ANONYMOUS
        daily_limit = custom_limit if custom_limit is not None else limits.get(tool_name, float('inf'))
        weekly_limit = QUOTA_LIMITS_WEEKLY.get(tool_name)
        
        logger.info(
            f"[Quota] Checking {doc_id} ({'auth' if is_authenticated else 'anon'}) "
            f"for {tool_name}. Limit: {daily_limit}/day, {weekly_limit}/week"
        )
        
        # Check weekly limit (if applicable)
        if weekly_limit:
            weekly_doc_id = f"{doc_id}_weekly"
            weekly_ref = db.collection("usage_quotas").document(weekly_doc_id)
            weekly_doc = await weekly_ref.get()
            
            if weekly_doc.exists:
                w_data = weekly_doc.to_dict()
                w_count = w_data.get("count", 0)
                w_start = w_data.get("window_start")
                if hasattr(w_start, 'timestamp'):
                    w_start = datetime.fromtimestamp(w_start.timestamp(), tz=timezone.utc)
                
                if now < w_start + timedelta(hours=QUOTA_WINDOW_WEEKLY_HOURS):
                    if w_count >= weekly_limit and custom_limit is None:
                         reset_at = w_start + timedelta(hours=QUOTA_WINDOW_WEEKLY_HOURS)
                         logger.warning(f"[Quota] Weekly limit reached for {doc_id}")
                         return False, 0, reset_at
        
        # Check daily limit
        if not doc.exists:
            allowed = daily_limit > 0
            reset_at = now + timedelta(hours=QUOTA_WINDOW_HOURS)
            return allowed, max(0, daily_limit - 1) if allowed else 0, reset_at
        
        data = doc.to_dict()
        count = data.get("count", 0)
        window_start = data.get("window_start")
        
        if not window_start:
            reset_at = now + timedelta(hours=QUOTA_WINDOW_HOURS)
            return True, daily_limit - 1, reset_at
        
        if hasattr(window_start, 'timestamp'): 
            window_start = datetime.fromtimestamp(window_start.timestamp(), tz=timezone.utc)
        
        if now >= window_start + timedelta(hours=QUOTA_WINDOW_HOURS):
            allowed = daily_limit > 0
            reset_at = now + timedelta(hours=QUOTA_WINDOW_HOURS)
            return allowed, max(0, daily_limit - 1) if allowed else 0, reset_at
        
        # Window active
        reset_at = window_start + timedelta(hours=QUOTA_WINDOW_HOURS)
        remaining = max(0, daily_limit - count)
        allowed = count < daily_limit
        
        if not allowed:
            logger.warning(
                f"[Quota] Daily limit reached for {doc_id} ({count}/{daily_limit})"
            )
        
        return allowed, remaining, reset_at
    
    except Exception as e:
        logger.error(f"[Quota] Error checking quota: {e}")
        return True, 0, now + timedelta(hours=QUOTA_WINDOW_HOURS)


async def increment_quota(
    user_id: str, 
    tool_name: str, 
    project_id: Optional[str] = None
) -> None:
    """
    Increment the quota counter (Daily + Weekly).
    
    S2 FIX: Now fully async.
    S3 FIX: Tracks per-project when project_id is provided.
    """
    db = get_async_firestore_client()
    doc_id = _build_quota_doc_id(user_id, tool_name, project_id)
    
    # Update Daily Quota
    daily_ref = db.collection("usage_quotas").document(doc_id)
    await _increment_counter(db, daily_ref, user_id, tool_name, QUOTA_WINDOW_HOURS, project_id)
    
    # Update Weekly Quota (if applicable)
    if tool_name in QUOTA_LIMITS_WEEKLY:
        weekly_ref = db.collection("usage_quotas").document(f"{doc_id}_weekly")
        await _increment_counter(db, weekly_ref, user_id, tool_name, QUOTA_WINDOW_WEEKLY_HOURS, project_id)


async def _increment_counter(
    db,
    doc_ref,
    user_id: str,
    tool_name: str,
    window_hours: int,
    project_id: Optional[str] = None
) -> None:
    """
    Atomic counter increment using Firestore server-side Increment.

    Uses Increment() transform which is atomic at the Firestore server level,
    eliminating the read-then-write race condition for concurrent requests.
    Window resets still use read-then-write but this is safe since the
    worst case is resetting a window slightly late (not a security issue).
    """
    try:
        now = utc_now()
        snapshot = await doc_ref.get()

        if not snapshot.exists:
            await doc_ref.set({
                "count": 1,
                "window_start": now,
                "user_id": user_id,
                "project_id": project_id,
                "tool_name": tool_name,
                "last_used": now
            })
        else:
            data = snapshot.to_dict()
            window_start = data.get("window_start")

            if hasattr(window_start, 'timestamp'):
                window_start = datetime.fromtimestamp(window_start.timestamp(), tz=timezone.utc)

            if now >= window_start + timedelta(hours=window_hours):
                # Window expired: reset counter
                await doc_ref.update({
                    "count": 1,
                    "window_start": now,
                    "last_used": now,
                    "project_id": project_id,
                })
            else:
                # Window active: atomic server-side increment
                await doc_ref.update({
                    "count": Increment(1),
                    "last_used": now
                })
    except Exception as e:
        logger.error(f"[Quota] Error incrementing {tool_name} for {user_id}: {e}")
