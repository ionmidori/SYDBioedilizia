"""Transactional email outbox (Phase 128 — Fase 4): enqueue with the state
change, idempotency, lease, retry/backoff, dead-letter, sweep, webhook events."""
from datetime import UTC, datetime, timedelta

import pytest
from src.core.exceptions import InvalidQuoteTransitionError
from src.services.email import outbox
from src.services.email.console import ConsoleProvider
from src.services.email.types import DeliveryEvent, OutboundEmail, ProviderError, ProviderResult
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

PID = "p1"
QUOTE = ("projects", PID, "private_data", "quote")
NOW = datetime(2026, 10, 11, 10, 0, tzinfo=UTC)
PDF = b"%PDF-1.4 fake"


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()

    async def transact(_db, body):
        return await body(FakeTransaction(fake))

    monkeypatch.setattr(outbox, "_transact", transact)
    monkeypatch.setattr(outbox, "_download_sync", lambda path: PDF)
    return fake


def _seed(db: FakeDb, **overrides) -> None:
    doc = {
        "doc_type": "quote", "project_id": PID, "user_id": "uid-1", "status": "approved",
        "quote_number": "PRV-2026-0042", "version": 2,
        "items": [], "financials": {"subtotal": 100.0, "vat_rate": 0.22, "vat_amount": 22.0, "grand_total": 122.0},
        "client_snapshot": {"uid": "uid-1", "display_name": "Mario Rossi", "email": "mario@example.it"},
        "pdf_blob_path": f"projects/{PID}/quotes/PRV-2026-0042_r2.pdf", "pdf_revision": 2,
        "review": {"approved_by": "admin-a", "approved_at": NOW, "approved_revision": 2},
        "delivery_status": "none",
    }
    doc.update(overrides)
    db.put(*QUOTE, doc)


async def _enqueue(db, key="key-0001", **kwargs):
    args = {"to": "mario@example.it", "cc": [], "subject": None, "message": None, "actor": "admin-a",
            "idempotency_key": key, "now": NOW}
    args.update(kwargs)
    return await outbox.enqueue_quote_delivery(db, PID, **args)


def _delivery(db, delivery_id):
    return db.get_data(*QUOTE, "deliveries", delivery_id)


def _outbox(db, outbox_id):
    return db.get_data("email_outbox", outbox_id)


class FailingProvider:
    name = "smtp"

    def __init__(self, permanent: bool = False) -> None:
        self.permanent = permanent
        self.calls = 0

    async def send(self, email: OutboundEmail) -> ProviderResult:
        self.calls += 1
        raise ProviderError("down", permanent=self.permanent, status_code=550 if self.permanent else 451)


# ── Enqueue ───────────────────────────────────────────────────────────────────


async def test_enqueue_records_send_intent_with_the_state_change(db):
    _seed(db)
    result = await _enqueue(db, cc=["socio@example.it"], message="Restiamo a disposizione.")

    assert result.status == "sent" and not result.duplicate
    quote = db.get_data(*QUOTE)
    assert quote["status"] == "sent" and quote["delivery_status"] == "queued"
    assert quote["last_delivery_id"] == result.delivery_id
    delivery = _delivery(db, result.delivery_id)
    assert delivery["to"] == "mario@example.it" and delivery["cc"] == ["socio@example.it"]
    assert delivery["revision"] == 2 and delivery["pdf_blob_path"].endswith("PRV-2026-0042_r2.pdf")
    assert delivery["status"] == "queued" and delivery["created_by"] == "admin-a"
    entry = _outbox(db, result.delivery_id)
    assert entry["status"] == "pending" and entry["kind"] == "quote_delivery" and entry["next_attempt_at"] == NOW


async def test_same_idempotency_key_never_sends_twice(db):
    _seed(db)
    first = await _enqueue(db)
    docs_before = dict(db.docs)
    second = await _enqueue(db)
    assert second.duplicate and second.delivery_id == first.delivery_id
    assert db.docs == docs_before


async def test_resend_creates_a_new_delivery_and_points_the_quote_to_it(db):
    _seed(db)
    first = await _enqueue(db, key="key-0001")
    second = await _enqueue(db, key="key-0002", to="altro@example.it")
    assert second.delivery_id != first.delivery_id and second.status == "sent"
    assert db.get_data(*QUOTE)["last_delivery_id"] == second.delivery_id
    assert _delivery(db, second.delivery_id)["to"] == "altro@example.it"


@pytest.mark.parametrize("status", ["draft", "pending_review", "in_review", "rejected"])
async def test_only_approved_or_sent_quotes_can_be_sent(db, status):
    _seed(db, status=status)
    with pytest.raises(InvalidQuoteTransitionError):
        await _enqueue(db)
    assert db.get_data(*QUOTE)["status"] == status


@pytest.mark.parametrize(
    "overrides",
    [{"pdf_blob_path": None}, {"pdf_revision": 1}],  # no PDF / PDF of an older version
)
async def test_refuses_without_the_pdf_of_the_approved_version(db, overrides):
    _seed(db, **overrides)
    with pytest.raises(outbox.PdfNotReadyError):
        await _enqueue(db)


