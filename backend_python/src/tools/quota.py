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


def _is_authenticated_user(user_id: str) -> bool:
    """
    Check if user is authenticated based on user_id format.
    """
    if not user_id or user_id == "default":
        return False
    if user_id.startswith("guest_") or user_id.startswith("session_"):
        return False
    return len(user_id) > 10 and user_id.isalnum()


class QuotaExceededError(Exception):
    """Raised when a user exceeds their quota for a specific tool."""
    
    def __init__(self, tool_name: str, reset_at: datetime, period: str = "giornaliero"):
        self.tool_name = tool_name
        self.reset_at = reset_at
        self.period = period
        super().__init__(
            f"Quota {period} exceeded for {tool_name}. Resets at {reset_at.isoformat()}"
        )


def check_quota(user_id: str, tool_name: str) -> Tuple[bool, int, datetime]:
    """
    Check if the user has remaining quota for the specified tool.
    Supports Daily + Weekly limits and Administrator Overrides.
    """
    # ✅ FIX: Move `now` outside try block to ensure it's always defined
    now = datetime.utcnow()
    
    # ENVIRONMENT OVERRIDE: Unlimited quota in development
    if settings.ENV == "development":
        logging.info(f"[Quota] Dev mode active: Bypassing quota for {tool_name}")
        return True, 9999, now + timedelta(days=365)
    
    db = firestore.client()
    
    try:
        # 1. CHECK OVERRIDES (Bypass or Custom Limit)
        # We check the specific quota document for overrides first.
        # Ideally this would be in a user profile, but to keep it simple and per-tool:
        # We look for fields 'bypass_quota' or 'override_limit' in the usage doc.
        
        # We need to fetch the doc anyway to check usage
        quota_ref = db.collection("usage_quotas").document(f"{user_id}_{tool_name}")
        doc = quota_ref.get()
        
        # Override Logic
        custom_limit = None
        if doc.exists:
            data = doc.to_dict()
            if data.get("bypass_quota") is True:
                logger.info(f"[Quota] 🛑 BYPASS ACTIVE for User {user_id} on {tool_name}")
                return True, 9999, now + timedelta(days=365)
            
            if data.get("override_limit") is not None:
                custom_limit = int(data.get("override_limit"))
                logger.info(f"[Quota] 🔧 CUSTOM LIMIT ACTIVE for User {user_id}: {custom_limit}")
        
        # 2. DETERMINE LIMITS
        is_authenticated = _is_authenticated_user(user_id)
        limits = QUOTA_LIMITS_AUTHENTICATED if is_authenticated else QUOTA_LIMITS_ANONYMOUS
        daily_limit = custom_limit if custom_limit is not None else limits.get(tool_name, float('inf'))
        weekly_limit = QUOTA_LIMITS_WEEKLY.get(tool_name) # No weekly overrides for now, unless we want to add 'override_weekly_limit'
        
        logger.info(
            f"[Quota] Checking {user_id} ({'auth' if is_authenticated else 'anon'}) "
            f"for {tool_name}. Limit: {daily_limit}/day, {weekly_limit}/week"
        )
        
        # 3. CHECK WEEKLY LIMIT (if applicable)
        if weekly_limit:
            weekly_ref = db.collection("usage_quotas").document(f"{user_id}_{tool_name}_weekly")
            weekly_doc = weekly_ref.get()
            
            if weekly_doc.exists:
                w_data = weekly_doc.to_dict()
                w_count = w_data.get("count", 0)
                w_start = w_data.get("window_start")
                if hasattr(w_start, 'timestamp'): w_start = datetime.fromtimestamp(w_start.timestamp())
                
                # Check expiration
                if now < w_start + timedelta(hours=QUOTA_WINDOW_WEEKLY_HOURS):
                    if w_count >= weekly_limit and custom_limit is None: # Custom limit overrides weekly too? Let's say yes for simplicity
                         reset_at = w_start + timedelta(hours=QUOTA_WINDOW_WEEKLY_HOURS)
                         logger.warning(f"[Quota] Weekly limit reached for {user_id}")
                         return False, 0, reset_at
        
        # 4. CHECK DAILY LIMIT
        if not doc.exists:
            # First use
            allowed = daily_limit > 0
            reset_at = now + timedelta(hours=QUOTA_WINDOW_HOURS)
            return allowed, max(0, daily_limit - 1) if allowed else 0, reset_at
        
        data = doc.to_dict()
        count = data.get("count", 0)
        window_start = data.get("window_start")
        
        # FIX: Handle missing/corrupt window_start
        if not window_start:
            reset_at = now + timedelta(hours=QUOTA_WINDOW_HOURS)
            return True, daily_limit - 1, reset_at
        
        # Convert Firestore timestamp to datetime if needed
        if hasattr(window_start, 'timestamp'): 
            window_start = datetime.fromtimestamp(window_start.timestamp())
        
        # Check expiration
        if now >= window_start + timedelta(hours=QUOTA_WINDOW_HOURS):
            # Reset window
            allowed = daily_limit > 0
            reset_at = now + timedelta(hours=QUOTA_WINDOW_HOURS)
            return allowed, max(0, daily_limit - 1) if allowed else 0, reset_at
        
        # Window active
        reset_at = window_start + timedelta(hours=QUOTA_WINDOW_HOURS)
        remaining = max(0, daily_limit - count)
        allowed = count < daily_limit
        
        if not allowed:
            logger.warning(
                f"[Quota] Daily limit reached for {user_id} ({count}/{daily_limit})"
            )
        
        return allowed, remaining, reset_at
    
    except Exception as e:
        logger.error(f"[Quota] Error checking quota: {e}")
        return True, 0, now + timedelta(hours=QUOTA_WINDOW_HOURS)


def increment_quota(user_id: str, tool_name: str) -> None:
    """
    Increment the quota counter (Daily + Weekly).
    """
    db = firestore.client()
    
    # 1. Update Daily Quota
    daily_ref = db.collection("usage_quotas").document(f"{user_id}_{tool_name}")
    _increment_counter_transaction(db, daily_ref, user_id, tool_name, QUOTA_WINDOW_HOURS)
    
    # 2. Update Weekly Quota (if applicable)
    if tool_name in QUOTA_LIMITS_WEEKLY:
        weekly_ref = db.collection("usage_quotas").document(f"{user_id}_{tool_name}_weekly")
        _increment_counter_transaction(db, weekly_ref, user_id, tool_name, QUOTA_WINDOW_WEEKLY_HOURS)


def _increment_counter_transaction(db, ref, user_id, tool_name, window_hours):
    """Helper for transactional increment."""
    @firestore.transactional
    def update_in_transaction(transaction, doc_ref):
        snapshot = doc_ref.get(transaction=transaction)
        now = datetime.utcnow()
        
        if not snapshot.exists:
            transaction.set(doc_ref, {
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
            
            if hasattr(window_start, 'timestamp'):
                window_start = datetime.fromtimestamp(window_start.timestamp())
            
            # Check window expiration
            if now >= window_start + timedelta(hours=window_hours):
                transaction.update(doc_ref, {
                    "count": 1,
                    "window_start": now,
                    "last_used": now
                })
            else:
                transaction.update(doc_ref, {
                    "count": count + 1,
                    "last_used": now
                })

    try:
        transaction = db.transaction()
        update_in_transaction(transaction, ref)
    except Exception as e:
        logger.error(f"[Quota] Error incrementing {tool_name} for {user_id}: {e}")
