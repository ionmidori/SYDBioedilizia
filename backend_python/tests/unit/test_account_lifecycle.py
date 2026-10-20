"""GDPR inactivity lifecycle: 12 months → warning, 13 → disabled, 24 → erased.

Regression: the selection queries filtered `lifecycle_*_at == None`, which in
Firestore never matches documents WITHOUT the field — and no code writes those
fields as null. In production the phase-1 query returned 0 of 4 users even with
threshold "now". These tests run against the fake, which now has the same
semantics as Firestore.
"""
from datetime import UTC, datetime, timedelta

import pytest
from src.services.account_lifecycle_service import AccountLifecycleService
from src.services.auth_gateway import AuthContact
from src.services.erasure.models import ErasureMode, ErasureReport, ErasureStatus
from tests.unit.firestore_fakes import FakeDb

NOW = datetime(2026, 10, 17, 3, 0, tzinfo=UTC)
MONTH = timedelta(days=365.25 / 12)


def months_ago(n: float) -> datetime:
    return NOW - n * MONTH


class FakeNotify:
    def __init__(self, *, delivered: bool = True) -> None:
        self.delivered = delivered
        self.sent: list[tuple[str, str, int]] = []

    async def send_inactivity_warning(self, email: str, display_name: str, disable_in_days: int) -> bool:
        self.sent.append((email, display_name, disable_in_days))
        return self.delivered


class FakeAuth:
    def __init__(self, contacts: dict[str, AuthContact | None] | None = None) -> None:
        self.contacts = contacts or {}
        self.disabled: list[str] = []

    async def get_contact(self, uid: str) -> AuthContact | None:
        return self.contacts.get(uid, AuthContact(email=f"{uid}@example.it", display_name=None))

    async def disable_and_revoke(self, uid: str) -> bool:
        self.disabled.append(uid)
        return True

    async def delete_user(self, uid: str) -> bool:  # pragma: no cover - the erasure service does it
        return True


class FakeErasure:
    def __init__(self, status: ErasureStatus = ErasureStatus.COMPLETED, resumed: list[ErasureReport] | None = None):
        self.status = status
        self.calls: list[tuple[str, ErasureMode, str]] = []
        self.resumed = resumed or []

    async def erase(self, uid: str, mode: ErasureMode, *, requested_by: str) -> ErasureReport:
        self.calls.append((uid, mode, requested_by))
        failed_step = "storage" if self.status is ErasureStatus.FAILED else None
        return ErasureReport(uid=uid, mode=mode, status=self.status, failed_step=failed_step)

    async def resume_incomplete(self, *, limit: int) -> list[ErasureReport]:
        if isinstance(self.resumed, Exception):
            raise self.resumed
        return self.resumed


def _service(db, *, notify=None, auth=None, erasure=None) -> AccountLifecycleService:
    return AccountLifecycleService(
        db=db, notify=notify or FakeNotify(), auth=auth or FakeAuth(), erasure=erasure or FakeErasure(),
        now=lambda: NOW, warn_months=12, disable_months=13, anonymize_months=24,
    )


# ── Phase 1: warning ─────────────────────────────────────────────────────────

async def test_a_real_user_document_without_lifecycle_fields_is_warned():
    # Production shape: users/{uid} holds ONLY last_active_at.
    db, notify = FakeDb(), FakeNotify()
    db.put("users", "u1", {"last_active_at": months_ago(12.5)})

    result = await _service(db, notify=notify).run_lifecycle_pass()

    assert result.warned == 1
    assert notify.sent == [("u1@example.it", "Utente", 30)]
    assert db.get_data("users", "u1")["lifecycle_warned_at"] == NOW


async def test_active_users_are_left_alone():
    db, notify = FakeDb(), FakeNotify()
    db.put("users", "u1", {"last_active_at": months_ago(11)})

    result = await _service(db, notify=notify).run_lifecycle_pass()

    assert (result.warned, result.disabled, result.anonymized) == (0, 0, 0)
    assert notify.sent == []


