"""Background work of a chat turn: kept alive until it ends, failures logged."""
import asyncio

from src.adk import background
from src.adk.background import run_in_background


async def test_task_is_held_until_it_ends():
    release = asyncio.Event()

    async def work() -> str:
        await release.wait()
        return "fatto"

    task = run_in_background(work(), name="save")
    assert task in background._inflight
    release.set()
    assert await task == "fatto"
    await asyncio.sleep(0)
    assert task not in background._inflight


async def test_an_unawaited_failure_is_logged_with_the_task_name(caplog):
    async def boom() -> None:
        raise RuntimeError("compaction failed")

    with caplog.at_level("ERROR"):
        task = run_in_background(boom(), name="adk_compaction")
        await asyncio.wait([task])
        await asyncio.sleep(0)
    record = next(r for r in caplog.records if getattr(r, "event", None) == "background_task_failed")
    assert (record.task, record.error) == ("adk_compaction", "RuntimeError")


async def test_a_cancelled_task_is_not_an_error(caplog):
    task = run_in_background(asyncio.sleep(10), name="room_brief_refresh")
    await asyncio.sleep(0)
    task.cancel()
    with caplog.at_level("ERROR"):
        await asyncio.wait([task])
        await asyncio.sleep(0)
    assert not any(getattr(r, "event", None) == "background_task_failed" for r in caplog.records)
