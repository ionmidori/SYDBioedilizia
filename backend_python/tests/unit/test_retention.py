"""Retention job: data whose retention period has ended is erased completely
(Firestore trees + Storage), and nothing else ever is."""
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from src.auth.user_lookup import AccountKind
from src.services.erasure.legal_hold import SENT_QUOTE_RETENTION
from src.services.retention import service as retention_service
from src.services.retention.service import RetentionService
from tests.unit.firestore_fakes import FakeBucket, FakeDb

NOW = datetime(2026, 10, 25, 3, 0, tzinfo=UTC)
SENT = datetime(2026, 2, 1, 10, 0, tzinfo=UTC)
PDF = "projects/d1/quotes/PRV-2026-0007_r1.pdf"


class FakeAccounts:
    """Firebase Auth lookups: unknown uids are registered accounts."""

    def __init__(self, kinds: dict[str, AccountKind] | None = None, broken: frozenset[str] = frozenset()) -> None:
        self.kinds = kinds or {}
        self.broken = broken
        self.calls: list[str] = []

    async def __call__(self, uid: str) -> AccountKind:
        self.calls.append(uid)
        if uid in self.broken:
            raise RuntimeError("auth unavailable")
        return self.kinds.get(uid, AccountKind.REGISTERED)


class SteppingClock:
    """time.monotonic double: every reading is `step` seconds after the last."""

    def __init__(self, step: float) -> None:
        self.step, self.now = step, 0.0

    def __call__(self) -> float:
        value, self.now = self.now, self.now + self.step
        return value


@pytest.fixture(autouse=True)
def _audit():
    with patch.object(retention_service, "emit_audit_event") as emit:
        yield emit


def _service(db: FakeDb, bucket: FakeBucket, *, apply: bool = True, accounts: FakeAccounts | None = None,
             monotonic=None, limit: int = 100) -> RetentionService:
    return RetentionService(
        db=db, bucket=bucket, account_kind=accounts or FakeAccounts(), apply=apply,
        now=lambda: NOW, monotonic=monotonic or SteppingClock(0), limit=limit,
    )


def _guest_project(db: FakeDb, bucket: FakeBucket, pid: str = "g1", *, owner: str = "guest_abc",
                   expire_at: datetime = NOW - timedelta(days=1)) -> None:
    db.put("sessions", pid, {"userId": owner, "title": "Bagno", "expireAt": expire_at})
    db.put("sessions", pid, "messages", "m1", {"content": "abito in via Roma 1", "expireAt": expire_at})
    db.put("sessions", pid, "files", "f1", {"name": "bagno.jpg"})
    db.put("sessions", pid, "feedback", "fb1", {"ok": True})
    db.put("projects", pid, {"userId": owner, "name": "Bagno"})
    db.put("projects", pid, "files", "f1", {"url": "https://signed"})
    bucket.names |= {f"user-uploads/{pid}/bagno.jpg", f"renders/{pid}/render.png"}


def _registered_project(db: FakeDb, bucket: FakeBucket, pid: str = "r1", owner: str = "u1", **session) -> None:
    db.put("sessions", pid, {"userId": owner, "title": "Cucina", **session})
    db.put("sessions", pid, "messages", "m1", {"content": "ciao"})
    db.put("projects", pid, {"userId": owner, "name": "Cucina", "is_deleted": False})
    bucket.names |= {f"user-uploads/{pid}/cucina.jpg"}


def _of(db: FakeDb, bucket: FakeBucket, pid: str) -> tuple[set, set]:
    docs = {p for p in db.docs if len(p) > 1 and p[1] == pid and p[0] in ("sessions", "projects")}
    blobs = {n for n in bucket.names if n.split("/")[1] == pid}
    return docs, blobs


def _gone(db: FakeDb, bucket: FakeBucket, pid: str) -> bool:
    return _of(db, bucket, pid) == (set(), set())


# ── Guest sessions past their 30-day expiry ──────────────────────────────────

async def test_an_expired_guest_project_is_erased_entirely_and_nothing_else():
    db, bucket = FakeDb(), FakeBucket()
    _guest_project(db, bucket, "g1")
    _guest_project(db, bucket, "g2", expire_at=NOW + timedelta(days=5))
    _registered_project(db, bucket, "r1")
    before = {pid: _of(db, bucket, pid) for pid in ("g2", "r1")}

    report = await _service(db, bucket).run()

    assert report.guest_sessions == 1
    assert _gone(db, bucket, "g1")
    assert {pid: _of(db, bucket, pid) for pid in ("g2", "r1")} == before


@pytest.mark.parametrize("kind", [AccountKind.ANONYMOUS, AccountKind.MISSING])
async def test_an_expired_session_of_an_anonymous_or_deleted_account_is_erased(kind):
    db, bucket = FakeDb(), FakeBucket()
    _guest_project(db, bucket, "g1", owner="anon-uid")

    report = await _service(db, bucket, accounts=FakeAccounts({"anon-uid": kind})).run()

    assert report.guest_sessions == 1
    assert _gone(db, bucket, "g1")


