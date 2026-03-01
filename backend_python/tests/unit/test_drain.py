"""
Unit tests for the Phase 3 LangGraph session drain utility.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.fixture
def mock_firestore_client():
    """Mock Firestore AsyncClient with configurable checkpoint stream."""
    with patch("src.adk.drain.firestore.AsyncClient") as mock_cls:
        client = MagicMock()
        mock_cls.return_value = client
        yield client


def _make_checkpoint_doc(thread_id: str, phase: str = "QUOTE", next_nodes: list | None = None):
    doc = MagicMock()
    doc.id = thread_id
    doc.to_dict.return_value = {
        "checkpoint": {"channel_values": {"phase": phase}},
        "next": next_nodes or ["admin_review"],
        "ts": None,
    }
    return doc


@pytest.mark.asyncio
async def test_drain_identifies_active_hitl_sessions(mock_firestore_client):
    """Active QUOTE sessions should appear in active_sessions list."""
    from src.adk.drain import drain_inflight_quotes

    doc = _make_checkpoint_doc("project-abc", phase="QUOTE", next_nodes=["admin_review"])

    async def _fake_stream():
        yield doc

    mock_firestore_client.collection.return_value.stream.return_value = _fake_stream()

    report = await drain_inflight_quotes(dry_run=True)

    assert "project-abc" in report["active_sessions"]
    assert len(report["stale_sessions"]) == 0
    assert len(report["errors"]) == 0


@pytest.mark.asyncio
async def test_drain_classifies_finalized_sessions(mock_firestore_client):
    """Sessions not in QUOTE phase / no admin_review next node → already_finalized."""
    from src.adk.drain import drain_inflight_quotes

    doc = _make_checkpoint_doc("project-done", phase="DONE", next_nodes=["END"])

    async def _fake_stream():
        yield doc

    mock_firestore_client.collection.return_value.stream.return_value = _fake_stream()

    report = await drain_inflight_quotes(dry_run=True)

    assert "project-done" in report["already_finalized"]
    assert len(report["active_sessions"]) == 0


@pytest.mark.asyncio
async def test_drain_handles_stream_error(mock_firestore_client):
    """Firestore stream failure should populate errors list, not raise."""
    from src.adk.drain import drain_inflight_quotes

    async def _bad_stream():
        raise RuntimeError("Firestore unavailable")
        yield  # make it an async generator

    mock_firestore_client.collection.return_value.stream.return_value = _bad_stream()

    report = await drain_inflight_quotes(dry_run=True)

    assert len(report["errors"]) == 1
    assert "stream_failed" in report["errors"][0]


@pytest.mark.asyncio
async def test_drain_dry_run_does_not_write(mock_firestore_client):
    """dry_run=True must not call Firestore update on stale sessions."""
    from src.adk.drain import drain_inflight_quotes
    from datetime import datetime, timezone, timedelta

    stale_time = datetime.now(timezone.utc) - timedelta(hours=200)

    doc = _make_checkpoint_doc("project-stale", phase="QUOTE", next_nodes=["admin_review"])
    doc.to_dict.return_value = {
        "checkpoint": {"channel_values": {"phase": "QUOTE"}},
        "next": ["admin_review"],
        "ts": stale_time,
    }

    async def _fake_stream():
        yield doc

    mock_ref = MagicMock()
    mock_ref.update = AsyncMock()
    mock_firestore_client.collection.return_value.stream.return_value = _fake_stream()
    mock_firestore_client.collection.return_value.document.return_value = mock_ref

    report = await drain_inflight_quotes(ttl_hours=72, dry_run=True)

    # In dry_run the session should be classified as stale but update NOT called
    assert "project-stale" in report["stale_sessions"]
    mock_ref.update.assert_not_called()
