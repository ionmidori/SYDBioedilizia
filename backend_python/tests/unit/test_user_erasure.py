"""UserErasureService: one registry of every place a user's data lives, erased
in resumable steps, marked complete only at the very end."""
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from src.core.exceptions import ErasureInProgressError
from src.services.auth_gateway import AuthContact
from src.services.erasure import service as erasure_service
from src.services.erasure.legal_hold import SENT_QUOTE_RETENTION
from src.services.erasure.models import ErasureMode, ErasureStatus
from src.services.erasure.service import UserErasureService
from src.services.erasure.steps import ERASURE_STEPS, ErasureStep
from tests.unit.firestore_fakes import FakeBucket, FakeDb, FakeTransaction

NOW = datetime(2026, 10, 17, 9, 0, tzinfo=UTC)
SENT = datetime(2026, 3, 1, 10, 0, tzinfo=UTC)
PDF = "projects/p1/quotes/PRV-2026-0001_r1.pdf"


class FakeAuth:
    def __init__(self, *, exists: bool = True, account_disabled: bool = False) -> None:
        self.exists = exists
        self.account_disabled = account_disabled
        self.disabled: list[str] = []
        self.deleted: list[str] = []

    async def disable_and_revoke(self, uid: str) -> bool:
        self.disabled.append(uid)
        self.account_disabled = True
        return self.exists

    async def is_disabled(self, uid: str) -> bool | None:
        return self.account_disabled if self.exists else None

    async def delete_user(self, uid: str) -> bool:
        self.deleted.append(uid)
        return self.exists

    async def get_contact(self, uid: str) -> AuthContact | None:
        return AuthContact(email=f"{uid}@example.it", display_name=None) if self.exists else None


@pytest.fixture(autouse=True)
def _fake_transactions(monkeypatch):
    async def transact(db, body):
        return await body(FakeTransaction(db))

    monkeypatch.setattr(erasure_service, "_transact", transact)


@pytest.fixture(autouse=True)
def _audit():
    with patch.object(erasure_service, "emit_audit_event") as emit:
        yield emit


def _seed_user(db: FakeDb, uid: str = "u1", pid: str = "p1") -> None:
    db.put("users", uid, {"last_active_at": NOW - timedelta(days=800), "phone": "+39 333",
                          "lifecycle_warned_at": NOW - timedelta(days=400),
                          "lifecycle_disabled_at": NOW - timedelta(days=370)})
    db.put("users", uid, "preferences", "general", {"ui": {}})
    db.put("users", uid, "passkeys", "cred1", {"credential_id": "c"})
    db.put("sessions", pid, {"userId": uid, "title": "Bagno in via Roma 1"})
    db.put("sessions", pid, "messages", "m1", {"content": "abito in via Roma 1"})
    db.put("sessions", pid, "files", "f1", {"uploadedBy": uid})
    db.put("sessions", pid, "feedback", "fb1", {"user_id": uid, "comment": "ok"})
    db.put("projects", pid, {"userId": uid, "name": "Bagno"})
    db.put("projects", pid, "files", "f1", {"url": "https://signed"})
    db.put("projects", pid, "private_data", "quote", {"user_id": uid, "status": "draft",
                                                      "client_snapshot": {"email": "mario@example.it"}})
    db.put("projects", pid, "private_data", "quote", "revisions", "1", {"items": []})
    db.put("leads", f"lead-{uid}", {"uid": uid, "session_id": pid, "email": "mario@example.it"})
    db.put("quote_batches", f"batch-{uid}", {"user_id": uid, "projects": [{"project_id": pid}]})
    db.put("testimonials", f"t-ok-{uid}", {"userId": uid, "status": "approved", "text": "Ottimo"})
    db.put("testimonials", f"t-new-{uid}", {"userId": uid, "status": "pending", "text": "Bene"})
    db.put("usage_quotas", f"{uid}_upload_video", {"user_id": uid, "count": 1})
    db.put("email_outbox", f"out-{pid}", {"project_id": pid, "status": "done"})
    db.put("email_messages", f"msg-{pid}", {"project_id": pid})
    db.put("passkey_challenges", f"ch-{uid}", {"user_id": uid})


