"""scripts/purge_test_chats.py — deletes every chat of the test period (Phase 139):
the chats and all they hold, the records that point at them, the quote number
counter (last). Accounts, profiles, avatars and site content stay."""
import importlib.util
from pathlib import Path

import pytest
from tests.unit.firestore_fakes import FakeBucket, FakeDb

_SPEC = importlib.util.spec_from_file_location(
    "purge_test_chats",
    Path(__file__).resolve().parents[2] / "scripts" / "purge_test_chats.py",
)
assert _SPEC and _SPEC.loader
purge = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(purge)

CHAT_BLOBS = ["user-uploads/s1/a.jpg", "projects/s1/quotes/PRV-2026-0001_r1.pdf", "renders/s2/r.png",
              "documents/ghost/d.pdf"]
KEPT_BLOBS = ["users/u1/avatar.jpg", "portfolio/villa.jpg", "gallery/g.jpg"]


def _seed() -> FakeDb:
    db = FakeDb()
    db.put("sessions", "s1", {"userId": "u1"})
    db.put("sessions", "s1", "messages", "m1", {"role": "user", "content": "ciao"})
    db.put("projects", "s1", {"userId": "u1"})
    db.put("projects", "s1", "private_data", "quote", {"status": "sent", "sent_at": "x", "quote_number": "PRV-2026-0001"})
    db.put("projects", "s1", "private_data", "quote", "deliveries", "d1", {"sent_at": "x"})
    db.put("sessions", "s2", {"userId": "anon-1"})
    db.put("projects", "ghost", "files", "f1", {"name": "orfano.jpg"})  # projection already gone
    db.put("email_outbox", "o1", {"project_id": "s1", "status": "pending"})
    db.put("email_outbox", "o2", {"kind": "contact", "status": "pending"})  # not about a chat
    db.put("email_messages", "e1", {"project_id": "s1"})
    db.put("legal_holds", "s1:quote", {"project_id": "s1"})
    db.put("usage_quotas", "s1_generate_render", {"project_id": "s1", "user_id": "u1"})
    db.put("usage_quotas", "u1_generate_render", {"project_id": None, "user_id": "u1"})
    db.put("leads", "l1", {"session_id": "s2"})
    db.put("guest_claim_tickets", "t1", {"anonUid": "anon-1"})
    db.put("audit_logs", "a1", {"resource_id": "s1", "session_id": ""})
    db.put("audit_logs", "a2", {"resource_id": "PRV", "session_id": "s2"})
    db.put("audit_logs", "a3", {"resource_id": "price_book", "session_id": ""})
    db.put("audit_logs", "a4", {"resource_id": "f9", "session_id": "", "metadata": {"project_id": "s1"}})
    db.put("users", "u1", {"displayName": "Mario", "chat_id": "s1", "chat_assigned_at": "t"})
    db.put("users", "u1", "preferences", "general", {"theme": "dark"})
    db.put("users", "u2", {"displayName": "Anna"})
    db.put("counters", "quote_2026", {"next": 4})
    db.put("testimonials", "t1", {"text": "Ottimo"})
    db.put("app_config", "price_book", {"version": 3})
    return db


KEPT_DOCS = [
    ("email_outbox", "o2"), ("usage_quotas", "u1_generate_render"), ("audit_logs", "a3"),
    ("users", "u1", "preferences", "general"), ("users", "u2"), ("testimonials", "t1"), ("app_config", "price_book"),
]


def _bucket() -> FakeBucket:
    return FakeBucket([*CHAT_BLOBS, *KEPT_BLOBS])


async def test_the_dry_run_lists_everything_and_writes_nothing():
    db, bucket = _seed(), _bucket()
    before = dict(db.docs)

    plan = await purge.plan_wipe(db, bucket)

    assert plan.chat_ids == ["ghost", "s1", "s2"]
    assert plan.counts() == {
        "email": 2, "legal_holds": 1, "usage_quotas": 1, "leads": 1,
        "guest_claim_tickets": 1, "audit_logs": 3, "chat_pointers": 1, "quote_counters": 1,
    }
    assert db.docs == before
    assert bucket.names == {*CHAT_BLOBS, *KEPT_BLOBS}


async def test_apply_deletes_the_chats_and_what_points_at_them():
    db, bucket = _seed(), _bucket()

    await purge.apply_wipe(db, bucket, await purge.plan_wipe(db, bucket))

    remaining = set(db.docs)
    assert remaining == {*KEPT_DOCS, ("users", "u1")}
    assert db.get_data("users", "u1") == {"displayName": "Mario"}  # the pointer goes, the profile stays
    assert bucket.names == set(KEPT_BLOBS)


async def test_a_second_run_finds_nothing():
    db, bucket = _seed(), _bucket()
    await purge.apply_wipe(db, bucket, await purge.plan_wipe(db, bucket))

    plan = await purge.plan_wipe(db, bucket)

    assert plan.chat_ids == []
    assert set(plan.counts().values()) == {0}


async def test_the_quote_counter_goes_last():
    """An interrupted run must not reset the numbering while test quotes are left."""
    db = _seed()
    bucket = FakeBucket([*CHAT_BLOBS, *KEPT_BLOBS], fail_on="renders/")
    plan = await purge.plan_wipe(db, _bucket())

    with pytest.raises(RuntimeError):
        await purge.apply_wipe(db, bucket, plan)

    assert db.get_data("counters", "quote_2026") == {"next": 4}
    assert db.get_data("email_outbox", "o1") is None  # nothing is sent for a chat being deleted


async def test_malformed_ids_are_reported_not_deleted():
    db, bucket = _seed(), _bucket()
    bucket.names.add("user-uploads/bad id/x.jpg")

    plan = await purge.plan_wipe(db, bucket)

    assert plan.skipped_ids == ["bad id"]
    assert "bad id" not in plan.chat_ids