async def test_a_registered_users_project_is_never_erased_by_a_stale_guest_expiry():
    db, bucket = FakeDb(), FakeBucket()
    _guest_project(db, bucket, "s1", owner="u1")  # upgraded account, expiry never cleared
    before = _of(db, bucket, "s1")

    report = await _service(db, bucket).run()

    assert (report.guest_sessions, report.made_permanent) == (0, 1)
    assert _of(db, bucket, "s1") == before
    assert "expireAt" not in db.get_data("sessions", "s1")
    assert "expireAt" not in db.get_data("sessions", "s1", "messages", "m1")


async def test_an_owner_that_cannot_be_looked_up_keeps_the_project_and_is_reported():
    db, bucket = FakeDb(), FakeBucket()
    _guest_project(db, bucket, "g1", owner="anon-uid")

    report = await _service(db, bucket, accounts=FakeAccounts(broken=frozenset({"anon-uid"}))).run()

    assert report.guest_sessions == 0
    assert report.errors == ["retention:guest_session:RuntimeError"]
    assert db.get_data("sessions", "g1") is not None


# ── Projects in the bin for more than 30 days ────────────────────────────────

async def test_a_project_in_the_bin_for_more_than_30_days_is_erased():
    db, bucket = FakeDb(), FakeBucket()
    _registered_project(db, bucket, "d1", is_deleted=True, deleted_at=NOW - timedelta(days=31))

    report = await _service(db, bucket).run()

    assert report.deleted_projects == 1
    assert _gone(db, bucket, "d1")


async def test_a_project_in_the_bin_for_less_than_30_days_can_still_be_recovered():
    db, bucket = FakeDb(), FakeBucket()
    _registered_project(db, bucket, "d1", is_deleted=True, deleted_at=NOW - timedelta(days=29))
    before = _of(db, bucket, "d1")

    report = await _service(db, bucket).run()

    assert report.deleted_projects == 0
    assert _of(db, bucket, "d1") == before


async def test_a_sent_quote_of_an_erased_project_stays_under_legal_hold():
    db, bucket = FakeDb(), FakeBucket([PDF])
    _registered_project(db, bucket, "d1", is_deleted=True, deleted_at=NOW - timedelta(days=31))
    db.put("projects", "d1", "private_data", "quote", {"status": "sent", "sent_at": SENT, "pdf_blob_path": PDF,
                                                      "client_snapshot": {"email": "mario@example.it"}})
    db.put("projects", "d1", "private_data", "quote", "deliveries", "x1", {"sent_at": SENT, "pdf_blob_path": PDF})

    await _service(db, bucket).run()

    assert db.get_data("projects", "d1", "private_data", "quote")["client_snapshot"] == {"email": "mario@example.it"}
    assert db.get_data("projects", "d1", "private_data", "quote", "deliveries", "x1") is not None
    assert bucket.names == {PDF}
    assert db.get_data("legal_holds", "d1:quote")["retain_until"] == SENT + SENT_QUOTE_RETENTION
    assert db.get_data("projects", "d1") is None and db.get_data("sessions", "d1") is None


async def test_what_a_legal_hold_keeps_is_never_taken_for_an_orphan():
    db, bucket = FakeDb(), FakeBucket([PDF])
    _registered_project(db, bucket, "d1", is_deleted=True, deleted_at=NOW - timedelta(days=31))
    db.put("projects", "d1", "private_data", "quote", {"status": "sent", "sent_at": SENT, "pdf_blob_path": PDF})
    await _service(db, bucket).run()
    hold = db.get_data("legal_holds", "d1:quote")

    report = await _service(db, bucket).run()

    assert (report.orphans, report.deleted_projects) == (0, 0)
    assert bucket.names == {PDF}
    assert db.get_data("legal_holds", "d1:quote") == hold


# ── Legal holds past their 10 years ──────────────────────────────────────────

async def test_an_expired_legal_hold_is_released():
    db, bucket = FakeDb(), FakeBucket([PDF])
    db.put("projects", "d1", "private_data", "quote", {"status": "sent", "pdf_blob_path": PDF,
                                                      "legal_hold": {"retain_until": NOW - timedelta(days=1)}})
    db.put("projects", "d1", "private_data", "quote", "revisions", "1", {"items": []})
    db.put("legal_holds", "d1:quote", {"project_id": "d1", "quote_id": "quote", "reason": "preventivo_inviato",
                                       "since": SENT, "retain_until": NOW - timedelta(days=1), "blob_paths": [PDF]})

    report = await _service(db, bucket).run()

    assert report.expired_holds == 1
    assert db.docs == {}
    assert bucket.names == set()


# ── Remains of projects whose session no longer exists ───────────────────────

async def test_remains_of_a_session_that_no_longer_exists_are_erased():
    # e.g. a guest session the Firestore TTL deleted: the TTL never cascades.
    db, bucket = FakeDb(), FakeBucket(["user-uploads/o1/a.jpg", "projects/o1/uploads/b.jpg"])
    db.put("sessions", "o1", "files", "f1", {"name": "a.jpg"})
    db.put("sessions", "o1", "feedback", "fb1", {"comment": "ok"})
    db.put("projects", "o1", {"userId": "guest_abc", "name": "Bagno"})
    db.put("projects", "o1", "files", "f1", {"url": "x"})

    report = await _service(db, bucket).run()

    assert report.orphans == 1
    assert _gone(db, bucket, "o1")


