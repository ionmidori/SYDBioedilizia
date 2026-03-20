"""
Activity Tracker — debounced last_active_at updates for authenticated users.

Called as a fire-and-forget asyncio task from verify_token after each successful
authentication. Debounced to 1 write per user per hour to avoid Firestore cost
amplification on high-traffic sessions.

Pattern: python-production-coding (no fire-and-forget without error handling).
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from src.db.firebase_client import get_async_firestore_client
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

# In-memory debounce cache: uid → last_written_at
# Single-replica (Cloud Run) so this is safe. Would use Redis on multi-replica.
_last_touch: dict[str, datetime] = {}
_DEBOUNCE_HOURS = 1


async def touch_last_active(uid: str) -> None:
    """
    Updates users/{uid}.last_active_at in Firestore, debounced to once per hour.

    Non-fatal: all exceptions are caught and logged. Never raises.
    Skips anonymous users (no persistent profile).
    """
    try:
        now = utc_now()
        last = _last_touch.get(uid)
        if last and (now - last) < timedelta(hours=_DEBOUNCE_HOURS):
            return  # Too recent — skip write

        db = get_async_firestore_client()
        await db.collection("users").document(uid).set(
            {"last_active_at": now},
            merge=True,
        )
        _last_touch[uid] = now
        logger.debug("[ActivityTracker] Touched last_active_at for uid=%s", uid)

    except Exception as exc:
        # Non-fatal: activity tracking must never block a user request
        logger.warning("[ActivityTracker] Failed to update last_active_at for uid=%s: %s", uid, exc)


def schedule_touch(uid: str) -> None:
    """
    Schedules touch_last_active as a background asyncio task.

    Safe to call from FastAPI Depends (runs inside the event loop).
    Stores task reference on the running loop to prevent garbage collection.
    """
    try:
        loop = asyncio.get_running_loop()
        task = loop.create_task(touch_last_active(uid))

        # Swallow exceptions inside the task so they don't surface as unhandled
        task.add_done_callback(
            lambda t: t.exception() if not t.cancelled() else None
        )
    except RuntimeError:
        # No running loop (e.g. test context) — ignore silently
        pass
