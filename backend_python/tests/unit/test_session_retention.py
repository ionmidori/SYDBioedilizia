"""Only guest sessions may carry `expireAt` (Firestore TTL on sessions/messages)."""
from datetime import UTC, datetime, timedelta

import pytest
from src.auth.user_lookup import AccountKind
from src.db import batching
from src.db.session_retention import (
    EXPIRE_AT,
    GUEST_SESSION_TTL,
    BackfillReport,
    backfill_registered_sessions,
    clear_session_expiry,
    expiry_fields,
    make_user_sessions_permanent,
)
from tests.unit.firestore_fakes import FakeDb

NOW = datetime(2026, 10, 16, 12, 0, tzinfo=UTC)
OLD_EXPIRY = NOW + timedelta(days=3)


class TestExpiryFields:
    def test_guest_writes_expire_after_the_guest_ttl(self):
        assert expiry_fields(is_guest=True, now=NOW) == {EXPIRE_AT: NOW + GUEST_SESSION_TTL}

    def test_guest_ttl_is_thirty_days(self):
        assert timedelta(days=30) == GUEST_SESSION_TTL

    def test_registered_writes_carry_no_expiry(self):
        assert expiry_fields(is_guest=False, now=NOW) == {}

    def test_default_now_is_current_time(self):
        before = datetime.now(UTC)
        expiry = expiry_fields(is_guest=True)[EXPIRE_AT]
        assert before + GUEST_SESSION_TTL <= expiry <= datetime.now(UTC) + GUEST_SESSION_TTL

    def test_each_call_returns_a_fresh_dict(self):
        first = expiry_fields(is_guest=True, now=NOW)
        first[EXPIRE_AT] = None
        assert expiry_fields(is_guest=True, now=NOW)[EXPIRE_AT] == NOW + GUEST_SESSION_TTL


def _seed_session(db: FakeDb, session_id: str, n_messages: int, *, owner: str = "u1", **extra) -> None:
    db.put("sessions", session_id, {"userId": owner, EXPIRE_AT: OLD_EXPIRY, "title": "Cucina", **extra})
    db.put("projects", session_id, {"userId": owner, EXPIRE_AT: OLD_EXPIRY, "name": "Cucina", **extra})
    for i in range(n_messages):
        db.put("sessions", session_id, "messages", f"m{i}", {"content": f"msg {i}", EXPIRE_AT: OLD_EXPIRY})


def _soft_deleted() -> dict:
    return {"is_deleted": True, "deleted_at": NOW}


class TestClearSessionExpiry:
    async def test_removes_expiry_from_messages_session_and_projection(self):
        db = FakeDb()
        _seed_session(db, "s1", 3)

        cleared = await clear_session_expiry(db, "s1")

        assert cleared == 3
        for i in range(3):
            assert EXPIRE_AT not in db.get_data("sessions", "s1", "messages", f"m{i}")
        assert db.get_data("sessions", "s1") == {"userId": "u1", "title": "Cucina"}
        assert db.get_data("projects", "s1") == {"userId": "u1", "name": "Cucina"}

    async def test_soft_deleted_project_keeps_its_purge_marker(self):
        # expireAt on a soft-deleted project is the 30-day GDPR purge, not a guest TTL.
        db = FakeDb()
        _seed_session(db, "s1", 2, **_soft_deleted())

        assert await clear_session_expiry(db, "s1") == 0
        assert db.get_data("sessions", "s1")[EXPIRE_AT] == OLD_EXPIRY
        assert db.get_data("projects", "s1")[EXPIRE_AT] == OLD_EXPIRY
        assert db.get_data("sessions", "s1", "messages", "m0")[EXPIRE_AT] == OLD_EXPIRY

    async def test_leaves_other_sessions_untouched(self):
        db = FakeDb()
        _seed_session(db, "s1", 1)
        _seed_session(db, "other", 1)

        await clear_session_expiry(db, "s1")

        assert db.get_data("sessions", "other")[EXPIRE_AT] == OLD_EXPIRY
        assert db.get_data("sessions", "other", "messages", "m0")[EXPIRE_AT] == OLD_EXPIRY

    async def test_skips_messages_without_expiry(self):
        db = FakeDb()
        _seed_session(db, "s1", 2)
        db.put("sessions", "s1", "messages", "permanent", {"content": "old"})

        assert await clear_session_expiry(db, "s1") == 2
        assert db.get_data("sessions", "s1", "messages", "permanent") == {"content": "old"}

    async def test_never_creates_missing_documents(self):
        db = FakeDb()
        db.put("sessions", "s1", "messages", "m0", {"content": "x", EXPIRE_AT: OLD_EXPIRY})

        await clear_session_expiry(db, "s1")

        assert db.get_data("sessions", "s1") is None
        assert db.get_data("projects", "s1") is None
        assert EXPIRE_AT not in db.get_data("sessions", "s1", "messages", "m0")

    async def test_writes_messages_in_bounded_batches(self, monkeypatch):
        monkeypatch.setattr(batching, "WRITE_BATCH_SIZE", 2)
        db = FakeDb()
        _seed_session(db, "s1", 5)

        assert await clear_session_expiry(db, "s1") == 5
        assert db.batches == 3  # 2 + 2 + 1

    async def test_is_idempotent(self):
        db = FakeDb()
        _seed_session(db, "s1", 2)

        await clear_session_expiry(db, "s1")
        assert await clear_session_expiry(db, "s1") == 0
        assert db.get_data("sessions", "s1") == {"userId": "u1", "title": "Cucina"}