def _bucket(*extra: str) -> FakeBucket:
    return FakeBucket([
        "user-uploads/p1/a.jpg", "projects/p1/uploads/b.jpg", "renders/p1/r.png",
        "documents/p1/old.pdf", "users/u1/avatar.webp",
        "user-uploads/p2/other.jpg", "users/u2/avatar.webp", *extra,
    ])


def _service(db: FakeDb, bucket: FakeBucket, auth: FakeAuth | None = None) -> UserErasureService:
    # Default: the account was disabled by lifecycle phase 2, as in production
    # (an inactivity erasure of an ENABLED account is cancelled).
    return UserErasureService(db=db, bucket=bucket, auth=auth or FakeAuth(account_disabled=True), now=lambda: NOW)


def _remaining_paths(db: FakeDb) -> set[tuple[str, ...]]:
    return set(db.docs)


# ── Registry ─────────────────────────────────────────────────────────────────

def test_step_names_are_stable_and_unique():
    # Resumption is keyed on step names: renaming one would rerun or skip work.
    names = [s.name for s in ERASURE_STEPS]
    assert names == [
        "auth_disable", "legal_hold", "email_outbox", "leads", "quote_batches", "testimonials",
        "storage", "projects", "sessions", "usage_quotas", "passkey_challenges", "pending_notifications",
        "user_profile", "auth_delete",
    ]


# ── Account deletion (Art. 17) ───────────────────────────────────────────────

async def test_account_deletion_erases_everything_of_the_user_and_nothing_else():
    db, bucket, auth = FakeDb(), _bucket(), FakeAuth()
    _seed_user(db, "u1", "p1")
    _seed_user(db, "u2", "p2")

    report = await _service(db, bucket, auth).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert report.status is ErasureStatus.COMPLETED
    leftovers = {p for p in _remaining_paths(db) if "u1" in "/".join(p) or "p1" in "/".join(p)}
    assert leftovers == {("erasure_jobs", "u1")}
    assert db.get_data("users", "u2") is not None
    assert db.get_data("sessions", "p2", "messages", "m1") is not None
    assert bucket.names == {"user-uploads/p2/other.jpg", "users/u2/avatar.webp"}
    assert auth.disabled == ["u1"] and auth.deleted == ["u1"]
    job = db.get_data("erasure_jobs", "u1")
    assert job["status"] == "completed"
    assert job["completed_steps"] == [s.name for s in ERASURE_STEPS]


async def test_audit_carries_counts_and_never_personal_data(_audit):
    db = FakeDb()
    _seed_user(db)

    await _service(db, _bucket()).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    metadata = _audit.call_args.kwargs["metadata"]
    flat = repr(metadata)
    assert "@" not in flat and "Roma" not in flat and "Mario" not in flat
    assert metadata["mode"] == "account_deletion"
    assert all(isinstance(v, int) for v in metadata["counts"].values())


# ── Inactivity (24 months) ───────────────────────────────────────────────────

async def test_inactivity_leaves_only_a_tombstone_profile():
    db = FakeDb()
    _seed_user(db)

    report = await _service(db, _bucket()).erase("u1", ErasureMode.INACTIVITY, requested_by="lifecycle")

    assert report.status is ErasureStatus.COMPLETED
    user = db.get_data("users", "u1")
    assert set(user) == {"lifecycle_warned_at", "lifecycle_disabled_at", "lifecycle_anonymized_at", "anonymized"}
    assert user["lifecycle_anonymized_at"] == NOW
    assert db.get_data("users", "u1", "preferences", "general") is None
    assert db.get_data("users", "u1", "passkeys", "cred1") is None


async def test_inactivity_keeps_a_published_review_but_detached_from_the_account():
    # Privacy policy: reviews are kept "while published".
    db = FakeDb()
    _seed_user(db)

    await _service(db, _bucket()).erase("u1", ErasureMode.INACTIVITY, requested_by="lifecycle")

    published = db.get_data("testimonials", "t-ok-u1")
    assert published is not None and "userId" not in published
    assert db.get_data("testimonials", "t-new-u1") is None