def test_delivery_id_is_deterministic_and_project_scoped():
    assert outbox.delivery_id_for("p1", "k") == outbox.delivery_id_for("p1", "k")
    assert outbox.delivery_id_for("p1", "k") != outbox.delivery_id_for("p2", "k")


def test_backoff_doubles_and_caps():
    assert [outbox.backoff(n).total_seconds() / 60 for n in (1, 2, 3, 4)] == [1, 2, 4, 8]
    assert outbox.backoff(20) == timedelta(minutes=60)


# ── Dispatch ──────────────────────────────────────────────────────────────────


async def test_dispatch_sends_the_pdf_and_records_success(db):
    _seed(db)
    queued = await _enqueue(db, cc=["socio@example.it"], message="Restiamo a disposizione.")
    provider = ConsoleProvider()

    assert await outbox.dispatch_one(db, queued.delivery_id, provider, NOW) == "sent"

    [email] = provider.sent
    assert email.to == "mario@example.it" and email.cc == ("socio@example.it",)
    assert email.subject == "Bozza di preventivo PRV-2026-0042 – SYD Bioedilizia"
    assert "Gentile Mario Rossi" in email.text and "Restiamo a disposizione." in email.text
    assert email.attachments[0].filename == "Bozza_preventivo_PRV-2026-0042.pdf"
    assert email.attachments[0].content == PDF
    assert email.reference == queued.delivery_id and email.list_unsubscribe
    delivery = _delivery(db, queued.delivery_id)
    assert delivery["status"] == "sent" and delivery["provider_message_id"].startswith("<console-")
    assert db.get_data(*QUOTE)["delivery_status"] == "sent"
    assert _outbox(db, queued.delivery_id)["status"] == "done"
    index = db.get_data("email_messages", outbox.message_index_id("console", delivery["provider_message_id"]))
    assert index == {"provider": "console", "project_id": PID, "delivery_id": queued.delivery_id,
                     "created_at": index["created_at"]}
    # a second dispatch of the same entry does nothing
    assert await outbox.dispatch_one(db, queued.delivery_id, provider, NOW) == "skipped"
    assert len(provider.sent) == 1


async def test_subject_override_is_used(db):
    _seed(db)
    queued = await _enqueue(db, subject="Il tuo preventivo per la cucina")
    provider = ConsoleProvider()
    await outbox.dispatch_one(db, queued.delivery_id, provider, NOW)
    assert provider.sent[0].subject == "Il tuo preventivo per la cucina"


async def test_transient_failure_retries_later_with_backoff(db):
    _seed(db)
    queued = await _enqueue(db)
    provider = FailingProvider()

    assert await outbox.dispatch_one(db, queued.delivery_id, provider, NOW) == "retry"
    entry = _outbox(db, queued.delivery_id)
    assert entry["status"] == "pending" and entry["attempts"] == 1
    assert entry["last_error"] == "transient:451"
    assert db.get_data(*QUOTE)["delivery_status"] == "queued"
    assert _delivery(db, queued.delivery_id)["status"] == "queued"
    # not due before the backoff expires
    assert await outbox.dispatch_one(db, queued.delivery_id, provider, NOW) == "skipped"
    later = entry["next_attempt_at"]
    assert later > NOW
    assert await outbox.dispatch_one(db, queued.delivery_id, ConsoleProvider(), later) == "sent"


async def test_permanent_failure_dead_letters_and_tells_the_admin(db):
    _seed(db)
    queued = await _enqueue(db)
    assert await outbox.dispatch_one(db, queued.delivery_id, FailingProvider(permanent=True), NOW) == "dead"
    assert _outbox(db, queued.delivery_id)["status"] == "dead"
    assert _delivery(db, queued.delivery_id)["status"] == "failed"
    assert db.get_data(*QUOTE)["delivery_status"] == "failed"


async def test_gives_up_after_max_attempts(db, monkeypatch):
    monkeypatch.setattr(outbox.settings, "EMAIL_MAX_ATTEMPTS", 2)
    _seed(db)
    queued = await _enqueue(db)
    provider = FailingProvider()
    assert await outbox.dispatch_one(db, queued.delivery_id, provider, NOW) == "retry"
    due = _outbox(db, queued.delivery_id)["next_attempt_at"]
    assert await outbox.dispatch_one(db, queued.delivery_id, provider, due) == "dead"
    assert provider.calls == 2 and db.get_data(*QUOTE)["delivery_status"] == "failed"


async def test_a_fresh_lease_blocks_a_second_worker_until_it_expires(db):
    _seed(db)
    queued = await _enqueue(db)
    entry = await outbox.lease_tx(FakeTransaction(db), db, queued.delivery_id, NOW)  # worker A holds it
    assert entry is not None and entry["attempts"] == 1
    assert await outbox.dispatch_one(db, queued.delivery_id, ConsoleProvider(), NOW + timedelta(minutes=1)) == "skipped"
    # worker A died: after the lease the sweeper may send it
    after = NOW + outbox.LEASE + timedelta(seconds=1)
    assert await outbox.dispatch_one(db, queued.delivery_id, ConsoleProvider(), after) == "sent"


