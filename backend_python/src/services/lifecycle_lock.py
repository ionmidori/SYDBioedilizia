"""
One GDPR lifecycle pass at a time.

The pass emails users first and marks them afterwards, so two overlapping runs
(Cloud Scheduler + an admin's "Run now", two admins, a retry) would email the
same people twice. Both entry points take this lease; it expires on its own
(a crashed run must not block the next days' schedule).
"""
from __future__ import annotations

import logging
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Any

from google.api_core.exceptions import GoogleAPIError
from google.cloud.firestore_v1 import async_transactional

from src.core.exceptions import AppException
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

LEASE = timedelta(minutes=15)
COLLECTION = "app_config"
DOCUMENT = "gdpr_lifecycle_lock"


class LifecycleAlreadyRunningError(AppException):
    status_code = 409
    error_code = "LIFECYCLE_ALREADY_RUNNING"

    def __init__(self) -> None:
        super().__init__(message="A GDPR lifecycle pass is already running. Try again in a few minutes.")


async def _transact(db: Any, body: Any) -> Any:
    @async_transactional
    async def _txn(transaction: Any) -> Any:
        return await body(transaction)

    return await _txn(db.transaction())


async def _acquire(db: Any, token: str) -> bool:
    ref = db.collection(COLLECTION).document(DOCUMENT)

    async def body(transaction: Any) -> bool:
        snap = await ref.get(transaction=transaction)
        now = utc_now()
        held_until = (snap.to_dict() or {}).get("locked_until") if snap.exists else None
        if held_until is not None and held_until > now:
            return False
        transaction.set(ref, {"locked_until": now + LEASE, "token": token, "acquired_at": now})
        return True

    return bool(await _transact(db, body))


async def _release(db: Any, token: str) -> None:
    ref = db.collection(COLLECTION).document(DOCUMENT)

    async def body(transaction: Any) -> None:
        snap = await ref.get(transaction=transaction)
        if snap.exists and (snap.to_dict() or {}).get("token") == token:
            transaction.delete(ref)

    try:
        await _transact(db, body)
    except (GoogleAPIError, OSError, RuntimeError, ValueError):
        # It expires by itself; nothing else to do.
        logger.warning("[Lifecycle] Could not release the run lease.", exc_info=True)


@asynccontextmanager
async def lifecycle_lease(db: Any) -> AsyncIterator[None]:
    """Hold the run lease for the duration of the block, or raise LifecycleAlreadyRunningError."""
    token = secrets.token_hex(8)
    if not await _acquire(db, token):
        raise LifecycleAlreadyRunningError()
    try:
        yield
    finally:
        await _release(db, token)