async def test_account_deletion_removes_published_reviews_too():
    # Erasure request = consent withdrawn.
    db = FakeDb()
    _seed_user(db)

    await _service(db, _bucket()).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert db.get_data("testimonials", "t-ok-u1") is None


# ── Legal hold ───────────────────────────────────────────────────────────────

async def test_a_quote_sent_to_the_client_is_kept_intact_with_its_pdf():
    db, bucket = FakeDb(), _bucket(PDF)
    _seed_user(db)
    db.put("projects", "p1", "private_data", "quote", {"user_id": "u1", "status": "sent", "sent_at": SENT,
                                                      "pdf_blob_path": PDF,
                                                      "client_snapshot": {"email": "mario@example.it"}})
    db.put("projects", "p1", "private_data", "quote", "deliveries", "d1",
           {"sent_at": SENT, "to": "mario@example.it", "pdf_blob_path": PDF})

    report = await _service(db, bucket).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert report.status is ErasureStatus.COMPLETED
    quote = db.get_data("projects", "p1", "private_data", "quote")
    assert quote["client_snapshot"] == {"email": "mario@example.it"}  # intact, not anonymised
    assert quote["legal_hold"]["retain_until"] == SENT + SENT_QUOTE_RETENTION
    assert db.get_data("projects", "p1", "private_data", "quote", "deliveries", "d1") is not None
    assert db.get_data("projects", "p1", "private_data", "quote", "revisions", "1") is not None
    assert PDF in bucket.names
    # ... and nothing else of the project survives
    assert db.get_data("projects", "p1") is None
    assert db.get_data("projects", "p1", "files", "f1") is None
    assert "projects/p1/uploads/b.jpg" not in bucket.names


# ── Resumption ───────────────────────────────────────────────────────────────

async def test_a_failed_step_is_resumed_without_redoing_the_finished_ones():
    db, auth = FakeDb(), FakeAuth(account_disabled=True)
    _seed_user(db)
    broken = _bucket()
    broken.fail_on = "renders/"

    first = await _service(db, broken, auth).erase("u1", ErasureMode.INACTIVITY, requested_by="lifecycle")

    assert first.status is ErasureStatus.FAILED
    assert first.completed_steps == ["auth_disable", "legal_hold", "email_outbox", "leads", "quote_batches",
                                     "testimonials"]
    job = db.get_data("erasure_jobs", "u1")
    assert job["status"] == "failed" and job["last_error_type"] == "RuntimeError"
    assert "lifecycle_anonymized_at" not in db.get_data("users", "u1")  # not marked done
    assert db.get_data("sessions", "p1") is not None                     # still discoverable

    broken.fail_on = None
    second = await _service(db, broken, auth).erase("u1", ErasureMode.INACTIVITY, requested_by="lifecycle")

    assert second.status is ErasureStatus.COMPLETED
    assert auth.disabled == ["u1"]  # not repeated
    assert db.get_data("sessions", "p1") is None
    assert db.get_data("users", "u1")["lifecycle_anonymized_at"] == NOW


async def test_projects_found_once_stay_in_scope_after_their_owner_docs_are_gone():
    # A resumed job must still clear p1 even though sessions/p1 (the discovery
    # source) was deleted by the first, interrupted run.
    db = FakeDb()
    db.put("users", "u1", {"last_active_at": NOW})
    db.put("erasure_jobs", "u1", {"uid": "u1", "mode": "account_deletion", "status": "failed",
                                  "project_ids": ["p1"], "completed_steps": [], "step_counts": {},
                                  "attempts": 1, "requested_by": "self"})
    db.put("projects", "p1", "private_data", "quote", "revisions", "1", {"items": []})

    report = await _service(db, _bucket()).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert report.status is ErasureStatus.COMPLETED
    assert db.get_data("projects", "p1", "private_data", "quote", "revisions", "1") is None


async def test_a_completed_erasure_is_not_run_again():
    db, auth = FakeDb(), FakeAuth()
    _seed_user(db)
    service = _service(db, _bucket(), auth)
    await service.erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    again = await service.erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert again.status is ErasureStatus.COMPLETED
    assert auth.disabled == ["u1"]


