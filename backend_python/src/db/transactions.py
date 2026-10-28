"""Run a body inside a Firestore transaction.

One seam for the in-memory fakes of the unit tests (they replace
`run_transaction`). Older modules still carry their own private copy
(`_transact` in outbox, erasure, lifecycle_lock, price_book, quote_submission).
"""
from typing import Any

from google.cloud.firestore_v1 import async_transactional


async def run_transaction(db: Any, body: Any) -> Any:
    """`await body(transaction)` in a Firestore transaction, retried on contention:
    the body must do all its reads before its writes and have no side effects
    outside the transaction."""

    @async_transactional
    async def _txn(transaction: Any) -> Any:
        return await body(transaction)

    return await _txn(db.transaction())
