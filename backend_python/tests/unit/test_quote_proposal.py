"""A change asked in the chat while the team has the quote: SYD drafts an AI
revision proposal for the team (relay plan, PR 3). It lives in its own doc,
never on the quote, and the admin email carries its price range."""
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from src.core.config import settings
from src.schemas.admin_quote import QuoteProposal
from src.schemas.intervention_spec import RoomInterventionSpec
from src.schemas.price_range import PriceEstimate
from src.schemas.quote import (
    ManualWorkItem,
    QuoteFinancials,
    QuoteItem,
    QuoteRoom,
    QuoteSchema,
    RevisionRoomSpec,
)
from src.services import quote_followup, quote_proposal
from src.services.email import outbox
from src.services.quote_build import BuiltDraft
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

PID = "chat-123"
QUOTE_PATH = ("projects", PID, "private_data", "quote")
PROPOSAL_PATH = ("projects", PID, "private_data", "quote_proposal")
NOW = datetime(2026, 11, 19, 10, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def admin_email(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAIL", "team@example.it")


def _seed(db: FakeDb, status: str = "in_review", version: int = 4) -> dict:
    quote = {
        "status": status, "quote_number": "PRV-2026-0007", "version": version,
        "items": [{"sku": "ADMIN-EDIT", "qty": 3}],
        "rooms": [{"room_id": "bagno1", "room_label": "Bagno", "room_type": "bagno"}],
        "client_snapshot": {"display_name": "Mario Rossi", "email": "mario@example.it"},
    }
    db.put(*QUOTE_PATH, quote)
    return quote


def _built(total: str = "1200.00") -> BuiltDraft:
    quote = QuoteSchema(
        project_id=PID, user_id="u1",
        items=[QuoteItem(sku="PIT-001", description="Pittura", unit="mq", qty=10, unit_price=12,
                         total=Decimal("120.00"), room_id="salone1")],
        rooms=[QuoteRoom(room_id="bagno1", room_label="Bagno", room_type="bagno"),
               QuoteRoom(room_id="salone1", room_label="Salone", room_type="soggiorno", floor_mq=30)],
        financials=QuoteFinancials(subtotal=Decimal(total), grand_total=Decimal(total)),
        estimate=PriceEstimate(low=Decimal("1100.00"), high=Decimal("1500.00"), precision=70, policy_version="v1"),
    )
    spec = RevisionRoomSpec(room_id="salone1", spec=RoomInterventionSpec(library_version="v1", generated_at=NOW))
    return BuiltDraft(
        quote=quote, manual_work=[ManualWorkItem(work="Rasatura", origin="package")], ai_warnings=[], specs=[spec],
    )


def _draft(summary: str = "Salone: pittura pareti") -> quote_proposal.ProposalDraft:
    return quote_proposal.ProposalDraft(built=_built(), summary=summary)


def _outbox(db: FakeDb) -> list[dict]:
    return [doc for path, doc in db.docs.items() if path[0] == outbox.OUTBOX]


async def _relay(db: FakeDb, proposal=None, when: datetime = NOW):
    return await quote_followup.relay_tx(FakeTransaction(db), db, PID, when, proposal=proposal)


async def test_the_proposal_is_stored_apart_and_the_quote_is_untouched():
    db = FakeDb()
    _seed(db)

    result, _ = await _relay(db, _draft())

    assert result is not None
    assert db.get_data(*QUOTE_PATH)["items"] == [{"sku": "ADMIN-EDIT", "qty": 3}]
    stored = QuoteProposal.model_validate(db.get_data(*PROPOSAL_PATH))
    assert stored.based_on_version == 4 and stored.created_at == NOW and stored.applied_at is None
    assert stored.summary == "Salone: pittura pareti"
    assert [i.sku for i in stored.items] == ["PIT-001"]
    assert [r.room_label for r in stored.rooms] == ["Bagno", "Salone"]
    assert stored.estimate is not None and stored.estimate.low == Decimal("1100.00")
    assert [w.work for w in stored.manual_work] == ["Rasatura"]
    assert [s.room_id for s in stored.specs] == ["salone1"]


async def test_the_admin_email_carries_the_proposal_range_and_new_rooms():
    db = FakeDb()
    _seed(db)

    await _relay(db, _draft())

    [entry] = _outbox(db)
    text = entry["message"]["text"]
    assert "proposta" in text.lower()
    assert "1.100,00" in text and "1.500,00" in text
    assert "Salone" in text  # the room the quote did not have
    assert "1.100,00" in entry["message"]["html"]


async def test_without_a_proposal_the_email_is_the_old_one():
    db = FakeDb()
    _seed(db)

    await _relay(db)

    [entry] = _outbox(db)
    assert "proposta" not in entry["message"]["text"].lower()
    assert db.get_data(*PROPOSAL_PATH) is None


async def test_a_second_request_replaces_the_proposal_and_emails_once():
    db = FakeDb()
    _seed(db)
    await _relay(db, _draft("prima"))

    await _relay(db, _draft("seconda"), NOW + timedelta(hours=1))

    stored = QuoteProposal.model_validate(db.get_data(*PROPOSAL_PATH))
    assert stored.summary == "seconda" and stored.created_at == NOW + timedelta(hours=1)
    assert len(_outbox(db)) == 1


async def test_a_proposal_after_a_plain_relay_still_reaches_the_team():
    """The first request lacked a measure (relayed without a proposal); once the
    client answers, the proposal gets its own email."""
    db = FakeDb()
    _seed(db)
    await _relay(db)

    await _relay(db, _draft(), NOW + timedelta(hours=1))

    texts = [entry["message"]["text"].lower() for entry in _outbox(db)]
    assert len(texts) == 2
    assert sum("proposta" in text for text in texts) == 1


async def test_a_plain_relay_after_a_proposal_emails_nothing_more():
    db = FakeDb()
    _seed(db)
    await _relay(db, _draft())

    await _relay(db, when=NOW + timedelta(hours=1))

    assert len(_outbox(db)) == 1


async def test_a_quote_the_chat_may_draft_gets_no_proposal():
    db = FakeDb()
    _seed(db, status="draft")

    result, _ = await _relay(db, _draft())

    assert result is None
    assert db.get_data(*PROPOSAL_PATH) is None


async def test_relay_client_request_passes_the_proposal(monkeypatch):
    db = FakeDb()
    _seed(db)

    async def transact(_db, body):
        return await body(FakeTransaction(db))

    monkeypatch.setattr(quote_followup, "_transact", transact)
    monkeypatch.setattr(outbox, "dispatch_soon", _no_dispatch)

    result = await quote_followup.relay_client_request(db, PID, NOW, proposal=_draft())

    assert result is not None and result.notified
    assert db.get_data(*PROPOSAL_PATH) is not None


async def _no_dispatch(*_args, **_kwargs) -> None:
    return None


async def test_read_proposal():
    db = FakeDb()
    assert await quote_proposal.read_proposal(db, PID) is None
    _seed(db)
    await _relay(db, _draft())

    proposal = await quote_proposal.read_proposal(db, PID)

    assert proposal is not None and proposal.based_on_version == 4


async def test_an_unreadable_proposal_reads_as_none():
    db = FakeDb()
    db.put(*PROPOSAL_PATH, {"based_on_version": "x"})

    assert await quote_proposal.read_proposal(db, PID) is None


def test_the_specs_never_reach_the_api():
    db_doc = quote_proposal.to_proposal(_draft(), version=2, now=NOW)

    assert "specs" not in db_doc.model_dump(mode="json")
    assert db_doc.specs  # kept for the apply step


def test_the_proposal_doc_is_not_an_inbox_quote():
    payload = quote_proposal.proposal_payload(quote_proposal.to_proposal(_draft(), version=2, now=NOW))

    assert payload.get("doc_type") != "quote"
    assert payload["specs"]  # stored explicitly, like QuoteRevision