async def test_an_account_already_gone_from_firebase_auth_is_still_erased():
    db = FakeDb()
    _seed_user(db)

    report = await _service(db, _bucket(), FakeAuth(exists=False)).erase(
        "u1", ErasureMode.ACCOUNT_DELETION, requested_by="self"
    )

    assert report.status is ErasureStatus.COMPLETED
    assert db.get_data("users", "u1") is None


# ── An inactivity erasure never outlives the inactivity ──────────────────────

def _failed_inactivity_job(completed: list[str]) -> dict:
    return {"uid": "u1", "mode": "inactivity", "status": "failed", "project_ids": ["p1"],
            "completed_steps": completed, "step_counts": {}, "attempts": 1, "requested_by": "lifecycle",
            "updated_at": NOW - timedelta(days=7)}


async def test_a_pending_inactivity_erasure_is_cancelled_when_the_user_came_back():
    # The run failed after disabling the account; the user was reactivated and
    # logged in (activity tracker cleared lifecycle_disabled_at).
    db = FakeDb()
    _seed_user(db)
    db.put("users", "u1", {"last_active_at": NOW - timedelta(hours=1)})
    db.put("erasure_jobs", "u1", _failed_inactivity_job(["auth_disable", "legal_hold"]))

    reports = await _service(db, _bucket(), FakeAuth()).resume_incomplete(limit=10)

    assert [(r.uid, r.status) for r in reports] == [("u1", ErasureStatus.CANCELLED)]
    assert db.get_data("sessions", "p1", "messages", "m1") is not None  # nothing erased
    assert db.get_data("erasure_jobs", "u1")["status"] == "cancelled"
    assert await _service(db, _bucket()).resume_incomplete(limit=10) == []  # never picked up again


async def test_a_pending_inactivity_erasure_is_cancelled_when_support_reenabled_the_account():
    db = FakeDb()
    _seed_user(db)  # profile still carries lifecycle_disabled_at: the user did not log in yet
    db.put("erasure_jobs", "u1", _failed_inactivity_job(["auth_disable"]))

    report = await _service(db, _bucket(), FakeAuth(account_disabled=False)).erase(
        "u1", ErasureMode.INACTIVITY, requested_by="lifecycle"
    )

    assert report.status is ErasureStatus.CANCELLED
    assert db.get_data("users", "u1")["phone"] == "+39 333"


async def test_a_cancelled_erasure_starts_over_when_the_user_lapses_again():
    db, auth = FakeDb(), FakeAuth(account_disabled=True)
    _seed_user(db)
    db.put("erasure_jobs", "u1", {**_failed_inactivity_job(["auth_disable", "legal_hold", "email_outbox"]),
                                  "status": "cancelled"})

    report = await _service(db, _bucket(), auth).erase("u1", ErasureMode.INACTIVITY, requested_by="lifecycle")

    assert report.status is ErasureStatus.COMPLETED
    assert auth.disabled == ["u1"]  # step re-run, not skipped from the old job
    assert report.completed_steps[:3] == ["auth_disable", "legal_hold", "email_outbox"]


async def test_a_fresh_inactivity_erasure_never_touches_an_account_support_reenabled():
    # Phase 2 disabled the account; support re-enabled it; the user has not
    # logged in, so the profile still says "disabled". A FRESH erasure must not
    # disable the account again and erase it.
    db, auth = FakeDb(), FakeAuth(account_disabled=False)
    _seed_user(db)

    report = await _service(db, _bucket(), auth).erase("u1", ErasureMode.INACTIVITY, requested_by="lifecycle")

    assert report.status is ErasureStatus.CANCELLED
    assert auth.disabled == []
    assert db.get_data("sessions", "p1", "messages", "m1") is not None


