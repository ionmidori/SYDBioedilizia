"""Firestore writes in bounded write batches.

Firestore allows 500 writes per batch; the backend stays below that. A
`BatchWriter` queues writes in order and commits a batch each time it is full,
then the rest when the `async with` block ends. Writes are not atomic as a
whole: callers that run long copies order them so that a run interrupted
between two batches is finished by running it again.
"""
from __future__ import annotations

from types import TracebackType
from typing import Any

WRITE_BATCH_SIZE = 400


class BatchWriter:
    def __init__(self, db: Any) -> None:
        self._db = db
        self._batch: Any = None
        self._queued = 0
        self.written = 0  # writes queued so far, committed or about to be

    async def __aenter__(self) -> BatchWriter:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        # On an error the half-filled batch is dropped: what was committed stays.
        if exc_type is None:
            await self.flush()

    async def set(self, ref: Any, data: dict[str, Any], *, merge: bool = False) -> None:
        self._current().set(ref, data, merge=merge)
        await self._queued_one()

    async def update(self, ref: Any, data: dict[str, Any]) -> None:
        self._current().update(ref, data)
        await self._queued_one()

    async def delete(self, ref: Any) -> None:
        self._current().delete(ref)
        await self._queued_one()

    async def flush(self) -> None:
        """Commit the pending batch, if any."""
        if self._batch is not None:
            batch, self._batch, self._queued = self._batch, None, 0
            await batch.commit()

    def _current(self) -> Any:
        if self._batch is None:
            self._batch = self._db.batch()
        return self._batch

    async def _queued_one(self) -> None:
        self._queued += 1
        self.written += 1
        if self._queued >= WRITE_BATCH_SIZE:
            await self.flush()
