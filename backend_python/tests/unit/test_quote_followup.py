"""A change asked in the chat while the team has the quote reaches the team
(Phase 139 PR-3): before, the agent promised it and nothing was written."""
from datetime import UTC, datetime, timedelta

import pytest
from src.core.config import settings
from src.schemas.quote import QuoteSchema
from src.services import quote_followup
from src.services.email import outbox
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

PID = "chat-123"
QUOTE_PATH = ("projects", PID, "private_data", "quote")
NOW = datetime(2026, 11, 3, 10, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def admin_email(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAIL", "team@example.it")


def _seed(db: FakeDb, status: str = "in_review", version: int = 4, **extra) -> dict:
    quote = {
        "status": status,
        "quote_number": "PRV-2026-0007",
        "version": version,
        "items": [{"sku": "ADMIN-EDIT", "qty": 3}],
        "client_snapshot": {"display_name": "Mario Rossi", "email": "mario@example.it"},
        **extra,
    }
    db.put(*QUOTE_PATH, quote)
    return quote


def _outbox(db: FakeDb) -> list[dict]:
    return [doc for path, doc in db.docs.items() if path[0] == outbox.OUTBOX]


async def _relay(db: FakeDb, when: datetime = NOW):
    return await quote_followup.relay_tx(FakeTransaction(db), db, PID, when)


@pytest.mark.parametrize("status", ["pending_review", "in_review", "approved"])
async def test_the_request_is_recorded_and_the_admin_emailed_once(status):
    db = FakeDb()
    _seed(db, status)

    result, outbox_id = await _relay(db)

    assert result is not None
    assert (result.status, result.quote_number, result.notified) == (status, "PRV-2026-0007", True)
    doc = db.get_data(*QUOTE_PATH)
    assert doc["items"] == [{"sku": "ADMIN-EDIT", "qty": 3}]  # the team's work is untouched
    assert doc["client_followup"] == {"requested_at": NOW, "count": 1, "version": 4}
    [entry] = _outbox(db)
    assert outbox_id == quote_followup.followup_id_for(PID, 4, status)
    assert entry["kind"] == "admin_notification"
    assert entry["message"]["to"] == "team@example.it"
    assert entry["message"]["subject"] == "[SYD] PRV-2026-0007: Mario Rossi chiede modifiche in chat"
    assert entry["project_id"] == PID


async def test_more_requests_on_the_same_version_count_but_email_once():
    db = FakeDb()
    _seed(db)
    await _relay(db)

    result, outbox_id = await _relay(db, NOW + timedelta(hours=1))

    assert result is not None and not result.notified and outbox_id is None
    assert db.get_data(*QUOTE_PATH)["client_followup"] == {
        "requested_at": NOW + timedelta(hours=1), "count": 2, "version": 4,
    }
    assert len(_outbox(db)) == 1


async def test_a_new_version_of_the_team_emails_again():
    db = FakeDb()
    _seed(db)
    await _relay(db)
    db.docs[QUOTE_PATH]["version"] = 5  # the admin edited the quote

    result, _ = await _relay(db)

    assert result is not None and result.notified
    assert db.get_data(*QUOTE_PATH)["client_followup"]["count"] == 1
    assert len(_outbox(db)) == 2


async def test_without_admin_email_the_request_is_still_recorded(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAIL", "")
    db = FakeDb()
    _seed(db)

    result, outbox_id = await _relay(db)

    assert result is not None and not result.notified and outbox_id is None
    assert db.get_data(*QUOTE_PATH)["client_followup"]["count"] == 1
    assert _outbox(db) == []


async def test_a_sent_quote_with_its_email_still_queued_is_relayed():
    db = FakeDb()
    _seed(db, "sent", delivery_status="queued")
    result, _ = await _relay(db)
    assert result is not None and result.status == "sent"


@pytest.mark.parametrize("status", [None, "draft", "sent", "rejected", "deleted"])
async def test_nothing_to_relay_when_the_chat_can_write_the_quote(status):
    # The state changed since the tool read it: the caller drafts instead.
    db = FakeDb()
    if status is not None:
        _seed(db, status)
    tx = FakeTransaction(db)

    result, outbox_id = await quote_followup.relay_tx(tx, db, PID, NOW)

    assert (result, outbox_id) == (None, None)
    assert tx.writes == []


async def test_relay_client_request_dispatches_the_email(monkeypatch):
    db = FakeDb()
    _seed(db)
    sent: list[str] = []

    async def transact(_db, body):
        return await body(FakeTransaction(db))

    async def dispatch(_db, outbox_id, _now):
        sent.append(outbox_id)

    monkeypatch.setattr(quote_followup, "_transact", transact)
    monkeypatch.setattr(outbox, "dispatch_soon", dispatch)

    result = await quote_followup.relay_client_request(db, PID, NOW)

    assert result is not None and result.notified
    assert sent == [quote_followup.followup_id_for(PID, 4, "in_review")]


async def test_the_recorded_request_is_part_of_the_quote_schema():
    db = FakeDb()
    _seed(db)
    await _relay(db)
    stored = db.get_data(*QUOTE_PATH)["client_followup"]
    quote = QuoteSchema(project_id=PID, user_id="uid-1", client_followup=stored)  # extra="forbid"
    assert quote.client_followup is not None and quote.client_followup.count == 1


async def test_a_request_after_the_approval_reaches_the_team_too():
    # Approving does not bump the version: the email is per version AND status.
    db = FakeDb()
    _seed(db, "in_review")
    await _relay(db)
    db.docs[QUOTE_PATH]["status"] = "approved"

    result, outbox_id = await _relay(db)

    assert result is not None and result.notified and outbox_id is not None
    assert len(_outbox(db)) == 2