async def test_a_restart_after_cancel_keeps_the_projects_found_before():
    # The cancelled run already erased the lead that was the only pointer to a
    # legacy ownerless projection: the restart must still reach it.
    db = FakeDb()
    _seed_user(db)
    db.put("projects", "legacy", {"name": "Cucina in via Verdi 3"})
    db.put("erasure_jobs", "u1", {**_failed_inactivity_job(["auth_disable", "legal_hold", "email_outbox", "leads"]),
                                  "status": "cancelled", "project_ids": ["legacy", "p1"]})

    report = await _service(db, _bucket()).erase("u1", ErasureMode.INACTIVITY, requested_by="lifecycle")

    assert report.status is ErasureStatus.COMPLETED
    assert db.get_data("projects", "legacy") is None


@pytest.mark.parametrize("status", ["failed", "cancelled"])
async def test_saved_project_ids_are_reverified_before_every_run(status):
    # Saved when the guest project was still the user's; since then another
    # user claimed it. A later run must not erase the new owner's project.
    db = FakeDb()
    _seed_user(db)
    db.put("sessions", "claimed", {"userId": "u2", "title": "Ora di u2"})
    db.put("projects", "claimed", {"userId": "u2"})
    db.put("erasure_jobs", "u1", {**_failed_inactivity_job([]), "status": status,
                                  "project_ids": ["claimed", "p1"]})

    report = await _service(db, _bucket()).erase("u1", ErasureMode.INACTIVITY, requested_by="lifecycle")

    assert report.status is ErasureStatus.COMPLETED
    assert db.get_data("sessions", "claimed") == {"userId": "u2", "title": "Ora di u2"}
    assert db.get_data("projects", "claimed") == {"userId": "u2"}
    assert "claimed" not in db.get_data("erasure_jobs", "u1")["project_ids"]
    assert db.get_data("sessions", "p1") is None


async def test_cancelling_for_a_reenabled_account_restarts_the_cycle_cleanly():
    # Support re-enabled the account but the user did not log in: the stale
    # markers would otherwise re-trigger (and re-cancel) phase 3 on every run,
    # without the user ever getting a new warning.
    db = FakeDb()
    _seed_user(db)
    db.put("erasure_jobs", "u1", _failed_inactivity_job(["auth_disable"]))

    await _service(db, _bucket(), FakeAuth(account_disabled=False)).erase(
        "u1", ErasureMode.INACTIVITY, requested_by="lifecycle"
    )

    profile = db.get_data("users", "u1")
    assert "lifecycle_disabled_at" not in profile
    assert "lifecycle_warned_at" not in profile
    assert profile["last_active_at"] == NOW - timedelta(days=800)  # untouched: the new cycle starts from it


async def test_an_erasure_request_is_never_cancelled():
    db = FakeDb()
    _seed_user(db)
    db.put("users", "u1", {"last_active_at": NOW})  # active, no lifecycle markers

    report = await _service(db, _bucket()).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert report.status is ErasureStatus.COMPLETED


# ── Concurrency ──────────────────────────────────────────────────────────────

async def test_a_running_erasure_is_not_started_twice():
    db = FakeDb()
    _seed_user(db)
    db.put("erasure_jobs", "u1", {"uid": "u1", "mode": "account_deletion", "status": "running",
                                  "lease_until": NOW + timedelta(minutes=5), "project_ids": [],
                                  "completed_steps": [], "step_counts": {}, "attempts": 1})

    with pytest.raises(ErasureInProgressError):
        await _service(db, _bucket()).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")


async def test_an_expired_lease_is_taken_over():
    db = FakeDb()
    _seed_user(db)
    db.put("erasure_jobs", "u1", {"uid": "u1", "mode": "account_deletion", "status": "running",
                                  "lease_until": NOW - timedelta(minutes=1), "project_ids": [],
                                  "completed_steps": [], "step_counts": {}, "attempts": 1})

    report = await _service(db, _bucket()).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert report.status is ErasureStatus.COMPLETED
    assert db.get_data("erasure_jobs", "u1")["attempts"] == 2


