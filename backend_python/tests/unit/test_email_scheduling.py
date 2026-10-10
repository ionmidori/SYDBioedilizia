"""Event-driven dispatch scheduling (owner's requirement: no job every 5
minutes around the clock — a Cloud Task only when there is an email)."""
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from src.services.email import outbox, scheduling
from src.services.email.console import ConsoleProvider
from src.services.email.types import OutboundEmail, ProviderError, ProviderResult
from tests.unit.firestore_fakes import FakeDb, FakeTransaction
from tests.unit.test_email_outbox import NOW, PID, _seed

AT = datetime(2026, 10, 11, 10, 4, tzinfo=UTC)


@pytest.fixture
def configured(monkeypatch):
    s = scheduling.settings
    monkeypatch.setattr(s, "EMAIL_TASKS_QUEUE", "syd-email-outbox")
    monkeypatch.setattr(s, "EMAIL_TASKS_LOCATION", "europe-west1")
    monkeypatch.setattr(s, "EMAIL_INTERNAL_BASE_URL", "https://syd-brain.example.run.app/")
    monkeypatch.setattr(s, "EMAIL_INTERNAL_AUDIENCE", "https://syd-brain.example.run.app")
    monkeypatch.setattr(s, "EMAIL_INTERNAL_INVOKER_EMAIL", "syd-email-sweeper@p.iam.gserviceaccount.com")
    monkeypatch.setattr(s, "GOOGLE_CLOUD_PROJECT", "p")


def test_task_targets_the_dispatch_endpoint_with_oidc(configured):
    task = scheduling.build_task("abc123", AT, "safety")
    assert task["name"] == "projects/p/locations/europe-west1/queues/syd-email-outbox/tasks/abc123-safety"
    assert task["scheduleTime"] == "2026-10-11T10:04:00Z"
    http = task["httpRequest"]
    assert http["httpMethod"] == "POST"
    assert http["url"] == "https://syd-brain.example.run.app/internal/email/dispatch/abc123"
    assert http["oidcToken"] == {
        "serviceAccountEmail": "syd-email-sweeper@p.iam.gserviceaccount.com",
        "audience": "https://syd-brain.example.run.app",
    }


async def test_not_configured_is_a_logged_no_op(monkeypatch):
    monkeypatch.setattr(scheduling.settings, "EMAIL_TASKS_QUEUE", None)
    with patch.object(scheduling, "_create_task_sync") as create:
        assert await scheduling.schedule_dispatch("abc123", AT, "safety") is False
    create.assert_not_called()


@pytest.mark.parametrize("status,ok", [(200, True), (409, True), (403, False), (500, False)])
async def test_already_scheduled_is_fine_other_errors_are_reported(configured, status, ok):
    with patch.object(scheduling, "_create_task_sync", return_value=status):
        assert await scheduling.schedule_dispatch("abc123", AT, "safety") is ok


async def test_scheduling_never_raises(configured):
    with patch.object(scheduling, "_create_task_sync", side_effect=OSError("metadata server down")):
        assert await scheduling.schedule_dispatch("abc123", AT, "safety") is False


# ── When the outbox schedules (and when it does not) ──────────────────────────


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()

    async def transact(_db, body):
        return await body(FakeTransaction(fake))

    monkeypatch.setattr(outbox, "_transact", transact)
    monkeypatch.setattr(outbox, "_download_sync", lambda path: b"%PDF")
    return fake


@pytest.fixture
def scheduled(monkeypatch):
    mock = AsyncMock(return_value=True)
    monkeypatch.setattr(outbox, "schedule_dispatch", mock)
    return mock


async def _enqueue(db, key="key-0001"):
    return await outbox.enqueue_quote_delivery(
        db, PID, to="m@x.it", cc=[], subject=None, message=None, actor="a", idempotency_key=key, now=NOW
    )


async def test_one_safety_task_per_queued_email_none_for_a_duplicate(db, scheduled):
    _seed(db)
    first = await _enqueue(db)
    scheduled.assert_awaited_once_with(first.delivery_id, NOW + outbox.SAFETY_DELAY, "safety")
    await _enqueue(db)  # same Idempotency-Key
    assert scheduled.await_count == 1


async def test_admin_notification_gets_its_safety_task(db, scheduled):
    outbox_id = await outbox.enqueue_message(db, kind="admin_notification", to="a@x.it", subject="s",
                                             text="t", html=None, now=NOW)
    scheduled.assert_awaited_once_with(outbox_id, NOW + outbox.SAFETY_DELAY, "safety")


async def test_successful_send_schedules_nothing_more(db, scheduled):
    _seed(db)
    queued = await _enqueue(db)
    scheduled.reset_mock()
    assert await outbox.dispatch_one(db, queued.delivery_id, ConsoleProvider(), NOW) == "sent"
    scheduled.assert_not_awaited()


class _Failing:
    name = "smtp"

    def __init__(self, permanent: bool) -> None:
        self.permanent = permanent

    async def send(self, email: OutboundEmail) -> ProviderResult:
        raise ProviderError("down", permanent=self.permanent)


async def test_transient_failure_schedules_exactly_the_retry(db, scheduled):
    _seed(db)
    queued = await _enqueue(db)
    scheduled.reset_mock()
    assert await outbox.dispatch_one(db, queued.delivery_id, _Failing(False), NOW) == "retry"
    scheduled.assert_awaited_once_with(queued.delivery_id, NOW + timedelta(minutes=1), "a2")
    assert db.get_data("email_outbox", queued.delivery_id)["next_attempt_at"] == NOW + timedelta(minutes=1)


async def test_dead_letter_schedules_nothing(db, scheduled):
    _seed(db)
    queued = await _enqueue(db)
    scheduled.reset_mock()
    assert await outbox.dispatch_one(db, queued.delivery_id, _Failing(True), NOW) == "dead"
    scheduled.assert_not_awaited()
