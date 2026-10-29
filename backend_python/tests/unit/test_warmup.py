"""
Startup warm-up with a time limit per step (Phase 139 PR-0a).

Revision syd-brain-00692 never started: the 'models' step hung for 80 s with
no error and /health/startup answered 503 until the startup probe gave up.
No step may hold startup forever: past its limit the instance becomes ready
without it, and the outcome of every step is logged.
"""
import asyncio
import logging
import threading
import time

import pytest
from google.api_core.exceptions import ServiceUnavailable
from src.core import warmup
from src.core.warmup import WarmupStep, run_step, run_warmup

STEP_LIMIT = 0.2


async def _hang() -> None:
    await asyncio.Event().wait()


def _record(names: list[str], name: str):
    async def step() -> None:
        names.append(name)

    return step


def _outcomes(caplog) -> dict[str, str]:
    return {
        r.warmup_step: r.outcome
        for r in caplog.records
        if r.name == warmup.__name__ and hasattr(r, "warmup_step")
    }


async def test_hung_coroutine_step_times_out_within_its_limit(caplog):
    caplog.set_level(logging.INFO, logger=warmup.__name__)
    started = time.perf_counter()

    outcome = await run_step(WarmupStep("models", _hang), STEP_LIMIT)

    assert outcome == "timed_out"
    assert time.perf_counter() - started < STEP_LIMIT + 1
    record = next(r for r in caplog.records if getattr(r, "warmup_step", None) == "models")
    assert record.levelno == logging.ERROR
    assert record.outcome == "timed_out"
    assert record.duration_ms >= STEP_LIMIT * 1000


async def test_hung_thread_step_stops_being_awaited():
    release = threading.Event()
    try:
        outcome = await run_step(WarmupStep("adk_orchestrator", lambda: release.wait(5)), STEP_LIMIT)
    finally:
        release.set()

    assert outcome == "timed_out"


async def test_expected_failure_is_logged_and_does_not_block(caplog):
    caplog.set_level(logging.INFO, logger=warmup.__name__)

    async def unavailable() -> None:
        raise ServiceUnavailable("firestore down")

    assert await run_step(WarmupStep("firestore_async", unavailable), STEP_LIMIT) == "failed"
    assert _outcomes(caplog) == {"firestore_async": "failed"}


async def test_unexpected_error_propagates_with_its_stack(caplog):
    caplog.set_level(logging.INFO, logger=warmup.__name__)

    async def bug() -> None:
        raise TypeError("bug in startup code")

    with pytest.raises(TypeError):
        await run_step(WarmupStep("price_book", bug), STEP_LIMIT)
    record = next(r for r in caplog.records if getattr(r, "warmup_step", None) == "price_book")
    assert record.outcome == "error"
    assert record.exc_info is not None


async def test_done_step_logs_its_duration(caplog):
    caplog.set_level(logging.INFO, logger=warmup.__name__)

    assert await run_step(WarmupStep("firebase_admin", lambda: None), STEP_LIMIT) == "done"
    record = next(r for r in caplog.records if getattr(r, "warmup_step", None) == "firebase_admin")
    assert record.levelno == logging.INFO
    assert record.duration_ms >= 0


async def test_a_hung_step_does_not_stop_the_others_or_the_later_ones(caplog):
    caplog.set_level(logging.INFO, logger=warmup.__name__)
    ran: list[str] = []

    report = await run_warmup(
        parallel=[WarmupStep("models", _hang), WarmupStep("model_armor", _record(ran, "model_armor"))],
        sequential=[
            WarmupStep("firestore_async", _record(ran, "firestore_async")),
            WarmupStep("price_book", _record(ran, "price_book")),
        ],
        step_timeout_s=STEP_LIMIT,
    )

    assert report == {
        "models": "timed_out",
        "model_armor": "done",
        "firestore_async": "done",
        "price_book": "done",
    }
    assert ran == ["model_armor", "firestore_async", "price_book"]


async def test_sequential_steps_keep_their_order():
    ran: list[str] = []

    await run_warmup(
        parallel=[],
        sequential=[WarmupStep(name, _record(ran, name)) for name in ("firestore_async", "price_book")],
        step_timeout_s=STEP_LIMIT,
    )

    assert ran == ["firestore_async", "price_book"]


async def test_a_timeout_inside_the_step_is_a_failure_not_the_step_limit():
    async def socket_timeout() -> None:
        raise TimeoutError("read timed out")

    assert await run_step(WarmupStep("firebase_admin", socket_timeout), STEP_LIMIT) == "failed"


async def test_runtime_error_of_a_service_is_an_expected_failure():
    async def not_ready() -> None:
        raise RuntimeError("client not initialized")

    assert await run_step(WarmupStep("price_book", not_ready), STEP_LIMIT) == "failed"


async def test_a_step_is_skipped_when_the_step_it_needs_did_not_complete():
    """firestore_async re-runs init_firebase on the event loop, where no limit
    can interrupt it: after a hung firebase_admin it would freeze the loop."""
    ran: list[str] = []

    report = await run_warmup(
        parallel=[WarmupStep("firebase_admin", _hang)],
        sequential=[WarmupStep("firestore_async", _record(ran, "firestore_async"), requires="firebase_admin")],
        step_timeout_s=STEP_LIMIT,
    )

    assert report == {"firebase_admin": "timed_out", "firestore_async": "skipped"}
    assert ran == []


async def test_an_unexpected_error_cancels_the_parallel_steps():
    cancelled = asyncio.Event()

    async def bug() -> None:
        raise TypeError("bug in startup code")

    async def slow() -> None:
        try:
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            cancelled.set()
            raise

    with pytest.raises(ExceptionGroup):
        await run_warmup(
            parallel=[WarmupStep("model_armor", bug), WarmupStep("adk_orchestrator", slow)],
            sequential=[],
            step_timeout_s=10,
        )
    assert cancelled.is_set()