async def test_a_deletion_request_upgrades_a_pending_inactivity_erasure():
    db = FakeDb()
    _seed_user(db)
    db.put("erasure_jobs", "u1", {"uid": "u1", "mode": "inactivity", "status": "failed", "project_ids": [],
                                  "completed_steps": ["auth_disable"], "step_counts": {}, "attempts": 1,
                                  "requested_by": "lifecycle"})

    report = await _service(db, _bucket()).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert report.mode is ErasureMode.ACCOUNT_DELETION
    assert db.get_data("users", "u1") is None  # full deletion, not a tombstone


# ── Discovery ────────────────────────────────────────────────────────────────

async def test_projects_reachable_only_through_batches_or_leads_are_erased():
    db = FakeDb()
    db.put("users", "u1", {"last_active_at": NOW})
    # Legacy projection without userId; only the batch and the lead point at it.
    db.put("projects", "pb", {"name": "Cucina"})
    db.put("quote_batches", "b1", {"user_id": "u1", "projects": [{"project_id": "pb"}]})
    db.put("projects", "pl", {"name": "Bagno"})
    db.put("leads", "l1", {"uid": "u1", "session_id": "pl"})

    await _service(db, FakeBucket()).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert db.get_data("projects", "pb") is None
    assert db.get_data("projects", "pl") is None


async def test_a_lead_or_batch_pointing_at_another_users_project_never_erases_it():
    # leads/quote_batches are only pointers: the project they name must not
    # belong to someone else, or one bad reference would erase another user's data.
    db = FakeDb()
    db.put("users", "u1", {"last_active_at": NOW})
    db.put("sessions", "victim", {"userId": "u2", "title": "Casa di u2"})
    db.put("projects", "victim", {"userId": "u2"})
    db.put("sessions", "victim2", {"userId": "u3"})
    db.put("leads", "l1", {"uid": "u1", "session_id": "victim"})
    db.put("quote_batches", "b1", {"user_id": "u1", "projects": [{"project_id": "victim2"}]})

    await _service(db, FakeBucket(["user-uploads/victim/a.jpg"])).erase(
        "u1", ErasureMode.ACCOUNT_DELETION, requested_by="self"
    )

    assert db.get_data("sessions", "victim") == {"userId": "u2", "title": "Casa di u2"}
    assert db.get_data("projects", "victim") == {"userId": "u2"}
    assert db.get_data("sessions", "victim2") == {"userId": "u3"}
    assert db.get_data("erasure_jobs", "u1")["project_ids"] == []


async def test_a_guest_project_named_by_the_users_own_lead_is_erased():
    # The lead was written while the user chatted as a guest.
    db = FakeDb()
    db.put("users", "u1", {"last_active_at": NOW})
    db.put("sessions", "g1", {"userId": "guest_abcd1234"})
    db.put("leads", "l1", {"uid": "u1", "session_id": "g1"})

    await _service(db, FakeBucket()).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert db.get_data("sessions", "g1") is None


async def test_legacy_owner_fields_on_projections_are_honoured():
    db = FakeDb()
    db.put("users", "u1", {"last_active_at": NOW})
    db.put("projects", "old1", {"user_id": "u1"})
    db.put("projects", "old2", {"uid": "u1"})

    await _service(db, FakeBucket()).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert db.get_data("projects", "old1") is None
    assert db.get_data("projects", "old2") is None


# ── Resuming incomplete jobs ─────────────────────────────────────────────────

async def test_resume_incomplete_finishes_failed_jobs_and_skips_live_ones():
    db = FakeDb()
    _seed_user(db, "u1", "p1")
    _seed_user(db, "u2", "p2")
    db.put("erasure_jobs", "u1", {"uid": "u1", "mode": "account_deletion", "status": "failed",
                                  "project_ids": ["p1"], "completed_steps": [], "step_counts": {},
                                  "attempts": 1, "requested_by": "self"})
    db.put("erasure_jobs", "u2", {"uid": "u2", "mode": "account_deletion", "status": "running",
                                  "lease_until": NOW + timedelta(minutes=5), "project_ids": ["p2"],
                                  "completed_steps": [], "step_counts": {}, "attempts": 1,
                                  "requested_by": "self"})

    reports = await _service(db, _bucket()).resume_incomplete(limit=10)

    assert [(r.uid, r.status) for r in reports] == [("u1", ErasureStatus.COMPLETED)]
    assert db.get_data("users", "u1") is None
    assert db.get_data("users", "u2") is not None


