"""The user's chat (Phase 139): one chat per registered user, chosen by the backend.

`users/{uid}.chat_id` points at it. A valid pointer is returned as is; a
pointer to a merged chat follows the merge; otherwise the user's most recent
valid chat is adopted, or a new one is created. All in one transaction.
"""
import logging
from datetime import UTC, datetime, timedelta

import pytest
from src.db import transactions
from src.services.audit import AuditAction
from src.services.user_chat import service
from src.services.user_chat.service import read_user_chat, resolve_user_chat
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

USER = "user-uid-1"
OTHER = "user-uid-2"
NOW = datetime(2026, 10, 29, 10, 0, tzinfo=UTC)


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()

    async def transact(_db, body):
        return await body(FakeTransaction(fake))

    monkeypatch.setattr(transactions, "run_transaction", transact)
    return fake


@pytest.fixture(autouse=True)
def audits(monkeypatch):
    events: list[tuple] = []
    monkeypatch.setattr(service, "emit_audit_event", lambda *args, **kwargs: events.append((args, kwargs)))
    return events


def _chat(db: FakeDb, chat_id: str, owner: str = USER, *, age_days: int = 1, **extra) -> None:
    db.put("sessions", chat_id, {"userId": owner, "updatedAt": NOW - timedelta(days=age_days), **extra})
    db.put("projects", chat_id, {"id": chat_id, "userId": owner})


def _pointer(db: FakeDb, chat_id: str) -> None:
    db.put("users", USER, {"phone": "+39 333", "chat_id": chat_id})


def _sessions(db: FakeDb) -> set[str]:
    return {path[1] for path in db.docs if len(path) == 2 and path[0] == "sessions"}


