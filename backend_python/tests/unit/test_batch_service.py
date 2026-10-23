"""
BatchService tests — PR 2 (chat quote submit).

The service is the single submission path shared by the REST routes and the
chat tool submit_quote_request. Logic extracted 1:1 from batch_routes.py.
"""
import asyncio
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.core.exceptions import (
    BatchNotFoundError,
    BatchNotSubmittableError,
    NoEligibleProjectsError,
    PermissionDenied,
)
from src.services import batch_service

USER = "client-uid-123"


def _doc(exists: bool, data: dict | None = None):
    doc = MagicMock()
    doc.exists = exists
    doc.to_dict.return_value = data or {}
    return doc


def _make_db(project_docs: dict, quote_docs: dict, batch_doc=None):
    """
    Firestore mock:
      projects/{pid}                     → project_docs[pid]
      projects/{pid}/private_data/quote  → quote_docs[pid]
      quote_batches/{id}                 → batch_doc (get) + set/update recorded
    """
    db = MagicMock()
    batch_ref = MagicMock()
    batch_ref.set = AsyncMock()
    batch_ref.update = AsyncMock()
    batch_ref.get = AsyncMock(return_value=batch_doc or _doc(False))

    quote_refs: dict = {}

    def collection(name):
        coll = MagicMock()
        if name == "quote_batches":
            coll.document.return_value = batch_ref
        elif name == "projects":
            def document(pid):
                proj_ref = MagicMock()
                proj_ref.get = AsyncMock(return_value=project_docs.get(pid, _doc(False)))
                quote_ref = quote_refs.setdefault(pid, MagicMock())
                quote_ref.get = AsyncMock(return_value=quote_docs.get(pid, _doc(False)))
                if not isinstance(quote_ref.update, AsyncMock):
                    quote_ref.update = AsyncMock()
                proj_ref.collection.return_value.document.return_value = quote_ref
                return proj_ref
            coll.document.side_effect = document
        return coll

    db.collection.side_effect = collection
    return db, batch_ref, quote_refs


@pytest.fixture
def mock_engine():
    engine = MagicMock()
    preview = MagicMock()
    preview.total_savings = 0.0
    preview.adjustments = []
    engine.preview.return_value = preview
    with patch("src.services.batch_service.get_batch_aggregation_engine", return_value=engine):
        yield engine