async def test_one_broken_job_does_not_stop_the_others():
    db = FakeDb()
    _seed_user(db, "u2", "p2")
    db.put("erasure_jobs", "u1", {"uid": "u1", "status": "failed", "updated_at": NOW - timedelta(days=9)})  # no mode
    db.put("erasure_jobs", "u2", {"uid": "u2", "mode": "account_deletion", "status": "failed",
                                  "project_ids": [], "completed_steps": [], "step_counts": {}, "attempts": 1,
                                  "requested_by": "self", "updated_at": NOW - timedelta(days=1)})

    reports = await _service(db, _bucket()).resume_incomplete(limit=10)

    assert [(r.uid, r.status) for r in reports] == [
        ("u1", ErasureStatus.FAILED), ("u2", ErasureStatus.COMPLETED),
    ]


async def test_the_longest_waiting_jobs_are_resumed_first():
    # A job that keeps failing gets a fresh updated_at each time and moves to the
    # back: it cannot starve the others behind the limit.
    db = FakeDb()
    for uid, days in (("u-new", 1), ("u-old", 9)):
        _seed_user(db, uid, f"p-{uid}")
        db.put("erasure_jobs", uid, {"uid": uid, "mode": "account_deletion", "status": "failed",
                                     "project_ids": [], "completed_steps": [], "step_counts": {},
                                     "attempts": 3, "requested_by": "self",
                                     "updated_at": NOW - timedelta(days=days)})

    reports = await _service(db, FakeBucket()).resume_incomplete(limit=1)

    assert [r.uid for r in reports] == ["u-old"]


# ── Robustness ───────────────────────────────────────────────────────────────

async def test_pending_notifications_holding_the_users_email_are_erased():
    db = FakeDb()
    _seed_user(db)
    db.put("pending_notifications", "n1", {"event_type": "account_inactivity_warning",
                                           "metadata": {"email": "u1@example.it"}})
    db.put("pending_notifications", "n2", {"metadata": {"email": "other@example.it"}})

    await _service(db, _bucket()).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert db.get_data("pending_notifications", "n1") is None
    assert db.get_data("pending_notifications", "n2") is not None


async def test_a_failure_before_the_first_step_is_a_resumable_failure(_audit, monkeypatch):
    async def broken_discovery(db, uid, *, known):
        raise RuntimeError("firestore down")

    monkeypatch.setattr(erasure_service, "discover_project_ids", broken_discovery)
    db = FakeDb()
    _seed_user(db)

    report = await _service(db, _bucket()).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert report.status is ErasureStatus.FAILED
    job = db.get_data("erasure_jobs", "u1")
    assert job["status"] == "failed" and job["lease_until"] is None
    assert _audit.call_args.kwargs["status"] == "failure"


async def test_the_lease_is_renewed_after_every_step():
    db = FakeDb()
    _seed_user(db)
    clock = iter(NOW + timedelta(minutes=i) for i in range(1000))
    seen: list[datetime] = []

    async def spy(ctx) -> int:
        seen.append(db.get_data("erasure_jobs", "u1")["lease_until"])
        return 0

    steps = (ERASURE_STEPS[0], ErasureStep("spy", spy))
    service = UserErasureService(db=db, bucket=_bucket(), auth=FakeAuth(), now=lambda: next(clock), steps=steps)

    await service.erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert seen[0] > NOW + erasure_service.LEASE  # extended after auth_disable, not the initial lease


async def test_malformed_ids_from_legacy_references_are_ignored():
    db = FakeDb()
    db.put("users", "u1", {"last_active_at": NOW})
    db.put("leads", "l1", {"uid": "u1", "session_id": "not a valid/id"})

    report = await _service(db, FakeBucket()).erase("u1", ErasureMode.ACCOUNT_DELETION, requested_by="self")

    assert report.status is ErasureStatus.COMPLETED
    assert db.get_data("erasure_jobs", "u1")["project_ids"] == []
