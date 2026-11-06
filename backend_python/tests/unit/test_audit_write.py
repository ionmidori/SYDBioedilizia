"""write_audit_event: the awaited variant used by CLI scripts writes the same
record shape as emit_audit_event, before returning, and never raises."""
from unittest.mock import AsyncMock, MagicMock

import pytest
from src.services import audit


async def test_record_is_written_before_returning(monkeypatch: pytest.MonkeyPatch):
    collection = MagicMock()
    collection.add = AsyncMock()
    db = MagicMock()
    db.collection.return_value = collection
    monkeypatch.setattr(audit, "get_async_firestore_client", lambda: db)

    await audit.write_audit_event(
        audit.AuditAction.PORTFOLIO_CREATE, audit.AuditResourceType.CONTENT, "p1", user_id="cli", metadata={"via": "x"}
    )

    record = collection.add.await_args.args[0]
    assert record["action"] == "portfolio.create"
    assert record["resource_type"] == audit.AuditResourceType.CONTENT.value
    assert record["user_id"] == "cli"
    assert record["metadata"] == {"via": "x"}
    assert {"timestamp", "request_id", "session_id", "status"} <= record.keys()


async def test_a_failed_write_never_raises(monkeypatch: pytest.MonkeyPatch):
    def broken_client() -> None:
        raise RuntimeError("firestore down")

    monkeypatch.setattr(audit, "get_async_firestore_client", broken_client)

    await audit.write_audit_event(audit.AuditAction.PORTFOLIO_UPLOAD, audit.AuditResourceType.CONTENT, "x")
