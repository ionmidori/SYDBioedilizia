"""
Chat quote-submission tool tests — PR 2.

submit_quote_request / list_ready_quotes wrappers (src/tools/batch_tools.py):
uid resolved from sessions/{session_id}, default project = current session,
login gate for anonymous users, error paths return Italian messages.
"""
from unittest.mock import AsyncMock, MagicMock, patch

from src.core.exceptions import NoEligibleProjectsError
from src.services.batch_service import BatchSummary
from src.tools.batch_tools import (
    list_ready_quotes_wrapper,
    submit_quote_request_wrapper,
)

USER = "client-uid-123"
SESSION = "session-abc"


def _session_db(user_id: str | None, quote_docs: dict | None = None):
    """Firestore mock: sessions/{id}.userId + projects/{pid}/private_data/quote."""
    db = MagicMock()
    quote_docs = quote_docs or {}

    def collection(name):
        coll = MagicMock()
        if name == "sessions":
            doc = MagicMock()
            doc.exists = user_id is not None
            doc.to_dict.return_value = {"userId": user_id} if user_id else {}
            coll.document.return_value.get = AsyncMock(return_value=doc)
        elif name == "projects":
            def document(pid):
                ref = MagicMock()
                qdoc = MagicMock()
                data = quote_docs.get(pid)
                qdoc.exists = data is not None
                qdoc.to_dict.return_value = data or {}
                ref.collection.return_value.document.return_value.get = AsyncMock(return_value=qdoc)
                return ref
            coll.document.side_effect = document
        return coll

    db.collection.side_effect = collection
    return db


class TestSubmitQuoteRequest:
    async def test_anonymous_session_gets_login_message(self):
        db = _session_db(user_id=None)
        with patch("src.tools.batch_tools.get_async_firestore_client", return_value=db):
            result = await submit_quote_request_wrapper(SESSION)
        assert "accedere" in result.lower() or "login" in result.lower()

    async def test_defaults_to_current_session_project(self):
        db = _session_db(user_id=USER)
        create = AsyncMock(return_value=BatchSummary("b1", 1, 100.0, "draft"))
        submit = AsyncMock(return_value=BatchSummary("b1", 1, 100.0, "submitted"))

        with (
            patch("src.tools.batch_tools.get_async_firestore_client", return_value=db),
            patch("src.tools.batch_tools.batch_service.create_batch", create),
            patch("src.tools.batch_tools.batch_service.submit_batch", submit),
        ):
            result = await submit_quote_request_wrapper(SESSION)

        assert "✅" in result
        create.assert_awaited_once_with(user_id=USER, project_ids=[SESSION])
        submit.assert_awaited_once_with(user_id=USER, batch_id="b1")

    async def test_explicit_project_list_is_used(self):
        db = _session_db(user_id=USER)
        create = AsyncMock(return_value=BatchSummary("b1", 2, 250.0, "draft"))
        submit = AsyncMock(return_value=BatchSummary("b1", 2, 250.0, "submitted"))

        with (
            patch("src.tools.batch_tools.get_async_firestore_client", return_value=db),
            patch("src.tools.batch_tools.batch_service.create_batch", create),
            patch("src.tools.batch_tools.batch_service.submit_batch", submit),
        ):
            result = await submit_quote_request_wrapper(SESSION, ["p1", "p2"])

        assert "2 progetti" in result
        create.assert_awaited_once_with(user_id=USER, project_ids=["p1", "p2"])

    async def test_no_eligible_projects_returns_friendly_message(self):
        db = _session_db(user_id=USER)
        create = AsyncMock(side_effect=NoEligibleProjectsError())

        with (
            patch("src.tools.batch_tools.get_async_firestore_client", return_value=db),
            patch("src.tools.batch_tools.batch_service.create_batch", create),
        ):
            result = await submit_quote_request_wrapper(SESSION)

        assert "✅" not in result
        assert "bozza" in result

    async def test_unexpected_error_never_raises(self):
        db = _session_db(user_id=USER)
        create = AsyncMock(side_effect=RuntimeError("boom"))
        with (
            patch("src.tools.batch_tools.get_async_firestore_client", return_value=db),
            patch("src.tools.batch_tools.batch_service.create_batch", create),
        ):
            result = await submit_quote_request_wrapper(SESSION)
        assert "problema" in result


class TestListReadyQuotes:
    async def test_anonymous_session_gets_login_message(self):
        db = _session_db(user_id=None)
        with patch("src.tools.batch_tools.get_async_firestore_client", return_value=db):
            result = await list_ready_quotes_wrapper(SESSION)
        assert "accedere" in result.lower() or "login" in result.lower()

    async def test_lists_only_draft_quotes_with_items(self):
        quote_docs = {
            "p1": {"status": "draft", "items": [{"a": 1}], "financials": {"grand_total": 122.0}},
            "p2": {"status": "approved", "items": [{"a": 1}], "financials": {}},
            "p3": {"status": "draft", "items": [], "financials": {}},
        }
        db = _session_db(user_id=USER, quote_docs=quote_docs)

        projects = []
        for pid, title in [("p1", "Cucina"), ("p2", "Bagno"), ("p3", "Camera")]:
            item = MagicMock()
            item.session_id = pid
            item.title = title
            projects.append(item)

        with (
            patch("src.tools.batch_tools.get_async_firestore_client", return_value=db),
            patch("src.tools.batch_tools.get_user_projects", AsyncMock(return_value=projects)),
        ):
            result = await list_ready_quotes_wrapper(SESSION)

        assert "Cucina" in result
        assert "122" in result
        assert "Bagno" not in result  # approved → not submittable
        assert "Camera" not in result  # no items

    async def test_no_ready_quotes_message(self):
        db = _session_db(user_id=USER, quote_docs={})
        with (
            patch("src.tools.batch_tools.get_async_firestore_client", return_value=db),
            patch("src.tools.batch_tools.get_user_projects", AsyncMock(return_value=[])),
        ):
            result = await list_ready_quotes_wrapper(SESSION)
        assert "Non ci sono" in result