class TestResolve:
    async def test_no_chat_creates_one(self, db, audits):
        chat = await resolve_user_chat(db, USER, now=NOW)

        assert chat.created is True
        assert _sessions(db) == {chat.chat_id}
        session = db.get_data("sessions", chat.chat_id)
        assert session["userId"] == USER
        assert session["is_deleted"] is False
        assert session["createdAt"] == NOW
        assert db.get_data("projects", chat.chat_id)["userId"] == USER
        assert db.get_data("users", USER) == {"chat_id": chat.chat_id, "chat_assigned_at": NOW}
        (args, kwargs), = audits
        assert args[0] is AuditAction.USER_CHAT_ASSIGN
        assert kwargs["metadata"] == {"reason": "missing", "created": True}

    async def test_adopts_the_only_chat(self, db):
        _chat(db, f"global-{USER}")

        chat = await resolve_user_chat(db, USER, now=NOW)

        assert (chat.chat_id, chat.created) == (f"global-{USER}", False)
        assert db.get_data("users", USER)["chat_id"] == f"global-{USER}"

    async def test_adopts_the_most_recent_valid_chat(self, db):
        _chat(db, f"global-{USER}", age_days=9)
        _chat(db, "uuid-recent", age_days=1)
        _chat(db, "uuid-deleted", age_days=0, is_deleted=True)
        _chat(db, "uuid-merged", age_days=0, merged_into=f"global-{USER}")
        _chat(db, "uuid-other", owner=OTHER, age_days=0)

        chat = await resolve_user_chat(db, USER, now=NOW)

        assert chat.chat_id == "uuid-recent"
        assert chat.created is False

    async def test_valid_pointer_is_returned_without_writes(self, db, audits):
        _chat(db, "uuid-old", age_days=9)
        _chat(db, "uuid-recent", age_days=1)
        _pointer(db, "uuid-old")
        before = dict(db.update_times)

        chat = await resolve_user_chat(db, USER, now=NOW)

        assert (chat.chat_id, chat.created) == ("uuid-old", False)
        assert db.update_times == before
        assert audits == []

    @pytest.mark.parametrize(
        ("pointed", "reason"),
        [
            ({}, "gone"),
            ({"is_deleted": True}, "deleted"),
            ({"owner": OTHER}, "foreign"),
        ],
    )
    async def test_invalid_pointer_chooses_again(self, db, audits, pointed, reason):
        if pointed:
            owner = pointed.pop("owner", USER)
            _chat(db, "uuid-pointed", owner=owner, **pointed)
        _chat(db, "uuid-valid")
        _pointer(db, "uuid-pointed")

        chat = await resolve_user_chat(db, USER, now=NOW)

        assert chat.chat_id == "uuid-valid"
        assert db.get_data("users", USER)["chat_id"] == "uuid-valid"
        assert db.get_data("users", USER)["phone"] == "+39 333"  # merge: the rest of the profile stays
        assert audits[0][1]["metadata"] == {"reason": reason, "created": False}

    async def test_merged_chat_leads_to_its_destination(self, db):
        _chat(db, "uuid-dest", age_days=5)
        _chat(db, "uuid-newer", age_days=0)
        _chat(db, "uuid-src", merged_into="uuid-dest")
        _pointer(db, "uuid-src")

        chat = await resolve_user_chat(db, USER, now=NOW)

        assert chat.chat_id == "uuid-dest"
        assert db.get_data("users", USER)["chat_id"] == "uuid-dest"

    async def test_merged_into_an_invalid_chat_chooses_again(self, db):
        _chat(db, "uuid-dest", owner=OTHER)
        _chat(db, "uuid-src", merged_into="uuid-dest")
        _chat(db, "uuid-valid")
        _pointer(db, "uuid-src")

        assert (await resolve_user_chat(db, USER, now=NOW)).chat_id == "uuid-valid"

    async def test_preferred_chat_wins_over_the_most_recent(self, db):
        _chat(db, "uuid-guest", age_days=3)
        _chat(db, "uuid-recent", age_days=0)

        chat = await resolve_user_chat(db, USER, now=NOW, prefer="uuid-guest")

        assert chat.chat_id == "uuid-guest"

    async def test_preferred_chat_never_replaces_a_valid_pointer(self, db):
        _chat(db, "uuid-account")
        _chat(db, "uuid-guest")
        _pointer(db, "uuid-account")

        chat = await resolve_user_chat(db, USER, now=NOW, prefer="uuid-guest")

        assert chat.chat_id == "uuid-account"

    async def test_invalid_preferred_chat_is_ignored(self, db):
        _chat(db, "uuid-foreign", owner=OTHER)
        _chat(db, "uuid-mine")

        chat = await resolve_user_chat(db, USER, now=NOW, prefer="uuid-foreign")

        assert chat.chat_id == "uuid-mine"

    async def test_two_calls_create_one_chat(self, db, audits):
        first = await resolve_user_chat(db, USER, now=NOW)
        second = await resolve_user_chat(db, USER, now=NOW)

        assert second.chat_id == first.chat_id
        assert second.created is False
        assert len(_sessions(db)) == 1
        assert len(audits) == 1

    async def test_all_reads_happen_before_writes(self, db):
        """Firestore transactions: the fake raises on a read after a write."""
        _chat(db, "uuid-src", merged_into="uuid-dest")
        _chat(db, "uuid-dest")
        _pointer(db, "uuid-src")

        assert (await resolve_user_chat(db, USER, now=NOW)).chat_id == "uuid-dest"


class TestRead:
    async def test_reads_the_valid_pointer_without_writes(self, db):
        _chat(db, "uuid-account")
        _pointer(db, "uuid-account")
        before = dict(db.update_times)

        assert await read_user_chat(db, USER) == "uuid-account"
        assert db.update_times == before

    async def test_follows_a_merge(self, db):
        _chat(db, "uuid-dest")
        _chat(db, "uuid-src", merged_into="uuid-dest")
        _pointer(db, "uuid-src")

        assert await read_user_chat(db, USER) == "uuid-dest"

    async def test_without_a_valid_pointer_the_most_recent_valid_chat(self, db):
        _chat(db, "uuid-old", age_days=9)
        _chat(db, "uuid-recent", age_days=1)
        _pointer(db, "uuid-gone")
        before = dict(db.update_times)

        assert await read_user_chat(db, USER) == "uuid-recent"
        assert db.update_times == before

    async def test_none_without_any_chat(self, db):
        assert await read_user_chat(db, USER) is None


async def test_assignment_is_logged_with_its_reason(db, caplog):
    caplog.set_level(logging.INFO, logger=service.__name__)

    await resolve_user_chat(db, USER, now=NOW)

    record, = [r for r in caplog.records if r.getMessage() == "[UserChat] Chat assigned"]
    assert (record.reason, record.chat_created) == ("missing", True)
