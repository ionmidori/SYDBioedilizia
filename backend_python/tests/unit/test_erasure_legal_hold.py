"""A quote that reached the client is kept intact for 10 years (user decision,
to be validated with counsel); everything else of the user is erased."""
from datetime import UTC, datetime, timedelta

import pytest
from src.services.erasure.legal_hold import (
    SENT_QUOTE_RETENTION,
    expired_holds,
    find_held_quotes,
    is_sent,
    mark_legal_hold,
    release_hold,
)
from tests.unit.firestore_fakes import FakeBucket, FakeDb

NOW = datetime(2026, 10, 17, 9, 0, tzinfo=UTC)
SENT = datetime(2026, 3, 1, 10, 0, tzinfo=UTC)
LATER = datetime(2026, 5, 1, 10, 0, tzinfo=UTC)


class TestIsSent:
    def test_a_draft_was_never_sent(self):
        assert is_sent({"status": "draft", "delivery_status": "none"}, []) is False

    def test_status_sent_alone_is_not_proof(self):
        # status flips to "sent" when the email is QUEUED, before the provider accepts it.
        assert is_sent({"status": "sent", "delivery_status": "queued"}, []) is False

    @pytest.mark.parametrize("status", ["sent", "delivered", "bounced", "complained"])
    def test_a_delivery_status_past_the_provider_is_proof(self, status):
        assert is_sent({"status": "in_review", "delivery_status": status}, []) is True

    def test_a_failed_delivery_is_not_proof(self):
        assert is_sent({"delivery_status": "failed"}, [{"status": "failed"}]) is False

    def test_quote_sent_at_is_proof(self):
        assert is_sent({"status": "in_review", "sent_at": SENT}, []) is True

    def test_a_delivery_with_sent_at_is_proof_even_if_the_quote_was_revised(self):
        # Revising a sent quote moves it back to in_review; the delivery remains.
        assert is_sent({"status": "in_review", "delivery_status": "none"}, [{"sent_at": SENT}]) is True

    def test_legacy_delivered_at_is_proof(self):
        assert is_sent({"delivered_at": SENT}, []) is True


def _quote(db: FakeDb, pid: str = "p1", **fields) -> None:
    db.put("projects", pid, "private_data", "quote", {"user_id": "u1", "status": "approved", **fields})


class TestFindHeldQuotes:
    async def test_unsent_quote_is_not_held(self):
        db = FakeDb()
        _quote(db, delivery_status="none")

        assert await find_held_quotes(db, "p1", now=NOW) == []

    async def test_sent_quote_is_held_for_ten_years_from_the_last_send(self):
        db = FakeDb()
        _quote(db, sent_at=SENT, pdf_blob_path="projects/p1/quotes/PRV-2026-0001_r1.pdf")
        db.put("projects", "p1", "private_data", "quote", "deliveries", "d1",
               {"sent_at": SENT, "pdf_blob_path": "projects/p1/quotes/PRV-2026-0001_r1.pdf"})
        db.put("projects", "p1", "private_data", "quote", "deliveries", "d2",
               {"sent_at": LATER, "pdf_blob_path": "projects/p1/quotes/PRV-2026-0001_r2.pdf"})

        [held] = await find_held_quotes(db, "p1", now=NOW)

        assert held.doc_id == "quote"
        assert held.retain_until == LATER + SENT_QUOTE_RETENTION
        assert held.blob_paths == frozenset({
            "projects/p1/quotes/PRV-2026-0001_r1.pdf",
            "projects/p1/quotes/PRV-2026-0001_r2.pdf",
        })

    async def test_sent_without_a_timestamp_starts_the_retention_now(self):
        db = FakeDb()
        _quote(db, delivery_status="delivered")

        [held] = await find_held_quotes(db, "p1", now=NOW)

        assert held.retain_until == NOW + SENT_QUOTE_RETENTION

    def test_retention_is_ten_years(self):
        assert SENT_QUOTE_RETENTION >= timedelta(days=365 * 10)

    async def test_project_without_quotes(self):
        assert await find_held_quotes(FakeDb(), "p1", now=NOW) == []


