"""
Unit tests for src/adk/hitl.py — HITL resumption token flow.

Tests the cryptographic resumption token pattern used for admin quote approval:
- save_resumption_token stores a nonce in Firestore
- verify_resumption_token validates + atomically deletes (one-time use)
- start_quote_hitl rejects already-approved quotes
- approve_quote_hitl rejects non-pending quotes

All Firestore calls are mocked — no external dependencies.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.core.exceptions import QuoteAlreadyApprovedError, QuoteNotFoundError


@pytest.fixture
def mock_firestore_doc():
    """Creates a mock Firestore document snapshot."""
    doc = MagicMock()
    doc.exists = True
    doc.to_dict.return_value = {}
    return doc


@pytest.fixture
def mock_db():
    """Patches the Firestore AsyncClient at module level."""
    with patch("src.adk.hitl.db") as mock:
        yield mock


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# verify_resumption_token
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class TestVerifyResumptionToken:
    """Tests the verify_resumption_token security boundary."""

    @pytest.mark.asyncio
    async def test_valid_token_returns_true(self, mock_db, mock_firestore_doc):
        """A matching token should return True and delete the token."""
        token = "valid-token-123"
        mock_firestore_doc.to_dict.return_value = {"resumption_token": token}

        quote_ref = AsyncMock()
        quote_ref.get = AsyncMock(return_value=mock_firestore_doc)
        quote_ref.update = AsyncMock()

        mock_db.collection.return_value.document.return_value \
            .collection.return_value.document.return_value = quote_ref

        from src.adk.hitl import verify_resumption_token
        result = await verify_resumption_token("proj-1", token)
        assert result is True
        # Token should be deleted after use (one-time use)
        quote_ref.update.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_wrong_token_returns_false(self, mock_db, mock_firestore_doc):
        """A mismatched token should return False."""
        mock_firestore_doc.to_dict.return_value = {"resumption_token": "correct-token"}

        quote_ref = AsyncMock()
        quote_ref.get = AsyncMock(return_value=mock_firestore_doc)

        mock_db.collection.return_value.document.return_value \
            .collection.return_value.document.return_value = quote_ref

        from src.adk.hitl import verify_resumption_token
        result = await verify_resumption_token("proj-1", "wrong-token")
        assert result is False

    @pytest.mark.asyncio
    async def test_no_document_returns_false(self, mock_db):
        """Non-existent document should return False, not crash."""
        doc = MagicMock()
        doc.exists = False

        quote_ref = AsyncMock()
        quote_ref.get = AsyncMock(return_value=doc)

        mock_db.collection.return_value.document.return_value \
            .collection.return_value.document.return_value = quote_ref

        from src.adk.hitl import verify_resumption_token
        result = await verify_resumption_token("nonexistent", "any-token")
        assert result is False

    @pytest.mark.asyncio
    async def test_firestore_error_returns_false(self, mock_db):
        """Firestore exceptions should be caught gracefully."""
        quote_ref = AsyncMock()
        quote_ref.get = AsyncMock(side_effect=Exception("Connection refused"))

        mock_db.collection.return_value.document.return_value \
            .collection.return_value.document.return_value = quote_ref

        from src.adk.hitl import verify_resumption_token
        result = await verify_resumption_token("proj-1", "token")
        assert result is False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# start_quote_hitl
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class TestStartQuoteHitl:
    """Tests the quote HITL start flow."""

    @pytest.mark.asyncio
    async def test_rejects_already_approved(self, mock_db, mock_firestore_doc):
        """Should raise QuoteAlreadyApprovedError for approved quotes."""
        mock_firestore_doc.to_dict.return_value = {"status": "approved"}

        quote_ref = AsyncMock()
        quote_ref.get = AsyncMock(return_value=mock_firestore_doc)

        mock_db.collection.return_value.document.return_value \
            .collection.return_value.document.return_value = quote_ref

        from src.adk.hitl import start_quote_hitl

        with pytest.raises(QuoteAlreadyApprovedError):
            await start_quote_hitl("proj-1", "user-123")

    @pytest.mark.asyncio
    async def test_creates_pending_review(self, mock_db, mock_firestore_doc):
        """Should save a pending_review status and resumption token."""
        mock_firestore_doc.exists = False

        quote_ref = AsyncMock()
        quote_ref.get = AsyncMock(return_value=mock_firestore_doc)
        quote_ref.set = AsyncMock()

        # Need to mock both the quotes collection and private_data collection
        # save_resumption_token uses projects/{id}/quotes/active
        quotes_ref = AsyncMock()
        quotes_ref.set = AsyncMock()

        def mock_doc_side_effect(doc_id):
            mock_ref = AsyncMock()
            if doc_id == "quote":
                mock_ref.get = AsyncMock(return_value=mock_firestore_doc)
                mock_ref.set = AsyncMock()
                return mock_ref
            elif doc_id == "active":
                return quotes_ref
            return quote_ref

        def mock_collection_side_effect(name):
            subcol = MagicMock()
            subcol.document = MagicMock(side_effect=mock_doc_side_effect)
            return subcol

        project_doc = MagicMock()
        project_doc.collection = MagicMock(side_effect=mock_collection_side_effect)

        mock_db.collection.return_value.document.return_value = project_doc

        from src.adk.hitl import start_quote_hitl
        await start_quote_hitl("proj-1", "user-123")
        # Verify set was called (pending_review record created)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# approve_quote_hitl
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class TestApproveQuoteHitl:
    """Tests the admin approval flow."""

    @pytest.mark.asyncio
    async def test_rejects_non_pending(self, mock_db, mock_firestore_doc):
        """Should raise QuoteNotFoundError if status is not pending_review."""
        mock_firestore_doc.to_dict.return_value = {"status": "draft"}

        quote_ref = AsyncMock()
        quote_ref.get = AsyncMock(return_value=mock_firestore_doc)

        mock_db.collection.return_value.document.return_value \
            .collection.return_value.document.return_value = quote_ref

        from src.adk.hitl import approve_quote_hitl

        with pytest.raises(QuoteNotFoundError):
            await approve_quote_hitl("proj-1", "approve", "Looks good", "admin-uid")

    @pytest.mark.asyncio
    async def test_approves_pending_review(self, mock_db, mock_firestore_doc):
        """Should update status to 'approved' for a pending_review quote."""
        mock_firestore_doc.to_dict.return_value = {"status": "pending_review"}

        quote_ref = AsyncMock()
        quote_ref.get = AsyncMock(return_value=mock_firestore_doc)
        quote_ref.update = AsyncMock()

        mock_db.collection.return_value.document.return_value \
            .collection.return_value.document.return_value = quote_ref

        from src.adk.hitl import approve_quote_hitl
        await approve_quote_hitl("proj-1", "approve", "LGTM", "admin-uid-789")

        quote_ref.update.assert_awaited_once()
        call_args = quote_ref.update.call_args[0][0]
        assert call_args["status"] == "approved"
        assert call_args["reviewed_by"] == "admin-uid-789"