class TestCreateBatch:
    async def test_creates_batch_from_eligible_projects(self, mock_engine):
        project_docs = {
            "p1": _doc(True, {"userId": USER, "name": "Cucina"}),
            "p2": _doc(True, {"userId": "someone-else", "name": "Bagno"}),
        }
        quote_docs = {
            "p1": _doc(True, {"status": "draft", "items": [{"x": 1}], "financials": {"subtotal": 100.0}}),
        }
        db, batch_ref, _ = _make_db(project_docs, quote_docs)

        with patch("src.services.batch_service.get_async_firestore_client", return_value=db):
            summary = await batch_service.create_batch(USER, ["p1", "p2"])

        assert summary.total_projects == 1
        assert summary.batch_subtotal == 100.0
        assert summary.status == "draft"
        batch_ref.set.assert_awaited_once()
        saved = batch_ref.set.await_args.args[0]
        assert saved["user_id"] == USER
        assert [p["project_id"] for p in saved["projects"]] == ["p1"]

    async def test_batch_total_adds_each_project_total_with_its_own_vat_rate(self, mock_engine):
        """A 10% project and a 22% project: the batch total is the sum of the two
        totals (110 + 244), not the summed subtotals × 1.22 (366)."""
        project_docs = {pid: _doc(True, {"userId": USER, "name": pid}) for pid in ("p1", "p2")}
        quote_docs = {
            "p1": _doc(True, {"status": "draft", "items": [], "financials": {
                "subtotal": 100.0, "vat_rate": 0.10, "vat_amount": 10.0, "grand_total": 110.0}}),
            "p2": _doc(True, {"status": "draft", "items": [], "financials": {
                "subtotal": 200.0, "vat_rate": 0.22, "vat_amount": 44.0, "grand_total": 244.0}}),
        }
        db, batch_ref, _ = _make_db(project_docs, quote_docs)

        with patch("src.services.batch_service.get_async_firestore_client", return_value=db):
            summary = await batch_service.create_batch(USER, ["p1", "p2"])

        saved = batch_ref.set.await_args.args[0]
        assert saved["batch_subtotal"] == 300.0
        assert saved["batch_grand_total"] == 354.0
        assert type(saved["batch_grand_total"]) is float
        assert summary.batch_subtotal == Decimal("300.00")

    async def test_a_quote_without_a_grand_total_counts_its_subtotal_plus_vat(self, mock_engine):
        """A partial financials map must not add 0 € to the batch total."""
        project_docs = {"p1": _doc(True, {"userId": USER, "name": "p1"})}
        quote_docs = {"p1": _doc(True, {"status": "draft", "items": [], "financials": {
            "subtotal": 100.0, "vat_rate": 0.10}})}
        db, batch_ref, _ = _make_db(project_docs, quote_docs)

        with patch("src.services.batch_service.get_async_firestore_client", return_value=db):
            await batch_service.create_batch(USER, ["p1"])

        assert batch_ref.set.await_args.args[0]["batch_grand_total"] == 110.0

    async def test_no_eligible_projects_raises(self, mock_engine):
        project_docs = {"p1": _doc(True, {"userId": USER})}
        quote_docs = {"p1": _doc(True, {"status": "approved", "items": []})}
        db, _, _ = _make_db(project_docs, quote_docs)

        with patch("src.services.batch_service.get_async_firestore_client", return_value=db):
            with pytest.raises(NoEligibleProjectsError):
                await batch_service.create_batch(USER, ["p1", "missing"])


class TestSubmitBatch:
    def _batch_data(self, **overrides):
        data = {
            "user_id": USER,
            "status": "draft",
            "projects": [{"project_id": "p1"}],
            "total_projects": 1,
            "batch_subtotal": 100.0,
            "batch_grand_total": 122.0,
        }
        data.update(overrides)
        return data

    async def test_submit_updates_quotes_and_notifies_admin(self):
        db, batch_ref, quote_refs = _make_db(
            {}, {"p1": _doc(True, {})}, batch_doc=_doc(True, self._batch_data()),
        )
        notify = AsyncMock()

        with (
            patch("src.services.batch_service.get_async_firestore_client", return_value=db),
            patch("src.services.batch_service._notify_admin", new=notify),
        ):
            summary = await batch_service.submit_batch(USER, "batch-1")

        assert summary.status == "submitted"
        # project quote → pending_review
        quote_update = quote_refs["p1"].update.await_args.args[0]
        assert quote_update["status"] == "pending_review"
        # batch → submitted
        batch_update = batch_ref.update.await_args.args[0]
        assert batch_update["status"] == "submitted"
        # admin notified through the outbox, with the batch total (never the batch id)
        notify.assert_awaited_once()
        assert notify.await_args.args[2] == 122.0


    async def test_admin_email_gets_number_client_and_summary_of_each_quote(self):
        """The admin sees PRV number + client name, never the batch id or the uid."""
        stored = {
            "status": "draft",
            "quote_number": "PRV-2026-0042",
            "client_snapshot": {"display_name": "Mario Rossi", "email": "m@x.it"},
            "request": {"summary": "Pittura cucina"},
            "financials": {"grand_total": 816.91},
        }
        db, _, _ = _make_db(
            {}, {"p1": _doc(True, stored)}, batch_doc=_doc(True, self._batch_data()),
        )
        notify = AsyncMock()

        with (
            patch("src.services.batch_service.get_async_firestore_client", return_value=db),
            patch("src.services.batch_service._notify_admin", new=notify),
        ):
            await batch_service.submit_batch(USER, "batch-1")

        digests = notify.await_args.args[1]
        assert [(d.quote_number, d.client_name, d.grand_total, d.summary) for d in digests] == [
            ("PRV-2026-0042", "Mario Rossi", Decimal("816.91"), "Pittura cucina")
        ]
    async def test_submit_missing_batch_raises_not_found(self):
        db, _, _ = _make_db({}, {}, batch_doc=_doc(False))
        with patch("src.services.batch_service.get_async_firestore_client", return_value=db):
            with pytest.raises(BatchNotFoundError):
                await batch_service.submit_batch(USER, "missing")

    async def test_submit_foreign_batch_raises_permission_denied(self):
        db, _, _ = _make_db({}, {}, batch_doc=_doc(True, self._batch_data(user_id="other")))
        with patch("src.services.batch_service.get_async_firestore_client", return_value=db):
            with pytest.raises(PermissionDenied):
                await batch_service.submit_batch(USER, "batch-1")

    async def test_submit_non_draft_raises_conflict(self):
        db, _, _ = _make_db({}, {}, batch_doc=_doc(True, self._batch_data(status="submitted")))
        with patch("src.services.batch_service.get_async_firestore_client", return_value=db):
            with pytest.raises(BatchNotSubmittableError):
                await batch_service.submit_batch(USER, "batch-1")

    async def test_admin_can_submit_foreign_batch(self):
        db, _, _ = _make_db(
            {}, {"p1": _doc(True, {})}, batch_doc=_doc(True, self._batch_data(user_id="other")),
        )
        with (
            patch("src.services.batch_service.get_async_firestore_client", return_value=db),
            patch("src.services.batch_service._notify_admin", new=AsyncMock()),
        ):
            summary = await batch_service.submit_batch(USER, "batch-1", is_admin=True)
        assert summary.status == "submitted"