class TestMarkLegalHold:
    async def test_marks_the_quote_with_reason_and_retention(self):
        db = FakeDb()
        _quote(db, sent_at=SENT)
        [held] = await find_held_quotes(db, "p1", now=NOW)

        await mark_legal_hold(db, "p1", held, now=NOW)

        quote = db.get_data("projects", "p1", "private_data", "quote")
        assert quote["legal_hold"] == {
            "reason": "preventivo_inviato",
            "since": NOW,
            "retain_until": SENT + SENT_QUOTE_RETENTION,
        }
        assert quote["status"] == "approved"  # nothing else touched

    async def test_registers_the_hold_where_the_retention_job_finds_it(self):
        # The project document is gone by then: the registry is the index of
        # everything kept, and until when.
        db = FakeDb()
        _quote(db, sent_at=SENT, pdf_blob_path=PDF)
        [held] = await find_held_quotes(db, "p1", now=NOW)

        await mark_legal_hold(db, "p1", held, now=NOW)

        assert db.get_data("legal_holds", "p1:quote") == {
            "project_id": "p1",
            "quote_id": "quote",
            "reason": "preventivo_inviato",
            "since": NOW,
            "retain_until": SENT + SENT_QUOTE_RETENTION,
            "blob_paths": [PDF],
        }

    async def test_marking_again_keeps_the_original_start(self):
        db = FakeDb()
        _quote(db, sent_at=SENT)
        [held] = await find_held_quotes(db, "p1", now=NOW)
        await mark_legal_hold(db, "p1", held, now=NOW)

        [again] = await find_held_quotes(db, "p1", now=NOW + timedelta(days=7))
        await mark_legal_hold(db, "p1", again, now=NOW + timedelta(days=7))

        assert db.get_data("projects", "p1", "private_data", "quote")["legal_hold"]["since"] == NOW
        assert db.get_data("legal_holds", "p1:quote")["since"] == NOW


PDF = "projects/p1/quotes/PRV-2026-0001_r1.pdf"
EXPIRED = SENT + SENT_QUOTE_RETENTION + timedelta(days=1)


async def _held_project(db: FakeDb, bucket: FakeBucket) -> None:
    """What an erasure leaves of a project with a sent quote."""
    _quote(db, sent_at=SENT, pdf_blob_path=PDF, client_snapshot={"email": "mario@example.it"})
    db.put("projects", "p1", "private_data", "quote", "deliveries", "d1", {"sent_at": SENT, "pdf_blob_path": PDF})
    db.put("projects", "p1", "private_data", "quote", "revisions", "1", {"items": []})
    bucket.names.add(PDF)
    [held] = await find_held_quotes(db, "p1", now=NOW)
    await mark_legal_hold(db, "p1", held, now=NOW)


class TestExpiredHolds:
    async def test_a_running_hold_is_not_expired(self):
        db, bucket = FakeDb(), FakeBucket()
        await _held_project(db, bucket)

        assert await expired_holds(db, now=NOW, limit=10) == []

    async def test_a_hold_past_its_retention_is_listed(self):
        db, bucket = FakeDb(), FakeBucket()
        await _held_project(db, bucket)

        [hold] = await expired_holds(db, now=EXPIRED, limit=10)

        assert (hold.project_id, hold.quote_id, hold.blob_paths) == ("p1", "quote", (PDF,))

    async def test_release_erases_the_quote_its_history_its_pdfs_and_the_record(self):
        db, bucket = FakeDb(), FakeBucket(["projects/p2/quotes/other.pdf"])
        await _held_project(db, bucket)
        db.put("projects", "p2", "private_data", "quote", {"user_id": "u2"})
        [hold] = await expired_holds(db, now=EXPIRED, limit=10)

        await release_hold(db, bucket, hold)

        assert [p for p in db.docs if p[:2] == ("projects", "p1")] == []
        assert db.get_data("legal_holds", "p1:quote") is None
        assert bucket.names == {"projects/p2/quotes/other.pdf"}
        assert db.get_data("projects", "p2", "private_data", "quote") == {"user_id": "u2"}

    async def test_release_is_idempotent(self):
        db, bucket = FakeDb(), FakeBucket()
        await _held_project(db, bucket)
        [hold] = await expired_holds(db, now=EXPIRED, limit=10)
        bucket.names.clear()  # an earlier, interrupted release already removed the PDF

        await release_hold(db, bucket, hold)
        await release_hold(db, bucket, hold)

        assert db.get_data("legal_holds", "p1:quote") is None
