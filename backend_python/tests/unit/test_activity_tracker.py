"""Activity tracker: a registered user seen by the backend keeps all their projects."""
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from src.auth import activity_tracker
from tests.unit.firestore_fakes import FakeDb

EXPIRY = datetime(2026, 11, 1, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _reset_debounce():
    activity_tracker._last_touch.clear()
    yield
    activity_tracker._last_touch.clear()


def _db_with_marked_sessions() -> FakeDb:
    db = FakeDb()
    # Created while the account was anonymous; the user signed up afterwards and
    # never wrote to "b" again — it must not be lost to the guest TTL.
    for sid in ("a", "b"):
        db.put("sessions", sid, {"userId": "uid-1", "expireAt": EXPIRY})
        db.put("sessions", sid, "messages", "m0", {"content": "x", "expireAt": EXPIRY})
    return db


async def test_touch_makes_the_users_sessions_permanent():
    db = _db_with_marked_sessions()

    with patch.object(activity_tracker, "get_async_firestore_client", return_value=db):
        await activity_tracker.touch_last_active("uid-1")

    assert "last_active_at" in db.get_data("users", "uid-1")
    for sid in ("a", "b"):
        assert "expireAt" not in db.get_data("sessions", sid)
        assert "expireAt" not in db.get_data("sessions", sid, "messages", "m0")


async def test_touch_is_debounced():
    db = _db_with_marked_sessions()

    with patch.object(activity_tracker, "get_async_firestore_client", return_value=db):
        await activity_tracker.touch_last_active("uid-1")
        db.put("sessions", "c", {"userId": "uid-1", "expireAt": EXPIRY})
        await activity_tracker.touch_last_active("uid-1")

    assert db.get_data("sessions", "c")["expireAt"] == EXPIRY  # second call skipped


async def test_touch_runs_again_after_the_debounce_window():
    db = _db_with_marked_sessions()
    activity_tracker._last_touch["uid-1"] = datetime.now(UTC) - timedelta(hours=2)

    with patch.object(activity_tracker, "get_async_firestore_client", return_value=db):
        await activity_tracker.touch_last_active("uid-1")

    assert "expireAt" not in db.get_data("sessions", "a")