async def test_files_left_in_storage_alone_are_erased():
    db, bucket = FakeDb(), FakeBucket(["renders/o2/render.png", "documents/o2/old.pdf"])

    report = await _service(db, bucket).run()

    assert report.orphans == 1
    assert bucket.names == set()


async def test_recent_remains_are_left_alone():
    # A guest can upload a photo before the first message creates the session.
    db, bucket = FakeDb(), FakeBucket(["user-uploads/o3/a.jpg"], updated={"user-uploads/o3/a.jpg": NOW - timedelta(days=1)})
    db.clock = NOW - timedelta(days=2)
    db.put("sessions", "o4", "files", "f1", {"name": "b.jpg"})

    report = await _service(db, bucket).run()

    assert report.orphans == 0
    assert bucket.names == {"user-uploads/o3/a.jpg"}
    assert db.get_data("sessions", "o4", "files", "f1") is not None


async def test_remains_of_a_registered_users_project_are_kept():
    # A registered project whose session the old all-users TTL deleted: what is
    # left belongs to an account that still exists, so it is not ours to erase.
    db, bucket = FakeDb(), FakeBucket(["user-uploads/o5/a.jpg"])
    db.put("projects", "o5", {"userId": "u1", "name": "Cucina"})

    report = await _service(db, bucket).run()

    assert (report.orphans, report.orphans_kept) == (0, 1)
    assert db.get_data("projects", "o5") is not None
    assert bucket.names == {"user-uploads/o5/a.jpg"}


async def test_a_binned_projection_without_session_is_erased_even_for_a_registered_owner():
    db, bucket = FakeDb(), FakeBucket(["user-uploads/o6/a.jpg"])
    db.put("projects", "o6", {"userId": "u1", "is_deleted": True, "deleted_at": NOW - timedelta(days=40)})

    report = await _service(db, bucket).run()

    assert report.orphans == 1
    assert _gone(db, bucket, "o6")


# ── The run ──────────────────────────────────────────────────────────────────

def _one_of_each(db: FakeDb, bucket: FakeBucket) -> None:
    _guest_project(db, bucket, "g1")
    _guest_project(db, bucket, "s1", owner="u1")
    _registered_project(db, bucket, "d1", is_deleted=True, deleted_at=NOW - timedelta(days=31))
    db.put("projects", "o5", {"userId": "u1"})
    bucket.names.add("renders/o2/render.png")
    db.put("legal_holds", "h1:quote", {"project_id": "h1", "quote_id": "quote", "since": SENT,
                                       "retain_until": NOW - timedelta(days=1), "blob_paths": []})


async def test_a_dry_run_counts_everything_and_changes_nothing():
    db, bucket = FakeDb(), FakeBucket()
    _one_of_each(db, bucket)
    docs, blobs = dict(db.docs), set(bucket.names)

    report = await _service(db, bucket, apply=False).run()

    assert report.applied is False
    assert (report.guest_sessions, report.deleted_projects, report.orphans, report.expired_holds) == (1, 1, 1, 1)
    assert (report.orphans_kept, report.made_permanent) == (1, 1)
    assert db.docs == docs and bucket.names == blobs


async def test_the_run_stops_at_its_time_budget_and_says_so():
    db, bucket = FakeDb(), FakeBucket()
    for pid in ("g1", "g2", "g3"):
        _guest_project(db, bucket, pid)

    # 100 s per clock reading against a 150 s budget: one project fits.
    report = await _service(db, bucket, monotonic=SteppingClock(100)).run()

    assert report.guest_sessions == 1
    assert report.truncated is True


async def test_the_run_handles_at_most_its_limit():
    db, bucket = FakeDb(), FakeBucket()
    for pid in ("g1", "g2", "g3"):
        _guest_project(db, bucket, pid)

    report = await _service(db, bucket, limit=2).run()

    assert (report.guest_sessions, report.truncated) == (2, True)


async def test_one_failing_project_does_not_stop_the_others():
    db, bucket = FakeDb(), FakeBucket(fail_on="user-uploads/g1/")
    _guest_project(db, bucket, "g1")
    _guest_project(db, bucket, "g2")

    report = await _service(db, bucket).run()

    assert report.guest_sessions == 1
    assert report.errors == ["retention:guest_session:RuntimeError"]
    assert db.get_data("sessions", "g1") is not None  # the session goes last: found again next run
    assert _gone(db, bucket, "g2")


async def test_the_audit_records_counts_and_never_identifiers(_audit):
    db, bucket = FakeDb(), FakeBucket()
    _guest_project(db, bucket, "g1")

    await _service(db, bucket).run()

    kwargs = _audit.call_args.kwargs
    assert kwargs["metadata"]["guest_sessions"] == 1
    assert kwargs["metadata"]["applied"] is True
    assert "g1" not in repr(_audit.call_args)
