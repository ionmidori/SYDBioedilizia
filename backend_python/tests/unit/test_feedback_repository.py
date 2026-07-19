"""Unit tests for FeedbackRepository.

Regression coverage for the pyright reportOptionalSubscript ratchet:
get_negative_feedback subscripted `doc.to_dict()` (dict | None) directly, so a
malformed/empty feedback doc (to_dict() -> None) crashed with TypeError instead
of degrading. The fix uses the `doc.to_dict() or {}` idiom.
"""
from unittest.mock import MagicMock, patch

import pytest


class _AsyncIter:
    """Minimal async iterator to stand in for a Firestore query .stream()."""

    def __init__(self, items):
        self._items = list(items)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._items:
            raise StopAsyncIteration
        return self._items.pop(0)


@pytest.mark.asyncio
async def test_get_negative_feedback_handles_none_to_dict():
    from src.repositories.feedback_repository import FeedbackRepository

    doc = MagicMock()
    doc.to_dict.return_value = None  # malformed/empty doc
    doc.id = "fid-1"
    doc.reference.parent.parent.id = "sess-1"

    query = MagicMock()
    query.where.return_value = query
    query.order_by.return_value = query
    query.limit.return_value = query
    query.stream.return_value = _AsyncIter([doc])

    mock_db = MagicMock()
    mock_db.collection_group.return_value = query

    with patch(
        "src.repositories.feedback_repository.get_async_firestore_client",
        return_value=mock_db,
    ):
        result = await FeedbackRepository().get_negative_feedback()

    # No crash; the empty doc degrades to just the derived id fields.
    assert result == [{"feedback_id": "fid-1", "session_id": "sess-1"}]