class TestNotifyAdmin:
    """The admin email goes through the outbox (recorded, then sent in the
    background; the sweeper is the safety net)."""

    async def test_queues_the_rendered_email_and_dispatches_it(self, monkeypatch):
        monkeypatch.setattr(batch_service.settings, "ADMIN_EMAIL", "admin@syd.it")
        enqueue = AsyncMock(return_value="out-1")
        dispatch = AsyncMock(return_value="sent")
        digest = batch_service.RequestDigest(
            quote_number="PRV-2026-0042", client_name="Mario Rossi", client_email="m@x.it",
            client_is_guest=False, grand_total=Decimal("816.91"), summary="Pittura",
        )
        with (
            patch("src.services.batch_service.enqueue_message", new=enqueue),
            patch("src.services.batch_service.dispatch_one", new=dispatch),
        ):
            await batch_service._notify_admin(MagicMock(), [digest], Decimal("816.91"))
            await asyncio.gather(*batch_service._background_tasks)

        kwargs = enqueue.await_args.kwargs
        assert kwargs["kind"] == "admin_notification" and kwargs["to"] == "admin@syd.it"
        assert kwargs["subject"] == "[SYD] Nuova richiesta PRV-2026-0042 da Mario Rossi (€ 816,91)"
        dispatch.assert_awaited_once()
        assert dispatch.await_args.args[1] == "out-1"

    async def test_skips_without_an_admin_address(self, monkeypatch):
        monkeypatch.setattr(batch_service.settings, "ADMIN_EMAIL", None)
        with patch("src.services.batch_service.enqueue_message", new=AsyncMock()) as enqueue:
            await batch_service._notify_admin(MagicMock(), [], 10.0)
        enqueue.assert_not_called()

    async def test_queue_failure_never_breaks_the_submission(self, monkeypatch):
        monkeypatch.setattr(batch_service.settings, "ADMIN_EMAIL", "admin@syd.it")
        with patch("src.services.batch_service.enqueue_message", new=AsyncMock(side_effect=RuntimeError("down"))):
            await batch_service._notify_admin(MagicMock(), [], 10.0)  # does not raise