class TestMakeUserSessionsPermanent:
    async def test_clears_every_marked_live_session_of_the_user(self):
        db = FakeDb()
        _seed_session(db, "a", 1, owner="uid-1")
        _seed_session(db, "b", 2, owner="uid-1")
        _seed_session(db, "deleted", 1, owner="uid-1", **_soft_deleted())
        _seed_session(db, "someone-else", 1, owner="uid-2")
        db.put("sessions", "permanent", {"userId": "uid-1"})

        assert await make_user_sessions_permanent(db, "uid-1") == 2

        for sid in ("a", "b"):
            assert EXPIRE_AT not in db.get_data("sessions", sid)
            assert EXPIRE_AT not in db.get_data("sessions", sid, "messages", "m0")
        assert db.get_data("sessions", "deleted")[EXPIRE_AT] == OLD_EXPIRY
        assert db.get_data("sessions", "someone-else")[EXPIRE_AT] == OLD_EXPIRY

    async def test_empty_uid_touches_nothing(self):
        db = FakeDb()
        _seed_session(db, "a", 1, owner="")

        assert await make_user_sessions_permanent(db, "") == 0
        assert db.get_data("sessions", "a")[EXPIRE_AT] == OLD_EXPIRY


class _Accounts:
    """Fake account lookup: records calls, returns a fixed kind per uid."""

    def __init__(self, kinds: dict[str, AccountKind]) -> None:
        self.kinds = kinds
        self.calls: list[str] = []

    async def __call__(self, uid: str) -> AccountKind:
        self.calls.append(uid)
        return self.kinds[uid]


def _seed_owned(db: FakeDb, session_id: str, owner: str | None, *, marked: bool = True, **extra) -> None:
    data: dict = {"title": session_id, **extra}
    if owner is not None:
        data["userId"] = owner
    if marked:
        data[EXPIRE_AT] = OLD_EXPIRY
    db.put("sessions", session_id, data)
    for i in range(2):
        db.put("sessions", session_id, "messages", f"m{i}", {"content": "x", EXPIRE_AT: OLD_EXPIRY})


class TestBackfillRegisteredSessions:
    async def test_dry_run_reports_without_writing(self):
        db = FakeDb()
        _seed_owned(db, "reg", "uid-reg")
        before = dict(db.docs)

        report = await backfill_registered_sessions(db, _Accounts({"uid-reg": AccountKind.REGISTERED}), apply=False)

        assert report == BackfillReport(applied=False, scanned=1, made_permanent=1, messages=2)
        assert db.docs == before

    async def test_apply_makes_registered_sessions_permanent(self):
        db = FakeDb()
        _seed_owned(db, "reg", "uid-reg")

        report = await backfill_registered_sessions(db, _Accounts({"uid-reg": AccountKind.REGISTERED}), apply=True)

        assert report == BackfillReport(applied=True, scanned=1, made_permanent=1, messages=2)
        assert EXPIRE_AT not in db.get_data("sessions", "reg")
        assert EXPIRE_AT not in db.get_data("sessions", "reg", "messages", "m0")

    async def test_soft_deleted_projects_keep_their_purge_marker(self):
        db = FakeDb()
        _seed_owned(db, "gone", "uid-reg", **_soft_deleted())
        accounts = _Accounts({"uid-reg": AccountKind.REGISTERED})

        report = await backfill_registered_sessions(db, accounts, apply=True)

        assert report == BackfillReport(applied=True, scanned=1, soft_deleted=1)
        assert accounts.calls == []
        assert db.get_data("sessions", "gone")[EXPIRE_AT] == OLD_EXPIRY

    async def test_guest_sessions_keep_their_expiry(self):
        db = FakeDb()
        _seed_owned(db, "placeholder", "guest_abcd1234")
        _seed_owned(db, "anon", "uid-anon")
        _seed_owned(db, "no-owner", None)
        accounts = _Accounts({"uid-anon": AccountKind.ANONYMOUS})

        report = await backfill_registered_sessions(db, accounts, apply=True)

        assert report == BackfillReport(applied=True, scanned=3, guest=3)
        assert accounts.calls == ["uid-anon"]  # guest_* and unowned need no lookup
        for sid in ("placeholder", "anon", "no-owner"):
            assert db.get_data("sessions", sid)[EXPIRE_AT] == OLD_EXPIRY

    async def test_sessions_of_deleted_accounts_are_reported_not_touched(self):
        db = FakeDb()
        _seed_owned(db, "orphan", "uid-gone")

        report = await backfill_registered_sessions(db, _Accounts({"uid-gone": AccountKind.MISSING}), apply=True)

        assert report == BackfillReport(applied=True, scanned=1, orphaned=1)
        assert db.get_data("sessions", "orphan")[EXPIRE_AT] == OLD_EXPIRY

    async def test_unmarked_sessions_are_skipped_without_lookup(self):
        db = FakeDb()
        _seed_owned(db, "permanent", "uid-reg", marked=False)
        accounts = _Accounts({})

        report = await backfill_registered_sessions(db, accounts, apply=True)

        assert report == BackfillReport(applied=True, scanned=1)
        assert accounts.calls == []

    async def test_each_account_is_looked_up_once(self):
        db = FakeDb()
        _seed_owned(db, "a", "uid-reg")
        _seed_owned(db, "b", "uid-reg")
        accounts = _Accounts({"uid-reg": AccountKind.REGISTERED})

        report = await backfill_registered_sessions(db, accounts, apply=True)

        assert accounts.calls == ["uid-reg"]
        assert report.made_permanent == 2

    async def test_lookup_errors_stop_the_backfill(self):
        db = FakeDb()
        _seed_owned(db, "reg", "uid-reg")

        async def failing(_uid: str) -> AccountKind:
            raise RuntimeError("auth down")

        with pytest.raises(RuntimeError):
            await backfill_registered_sessions(db, failing, apply=True)
        assert db.get_data("sessions", "reg")[EXPIRE_AT] == OLD_EXPIRY
