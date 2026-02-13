"""
Centralized datetime utilities.

Provides a single canonical source of truth for UTC timestamps,
replacing the deprecated `datetime.utcnow()` (PEP 587, Python 3.12+).

Usage:
    from src.utils.datetime_utils import utc_now
    timestamp = utc_now()
"""

from datetime import datetime, timezone


def utc_now() -> datetime:
    """
    Return the current UTC time as a timezone-aware datetime.
    
    Replaces deprecated `datetime.utcnow()` which returns a naive
    datetime that can silently produce incorrect comparisons with
    timezone-aware datetimes from Firestore or other sources.
    """
    return datetime.now(timezone.utc)