async def test_the_warning_uses_the_firebase_auth_name():
    db, notify = FakeDb(), FakeNotify()
    db.put("users", "u1", {"last_active_at": months_ago(13)})
    auth = FakeAuth({"u1": AuthContact(email="mario@example.it", display_name="Mario")})

    await _service(db, notify=notify, auth=auth).run_lifecycle_pass()

    assert notify.sent == [("mario@example.it", "Mario", 30)]


async def test_an_account_without_email_is_not_marked_as_warned():
    db, notify = FakeDb(), FakeNotify()
    db.put("users", "u1", {"last_active_at": months_ago(13)})
    auth = FakeAuth({"u1": AuthContact(email=None, display_name=None)})

    result = await _service(db, notify=notify, auth=auth).run_lifecycle_pass()

    assert notify.sent == []
    assert "lifecycle_warned_at" not in db.get_data("users", "u1")
    # Not silently skipped forever: it shows up in /admin for a manual decision.
    assert result.errors == ["warn:u1:no_email"]


async def test_an_account_missing_from_firebase_auth_is_reported_not_erased():
    # Could also be a misconfigured Auth project: never treat it as consent to erase.
    db = FakeDb()
    db.put("users", "u1", {"last_active_at": months_ago(30)})

    result = await _service(db, auth=FakeAuth({"u1": None})).run_lifecycle_pass()

    assert result.errors == ["warn:u1:no_account"]
    assert db.get_data("users", "u1") == {"last_active_at": months_ago(30)}


async def test_an_undelivered_warning_does_not_start_the_countdown():
    db = FakeDb()
    db.put("users", "u1", {"last_active_at": months_ago(13)})

    result = await _service(db, notify=FakeNotify(delivered=False)).run_lifecycle_pass()

    assert result.warned == 0
    assert result.errors == ["warn:u1:not_delivered"]
    assert "lifecycle_warned_at" not in db.get_data("users", "u1")


# ── Phase 2: disable ─────────────────────────────────────────────────────────

async def test_a_user_warned_long_enough_ago_is_disabled():
    db, auth = FakeDb(), FakeAuth()
    db.put("users", "u1", {"last_active_at": months_ago(14), "lifecycle_warned_at": NOW - timedelta(days=31)})

    result = await _service(db, auth=auth).run_lifecycle_pass()

    assert result.disabled == 1
    assert auth.disabled == ["u1"]
    assert db.get_data("users", "u1")["lifecycle_disabled_at"] == NOW


async def test_no_disable_before_the_notice_period_has_passed():
    # Catching up (e.g. a user inactive for 30 months): the warning must come
    # with its full notice period, not together with the disable.
    db, auth = FakeDb(), FakeAuth()
    db.put("users", "u1", {"last_active_at": months_ago(30), "lifecycle_warned_at": NOW - timedelta(days=5)})

    result = await _service(db, auth=auth).run_lifecycle_pass()

    assert result.disabled == 0
    assert auth.disabled == []


async def test_one_step_per_run_even_for_a_long_inactive_user():
    db, auth, erasure = FakeDb(), FakeAuth(), FakeErasure()
    db.put("users", "u1", {"last_active_at": months_ago(30)})

    result = await _service(db, auth=auth, erasure=erasure).run_lifecycle_pass()

    assert (result.warned, result.disabled, result.anonymized) == (1, 0, 0)
    assert auth.disabled == [] and erasure.calls == []


# ── Phase 3: erase ───────────────────────────────────────────────────────────

async def test_a_disabled_user_inactive_for_24_months_is_erased():
    db, erasure = FakeDb(), FakeErasure()
    db.put("users", "u1", {"last_active_at": months_ago(25),
                           "lifecycle_warned_at": months_ago(13), "lifecycle_disabled_at": months_ago(12)})

    result = await _service(db, erasure=erasure).run_lifecycle_pass()

    assert result.anonymized == 1
    assert erasure.calls == [("u1", ErasureMode.INACTIVITY, "lifecycle")]


