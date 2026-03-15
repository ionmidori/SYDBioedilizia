"""
Immutable audit trail for sensitive business operations.

Writes append-only records to the `audit_logs` Firestore collection.
Fire-and-forget: audit failures are logged at ERROR but never propagate
to callers — the primary operation must never fail because of auditing.

No TTL on audit_logs — records are retained indefinitely for compliance.
"""
import asyncio
import logging
from enum import StrEnum
from typing import Any, Optional

from src.core.context import get_request_id, get_session_id, get_user_id
from src.db.firebase_client import get_async_firestore_client
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

AUDIT_COLLECTION = "audit_logs"


class AuditAction(StrEnum):
    """Enumeration of auditable actions."""
    PROJECT_SOFT_DELETE = "project.soft_delete"
    PROJECT_HARD_DELETE = "project.hard_delete"
    PROJECT_CREATE = "project.create"
    PROJECT_CLAIM = "project.claim"
    FILE_DELETE = "file.delete"
    USER_ERASE = "user.erase"
    QUOTE_APPROVE = "quote.approve"
    QUOTE_REJECT = "quote.reject"
    RETENTION_CLEANUP = "admin.retention_cleanup"


class AuditResourceType(StrEnum):
    """Resource types for audit records."""
    PROJECT = "project"
    USER = "user"
    QUOTE = "quote"
    FILE = "file"
    SYSTEM = "system"


async def _write_audit_record(record: dict[str, Any]) -> None:
    """Write a single audit record to Firestore. Never raises."""
    try:
        db = get_async_firestore_client()
        await db.collection(AUDIT_COLLECTION).add(record)
        logger.debug(
            "Audit record written",
            extra={"action": record.get("action"), "resource_id": record.get("resource_id")},
        )
    except Exception as exc:
        logger.error(
            f"[Audit] Failed to write audit record: {exc}",
            exc_info=True,
            extra={"action": record.get("action"), "resource_id": record.get("resource_id")},
        )


def emit_audit_event(
    action: AuditAction,
    resource_type: AuditResourceType,
    resource_id: str,
    status: str = "success",
    user_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    """
    Fire-and-forget audit event emission.

    Captures current context (request_id, session_id, user_id) from ContextVars
    and schedules the Firestore write as a background task.

    This function is synchronous to callers — it returns immediately.
    """
    record = {
        "timestamp": utc_now(),
        "request_id": get_request_id(),
        "session_id": get_session_id() or "",
        "user_id": user_id or get_user_id() or "system",
        "action": action.value,
        "resource_type": resource_type.value,
        "resource_id": resource_id,
        "status": status,
        "metadata": metadata or {},
    }

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_write_audit_record(record))
    except RuntimeError:
        # No running event loop (e.g., called from sync context in tests).
        logger.warning(
            "[Audit] No event loop — audit record logged but not persisted",
            extra={"action": action.value, "resource_id": resource_id},
        )