async def test_render_errors_are_retried_like_transient_ones(db, monkeypatch):
    _seed(db)
    queued = await _enqueue(db)

    def storage_down(path):
        raise OSError("storage unavailable")

    monkeypatch.setattr(outbox, "_download_sync", storage_down)
    assert await outbox.dispatch_one(db, queued.delivery_id, ConsoleProvider(), NOW) == "retry"
    assert _outbox(db, queued.delivery_id)["last_error"] == "transient:OSError"


async def test_admin_notification_is_sent_from_the_stored_message(db):
    outbox_id = await outbox.enqueue_message(
        db, kind="admin_notification", to="admin@syd.it", subject="[SYD] Nuova richiesta", text="t", html="<p>t</p>",
        now=NOW,
    )
    provider = ConsoleProvider()
    assert await outbox.dispatch_one(db, outbox_id, provider, NOW) == "sent"
    assert provider.sent[0].to == "admin@syd.it" and provider.sent[0].subject == "[SYD] Nuova richiesta"
    assert _outbox(db, outbox_id)["status"] == "done"


async def test_sweep_dispatches_only_due_entries_and_expired_leases(db):
    _seed(db)
    due = await _enqueue(db, key="key-due")
    future = await outbox.enqueue_message(db, kind="admin_notification", to="a@x.it", subject="s", text="t",
                                          html=None, now=NOW + timedelta(hours=1))
    stale = await outbox.enqueue_message(db, kind="admin_notification", to="a@x.it", subject="s", text="t",
                                         html=None, now=NOW)
    await outbox.lease_tx(FakeTransaction(db), db, stale, NOW - timedelta(minutes=10))  # lease long expired
    provider = ConsoleProvider()

    counts = await outbox.sweep(db, provider, NOW)

    assert counts["sent"] == 2
    assert _outbox(db, due.delivery_id)["status"] == "done"
    assert _outbox(db, stale)["status"] == "done"
    assert _outbox(db, future)["status"] == "pending"


# ── Provider events (webhook) ─────────────────────────────────────────────────


async def _sent(db) -> tuple[str, str]:
    _seed(db)
    queued = await _enqueue(db)
    await outbox.dispatch_one(db, queued.delivery_id, ConsoleProvider(), NOW)
    return queued.delivery_id, _delivery(db, queued.delivery_id)["provider_message_id"]


def _event(message_id, event, minutes=1, provider="console"):
    return DeliveryEvent(provider=provider, message_id=message_id, event=event,
                         occurred_at=NOW + timedelta(minutes=minutes), raw_event=event)


async def test_delivered_then_bounced_moves_forward_never_back(db):
    delivery_id, message_id = await _sent(db)

    assert await outbox.apply_events(db, [_event(message_id, "delivered")]) == 1
    assert _delivery(db, delivery_id)["status"] == "delivered"
    assert db.get_data(*QUOTE)["delivery_status"] == "delivered"

    await outbox.apply_events(db, [_event(message_id, "complained", minutes=5)])
    assert _delivery(db, delivery_id)["status"] == "complained"

    await outbox.apply_events(db, [_event(message_id, "delivered", minutes=9)])
    assert _delivery(db, delivery_id)["status"] == "complained"  # a late "delivered" never hides a complaint
    assert [e["event"] for e in _delivery(db, delivery_id)["events"]] == ["delivered", "complained", "delivered"]


async def test_duplicate_and_unknown_events_are_ignored(db):
    delivery_id, message_id = await _sent(db)
    assert await outbox.apply_events(db, [_event(message_id, "delivered"), _event(message_id, "delivered")]) == 1
    assert len(_delivery(db, delivery_id)["events"]) == 1
    assert await outbox.apply_events(db, [_event("<unknown@x>", "delivered")]) == 0


async def test_events_of_an_older_delivery_do_not_change_the_quote(db):
    first_id, first_msg = await _sent(db)
    second = await _enqueue(db, key="key-0002")
    await outbox.dispatch_one(db, second.delivery_id, ConsoleProvider(), NOW)

    await outbox.apply_events(db, [_event(first_msg, "bounced")])
    assert _delivery(db, first_id)["status"] == "bounced"
    assert db.get_data(*QUOTE)["delivery_status"] == "sent"  # the quote follows its latest send


async def test_soft_bounce_and_opens_are_recorded_without_changing_status(db):
    delivery_id, message_id = await _sent(db)
    await outbox.apply_events(db, [_event(message_id, "soft_bounced"), _event(message_id, "opened", minutes=2)])
    delivery = _delivery(db, delivery_id)
    assert delivery["status"] == "sent" and len(delivery["events"]) == 2