async def test_no_erasure_right_after_a_late_disable():
    db, erasure = FakeDb(), FakeErasure()
    db.put("users", "u1", {"last_active_at": months_ago(30),
                           "lifecycle_warned_at": NOW - timedelta(days=40),
                           "lifecycle_disabled_at": NOW - timedelta(days=3)})

    await _service(db, erasure=erasure).run_lifecycle_pass()

    assert erasure.calls == []


async def test_an_unfinished_erasure_is_an_error_not_a_success():
    db = FakeDb()
    db.put("users", "u1", {"last_active_at": months_ago(25),
                           "lifecycle_warned_at": months_ago(13), "lifecycle_disabled_at": months_ago(12)})

    result = await _service(db, erasure=FakeErasure(status=ErasureStatus.FAILED)).run_lifecycle_pass()

    assert result.anonymized == 0
    assert result.errors == ["anonymize:u1:storage"]


async def test_tombstones_are_never_selected_again():
    db, erasure, notify = FakeDb(), FakeErasure(), FakeNotify()
    # What the erasure leaves: no last_active_at, lifecycle markers, anonymized.
    db.put("users", "u1", {"lifecycle_warned_at": months_ago(13), "lifecycle_disabled_at": months_ago(12),
                           "lifecycle_anonymized_at": NOW - timedelta(days=1), "anonymized": True})

    result = await _service(db, erasure=erasure, notify=notify).run_lifecycle_pass()

    assert (result.warned, result.disabled, result.anonymized) == (0, 0, 0)


# ── Resuming erasures ────────────────────────────────────────────────────────

async def test_the_pass_finishes_erasures_left_halfway():
    resumed = [
        ErasureReport(uid="u9", mode=ErasureMode.INACTIVITY, status=ErasureStatus.COMPLETED),
        ErasureReport(uid="u8", mode=ErasureMode.ACCOUNT_DELETION, status=ErasureStatus.FAILED, failed_step="storage"),
    ]

    result = await _service(FakeDb(), erasure=FakeErasure(resumed=resumed)).run_lifecycle_pass()

    assert result.anonymized == 1
    assert result.errors == ["resume:u8:storage"]


async def test_a_cancelled_erasure_is_neither_a_success_nor_an_error():
    # The user came back while the erasure waited: nothing to report as broken.
    resumed = [ErasureReport(uid="u9", mode=ErasureMode.INACTIVITY, status=ErasureStatus.CANCELLED,
                             failed_step="user_active_again")]
    db = FakeDb()
    db.put("users", "u1", {"last_active_at": months_ago(25),
                           "lifecycle_warned_at": months_ago(13), "lifecycle_disabled_at": months_ago(12)})

    result = await _service(
        db, erasure=FakeErasure(status=ErasureStatus.CANCELLED, resumed=resumed)
    ).run_lifecycle_pass()

    assert (result.anonymized, result.errors) == (0, [])


async def test_a_failing_resume_does_not_stop_the_pass():
    db = FakeDb()
    db.put("users", "u1", {"last_active_at": months_ago(13)})

    result = await _service(db, erasure=FakeErasure(resumed=RuntimeError("firestore down"))).run_lifecycle_pass()

    assert result.warned == 1
    assert result.errors == ["resume:RuntimeError"]


class _BrokenStream:
    async def stream(self):
        raise RuntimeError("deadline exceeded")
        yield  # pragma: no cover


async def test_a_broken_user_query_is_reported_not_raised(monkeypatch):
    db = FakeDb()
    monkeypatch.setattr(db, "collection", lambda name: _QueryRoot())

    result = await _service(db).run_lifecycle_pass()

    assert result.errors == ["users:RuntimeError"]


class _QueryRoot:
    def where(self, *args, **kwargs):
        return _BrokenStream()


@pytest.mark.parametrize("months", [12, 13, 24])
def test_months_are_calendar_months_not_30_days(months):
    service = _service(FakeDb())
    # 24 "months" of 30 days fall 10 days short of two years.
    assert service._months_ago(months) == NOW - timedelta(days=months * 365.25 / 12)
