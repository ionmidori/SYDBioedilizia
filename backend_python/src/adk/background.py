"""
Background work of a chat turn: Firestore saves, history compaction, room brief.

The event loop only keeps weak references to tasks, so every task started here
is held in `_inflight` until it ends: work that must survive a client
disconnect (or the end of the stream) is never garbage-collected mid-flight.
Nobody awaits most of these tasks: an exception they let through is logged
here, with the task's name, instead of surfacing only as asyncio's "Task
exception was never retrieved" when the task is collected.
"""
import asyncio
import logging
from collections.abc import Coroutine
from typing import Any

logger = logging.getLogger(__name__)

_inflight: set[asyncio.Task[Any]] = set()


def _finished(task: asyncio.Task[Any]) -> None:
    _inflight.discard(task)
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error(
            "[Background] Task failed",
            exc_info=exc,
            extra={"event": "background_task_failed", "task": task.get_name(), "error": type(exc).__name__},
        )


def run_in_background[T](coro: Coroutine[Any, Any, T], *, name: str | None = None) -> asyncio.Task[T]:
    """Start `coro` without waiting for it; the task is kept alive until it ends
    and an exception it raises is logged."""
    task = asyncio.create_task(coro, name=name)
    _inflight.add(task)
    task.add_done_callback(_finished)
    return task
