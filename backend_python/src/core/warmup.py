"""Startup warm-up with a time limit per step.

Every step initializes something the first chat turn would otherwise pay for.
None may hold startup forever: on revision syd-brain-00692 the model lookup hung
for 80 s with no error and the startup probe gave up. Past its limit a step is
no longer awaited and the instance becomes ready without it; the component then
initializes lazily on first use, as it does when a step fails.

A step that runs in a thread cannot be interrupted: past its limit it is only
no longer awaited and the thread finishes on its own.
"""
import asyncio
import inspect
import logging
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal

import httpx
from firebase_admin.exceptions import FirebaseError
from google.api_core.exceptions import GoogleAPIError
from google.auth.exceptions import GoogleAuthError
from google.genai import errors as genai_errors
from starlette.concurrency import run_in_threadpool

from src.core.logger import get_logger

logger = get_logger(__name__)

WarmupOutcome = Literal["done", "failed", "timed_out", "skipped"]

# Failures of the services a step talks to: the instance stays usable and the
# component retries lazily. Anything else is a bug and propagates.
EXPECTED_FAILURES: tuple[type[Exception], ...] = (
    GoogleAPIError,
    GoogleAuthError,
    FirebaseError,
    genai_errors.APIError,
    httpx.HTTPError,
    OSError,
    RuntimeError,
    ValueError,
)


@dataclass(frozen=True)
class WarmupStep:
    name: str
    fn: Callable[[], object]
    in_thread: bool = True
    # Run only if this step completed: a step on the event loop cannot be
    # interrupted and would repeat the hung work of the step it depends on.
    requires: str | None = None


async def _call(step: WarmupStep) -> None:
    if inspect.iscoroutinefunction(step.fn):
        await step.fn()
    elif step.in_thread:
        await run_in_threadpool(step.fn)
    else:
        step.fn()


def _log(step: WarmupStep, outcome: str, started: float, level: int, detail: str = "", *, exc_info: bool = False) -> None:
    logger.log(
        level,
        f"Warm-up step '{step.name}' {outcome}{detail}",
        extra={
            "warmup_step": step.name,
            "outcome": outcome,
            "duration_ms": round((time.perf_counter() - started) * 1000, 1),
        },
        exc_info=exc_info,
    )


async def run_step(step: WarmupStep, timeout_s: float) -> WarmupOutcome:
    """Run one step within ``timeout_s``; unexpected errors propagate."""
    started = time.perf_counter()
    deadline = asyncio.timeout(timeout_s)
    try:
        async with deadline:
            await _call(step)
    except EXPECTED_FAILURES as exc:
        # The step's own limit, not a timeout raised inside the step (TimeoutError is an OSError).
        if deadline.expired():
            _log(step, "timed_out", started, logging.ERROR, f" after {timeout_s:g}s (instance ready without it)")
            return "timed_out"
        _log(step, "failed", started, logging.WARNING, f" (will retry lazily): {exc!r}")
        return "failed"
    except Exception:
        _log(step, "error", started, logging.ERROR, exc_info=True)
        raise
    _log(step, "done", started, logging.INFO)
    return "done"


async def run_warmup(
    *,
    parallel: Sequence[WarmupStep],
    sequential: Sequence[WarmupStep],
    step_timeout_s: float,
) -> dict[str, WarmupOutcome]:
    """Run ``parallel`` together, then ``sequential`` in order; outcome per step.

    An unexpected error cancels the steps still running and propagates.
    """
    async with asyncio.TaskGroup() as group:
        tasks = {step.name: group.create_task(run_step(step, step_timeout_s)) for step in parallel}
    report: dict[str, WarmupOutcome] = {name: task.result() for name, task in tasks.items()}
    for step in sequential:
        if step.requires is not None and report.get(step.requires) != "done":
            logger.warning(
                f"Warm-up step '{step.name}' skipped: '{step.requires}' did not complete",
                extra={"warmup_step": step.name, "outcome": "skipped"},
            )
            report[step.name] = "skipped"
            continue
        report[step.name] = await run_step(step, step_timeout_s)
    return report
