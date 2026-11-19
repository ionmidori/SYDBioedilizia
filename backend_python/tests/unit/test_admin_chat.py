"""The client chat in the admin dossier (relay plan, PR 5): the turns the client
and SYD exchanged, with the part the team has to read highlighted."""
from __future__ import annotations

from datetime import UTC, datetime

import pytest
from src.core.exceptions import QuoteNotFoundError
from src.repositories import conversation_repository, room_repository
from src.services import admin_chat
from tests.unit.firestore_fakes import FakeDb

PID = "p-chat"
QUOTE = ("projects", PID, "private_data", "quote")
T_SENT = datetime(2026, 11, 10, 9, 0, tzinfo=UTC)
T_SUBMIT = datetime(2026, 11, 19, 10, 0, tzinfo=UTC)


def _at(day: int, hour: int) -> datetime:
    return datetime(2026, 11, day, hour, 0, tzinfo=UTC)


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(conversation_repository, "get_async_firestore_client", lambda: fake)
    monkeypatch.setattr(room_repository, "get_async_firestore_client", lambda: fake)
    fake.put("projects", PID, "rooms", "bagno", {
        "room_id": "bagno", "label": "Bagno", "room_type": "bagno", "created_at": T_SENT, "updated_at": T_SENT,
    })
    return fake


def _quote(db: FakeDb, **fields) -> None:
    db.put(*QUOTE, {"project_id": PID, "status": "in_review", "version": 3, **fields})


def _message(db: FakeDb, msg_id: str, at: datetime, role: str = "user", content: str = "ciao", **fields) -> None:
    db.put("sessions", PID, "messages", msg_id, {"role": role, "content": content, "timestamp": at, **fields})


async def test_a_change_asked_with_the_team_is_highlighted_from_the_submission(db):
    _quote(db, submitted_at=T_SUBMIT, client_followup={"requested_at": _at(19, 12), "count": 1, "version": 3})
    _message(db, "before", _at(19, 9), content="vorrei rifare il bagno")
    _message(db, "after", _at(19, 11), content="aggiungo anche la cucina")
    _message(db, "reply", _at(19, 12), role="assistant", content="ho inviato al team la richiesta")

    chat = await admin_chat.admin_chat(db, PID)

    assert chat.change_kind == "followup" and chat.change_since == T_SUBMIT
    assert [(m.id, m.in_change) for m in chat.messages] == [("before", False), ("after", True), ("reply", True)]
    assert not chat.truncated


async def test_a_quote_submitted_before_submitted_at_existed_highlights_nothing(db):
    _quote(db, client_followup={"requested_at": _at(19, 12), "count": 1, "version": 3})
    _message(db, "m1", _at(19, 11))

    chat = await admin_chat.admin_chat(db, PID)

    assert chat.change_kind == "followup" and chat.change_since is None
    assert [m.in_change for m in chat.messages] == [False]


async def test_a_followup_on_an_older_version_is_not_the_current_change(db):
    _quote(db, submitted_at=T_SUBMIT, client_followup={"requested_at": _at(19, 12), "count": 1, "version": 2})
    _message(db, "m1", _at(19, 11))

    chat = await admin_chat.admin_chat(db, PID)

    assert chat.change_kind is None and chat.change_since is None
    assert [m.in_change for m in chat.messages] == [False]


async def test_a_revision_opened_by_the_client_is_highlighted_from_the_last_send(db):
    _quote(db, client_revision=True, submitted_at=T_SUBMIT)
    db.put(*QUOTE, "deliveries", "d1", {"revision": 2, "status": "delivered", "sent_at": T_SENT})
    db.put(*QUOTE, "revisions", "2", {"version": 2, "financials": {"grand_total": 100.0}})
    _message(db, "old", _at(9, 9))
    _message(db, "new", _at(12, 9))

    chat = await admin_chat.admin_chat(db, PID)

    assert chat.change_kind == "revision" and chat.change_since == T_SENT
    assert [(m.id, m.in_change) for m in chat.messages] == [("old", False), ("new", True)]


async def test_only_the_text_turns_reach_the_admin(db):
    _quote(db)
    _message(db, "photo", _at(19, 9), content="", attachments={"images": ["https://x/a.jpg"], "videos": []},
             metadata={"room_id": "bagno"})
    _message(db, "call", _at(19, 10), role="assistant", content="", tool_calls=[{"name": "select_room"}])
    _message(db, "tool", _at(19, 11), role="tool", content='{"ok": true}', tool_call_id="tc-1")
    _message(db, "empty", _at(19, 12), content="  ", attachments={"images": [], "videos": []})
    _message(db, "gone", _at(19, 13), content="e qui?", metadata={"room_id": "deleted-room"})

    chat = await admin_chat.admin_chat(db, PID)

    assert chat.change_kind is None
    [photo, gone] = chat.messages
    assert (photo.id, photo.has_media, photo.room_label, photo.text) == ("photo", True, "Bagno", "")
    assert (gone.id, gone.has_media, gone.room_label) == ("gone", False, None)


async def test_a_long_chat_keeps_the_newest_messages(db, monkeypatch):
    monkeypatch.setattr(admin_chat.settings, "ADMIN_CHAT_MAX_MESSAGES", 2)
    _quote(db)
    for hour in (9, 10, 11):
        _message(db, f"m{hour}", _at(19, hour))

    chat = await admin_chat.admin_chat(db, PID)

    assert [m.id for m in chat.messages] == ["m10", "m11"]
    assert chat.truncated


@pytest.mark.parametrize("status", [None, "deleted"])
async def test_a_missing_quote_is_not_found(db, status):
    if status:
        _quote(db, status=status)
    with pytest.raises(QuoteNotFoundError):
        await admin_chat.admin_chat(db, PID)
