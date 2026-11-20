"""Unit tests for partial room brief resets and in-flight brief summarizer cancellation."""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Iterator
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.core.config import settings
from src.repositories import room_repository
from src.repositories.room_repository import RoomRepository
from src.schemas.room import DEFAULT_ROOM_ID, RoomBrief, RoomSchema
from src.services import room_brief
from src.services.room_brief import BriefTurn, schedule_room_brief_refresh
from tests.unit.firestore_fakes import FakeDb

PID = "proj-secret-123"
OTHER_PID = "proj-other-999"
SID = "sess-secret-123"
OTHER_SID = "sess-other-999"
T0 = datetime(2026, 11, 20, 10, 0, tzinfo=UTC)
T1 = T0 + timedelta(minutes=15)


@pytest.fixture()
def db() -> Iterator[FakeDb]:
    fake = FakeDb()
    with patch.object(room_repository, "get_async_firestore_client", return_value=fake):
        yield fake


@pytest.fixture(autouse=True)
async def _clean_room_brief_state(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ROOM_BRIEF_ENABLED", True)
    room_brief._watermark.clear()
    room_brief._running.clear()
    room_brief._dirty.clear()
    room_brief._saves.clear()
    yield
    pending = list(room_brief._running.values())
    room_brief._watermark.clear()
    room_brief._running.clear()
    room_brief._dirty.clear()
    room_brief._saves.clear()
    for task in pending:
        if not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


def _seed_room(
    db: FakeDb,
    project_id: str,
    room_id: str,
    *,
    label: str,
    room_type: str,
    floor_mq: float = 8.5,
    decisions: list[str] | None = None,
    summary: str | None = "Bagno 8,5 mq",
    intervention_spec: dict[str, Any] | None = None,
    photo_estimate: dict[str, Any] | None = None,
    reference_photo_id: str | None = "f1",
) -> dict[str, Any]:
    doc: dict[str, Any] = {
        "room_id": room_id,
        "label": label,
        "room_type": room_type,
        "created_at": T0,
        "updated_at": T0,
        "brief": RoomBrief(
            floor_mq=floor_mq,
            decisions=decisions if decisions is not None else ["doccia"],
        ).model_dump(),
        "summary": summary,
        "reference_photo_id": reference_photo_id,
    }
    if intervention_spec is not None:
        doc["intervention_spec"] = intervention_spec
    if photo_estimate is not None:
        doc["photo_estimate"] = photo_estimate
    db.put("projects", project_id, "rooms", room_id, doc)
    return doc


async def test_reset_brief_clears_brief_and_summary_preserving_spec_and_photo_estimate(
    db: FakeDb, caplog: pytest.LogCaptureFixture
) -> None:
    _seed_room(
        db,
        PID,
        "bagno",
        label="Bagno",
        room_type="bagno",
        floor_mq=8.5,
        decisions=["doccia"],
        summary="Bagno 8,5 mq",
        intervention_spec={"room_type": "bagno"},
        photo_estimate={"source_hash": "a" * 64},
        reference_photo_id="f1",
    )
    untouched_cucina = _seed_room(
        db,
        PID,
        "cucina",
        label="Cucina",
        room_type="cucina",
        floor_mq=14.0,
        decisions=["isola"],
        summary="Cucina 14 mq",
        intervention_spec={"room_type": "cucina"},
        photo_estimate={"source_hash": "b" * 64},
        reference_photo_id="f2",
    )

    repo = RoomRepository()
    with caplog.at_level(logging.INFO):
        with patch.object(room_repository, "utc_now", return_value=T1):
            reset_ok = await repo.reset_brief(PID, "bagno")
            missing_ok = await repo.reset_brief(PID, "missing")

    assert reset_ok is True
    assert missing_ok is False

    stored = db.get_data("projects", PID, "rooms", "bagno")
    assert stored is not None
    assert stored["brief"] == RoomBrief().model_dump()
    assert stored["summary"] is None
    assert stored["updated_at"] == T1
    assert stored["intervention_spec"] == {"room_type": "bagno"}
    assert stored["photo_estimate"] == {"source_hash": "a" * 64}
    assert stored["reference_photo_id"] == "f1"
    assert stored["label"] == "Bagno"
    assert stored["room_type"] == "bagno"
    assert stored["created_at"] == T0

    # Other rooms in the same project remain untouched.
    assert db.get_data("projects", PID, "rooms", "cucina") == untouched_cucina

    # Logs must never contain project_id.
    assert PID not in caplog.text


async def test_reset_all_briefs_resets_every_room_without_touching_files(
    db: FakeDb, caplog: pytest.LogCaptureFixture
) -> None:
    _seed_room(
        db,
        PID,
        DEFAULT_ROOM_ID,
        label="Generale",
        room_type="altro",
        floor_mq=90.0,
        decisions=["parquet"],
        summary="Casa 90 mq",
        intervention_spec={"room_type": "altro"},
        photo_estimate={"source_hash": "0" * 64},
        reference_photo_id="f0",
    )
    _seed_room(
        db,
        PID,
        "bagno",
        label="Bagno",
        room_type="bagno",
        floor_mq=8.5,
        decisions=["doccia"],
        summary="Bagno 8,5 mq",
        intervention_spec={"room_type": "bagno"},
        photo_estimate={"source_hash": "a" * 64},
        reference_photo_id="f1",
    )
    _seed_room(
        db,
        PID,
        "cucina",
        label="Cucina",
        room_type="cucina",
        floor_mq=12.0,
        decisions=["induzione"],
        summary="Cucina 12 mq",
        intervention_spec={"room_type": "cucina"},
        photo_estimate={"source_hash": "b" * 64},
        reference_photo_id="f2",
    )
    other_project_room = _seed_room(
        db,
        OTHER_PID,
        "bagno",
        label="Bagno altro progetto",
        room_type="bagno",
        floor_mq=6.0,
        decisions=["vasca"],
        summary="Bagno 6 mq",
    )

    file_1 = {"type": "image", "roomId": "bagno", "url": "https://example.com/f1.jpg"}
    file_2 = {"type": "render", "roomId": "cucina", "url": "https://example.com/f2.png"}
    db.put("projects", PID, "files", "f1", file_1)
    db.put("projects", PID, "files", "f2", file_2)

    repo = RoomRepository()
    with caplog.at_level(logging.INFO):
        with patch.object(room_repository, "utc_now", return_value=T1):
            count = await repo.reset_all_briefs(PID)
            empty_count = await repo.reset_all_briefs("empty-project")

    assert count == 3
    assert empty_count == 0

    expected_empty = RoomBrief().model_dump()
    for room_id, expected_spec, expected_photo, expected_ref, expected_label, expected_type in [
        (DEFAULT_ROOM_ID, {"room_type": "altro"}, {"source_hash": "0" * 64}, "f0", "Generale", "altro"),
        ("bagno", {"room_type": "bagno"}, {"source_hash": "a" * 64}, "f1", "Bagno", "bagno"),
        ("cucina", {"room_type": "cucina"}, {"source_hash": "b" * 64}, "f2", "Cucina", "cucina"),
    ]:
        stored = db.get_data("projects", PID, "rooms", room_id)
        assert stored is not None
        assert stored["brief"] == expected_empty
        assert stored["summary"] is None
        assert stored["updated_at"] == T1
        assert stored["intervention_spec"] == expected_spec
        assert stored["photo_estimate"] == expected_photo
        assert stored["reference_photo_id"] == expected_ref
        assert stored["label"] == expected_label
        assert stored["room_type"] == expected_type

    assert db.get_data("projects", PID, "files", "f1") == file_1
    assert db.get_data("projects", PID, "files", "f2") == file_2
    assert db.get_data("projects", OTHER_PID, "rooms", "bagno") == other_project_room
    assert PID not in caplog.text


async def test_invalidate_room_brief_state_cancels_running_task_and_clears_watermark() -> None:
    loop = asyncio.get_running_loop()

    async def _pending() -> None:
        await asyncio.sleep(60)

    bagno_task = asyncio.create_task(_pending(), name="brief-bagno")
    cucina_task = asyncio.create_task(_pending(), name="brief-cucina")
    other_task = asyncio.create_task(_pending(), name="brief-other")

    try:
        bagno_save: asyncio.Future[None] = loop.create_future()
        cucina_save: asyncio.Future[None] = loop.create_future()
        other_save: asyncio.Future[None] = loop.create_future()

        room_brief._running[(SID, "bagno")] = bagno_task
        room_brief._running[(SID, "cucina")] = cucina_task
        room_brief._running[(OTHER_SID, "bagno")] = other_task

        room_brief._dirty.update({(SID, "bagno"), (SID, "cucina"), (OTHER_SID, "bagno")})

        room_brief._saves[(SID, "bagno")] = bagno_save
        room_brief._saves[(SID, "cucina")] = cucina_save
        room_brief._saves[(OTHER_SID, "bagno")] = other_save

        room_brief._watermark[(SID, "bagno")] = "m1"
        room_brief._watermark[(SID, "cucina")] = "m2"
        room_brief._watermark[(OTHER_SID, "bagno")] = "m3"

        # Room-scoped invalidation cancels and removes only (SID, "bagno").
        room_brief.invalidate_room_brief_state(SID, "bagno")
        await asyncio.sleep(0)

        assert bagno_task.cancelled()
        assert (SID, "bagno") not in room_brief._running
        assert (SID, "bagno") not in room_brief._dirty
        assert (SID, "bagno") not in room_brief._saves
        assert (SID, "bagno") not in room_brief._watermark

        assert not cucina_task.done()
        assert room_brief._running[(SID, "cucina")] is cucina_task
        assert (SID, "cucina") in room_brief._dirty
        assert room_brief._saves[(SID, "cucina")] is cucina_save
        assert room_brief._watermark[(SID, "cucina")] == "m2"

        assert not other_task.done()
        assert room_brief._running[(OTHER_SID, "bagno")] is other_task
        assert (OTHER_SID, "bagno") in room_brief._dirty
        assert room_brief._saves[(OTHER_SID, "bagno")] is other_save
        assert room_brief._watermark[(OTHER_SID, "bagno")] == "m3"

        # Session-wide invalidation cancels and removes all keys for SID, leaving OTHER_SID intact.
        room_brief.invalidate_room_brief_state(SID, None)
        await asyncio.sleep(0)

        assert cucina_task.cancelled()
        assert all(k[0] != SID for k in room_brief._running)
        assert all(k[0] != SID for k in room_brief._dirty)
        assert all(k[0] != SID for k in room_brief._saves)
        assert all(k[0] != SID for k in room_brief._watermark)

        assert not other_task.done()
        assert room_brief._running[(OTHER_SID, "bagno")] is other_task
        assert (OTHER_SID, "bagno") in room_brief._dirty
        assert room_brief._saves[(OTHER_SID, "bagno")] is other_save
        assert room_brief._watermark[(OTHER_SID, "bagno")] == "m3"
    finally:
        for task in (bagno_task, cucina_task, other_task):
            if not task.done():
                task.cancel()
            with suppress(asyncio.CancelledError):
                await task


async def test_invalidate_cancels_inflight_refresh_without_writing_brief(
    caplog: pytest.LogCaptureFixture,
) -> None:
    started = asyncio.Event()
    room = RoomSchema(room_id="bagno", label="Bagno", room_type="bagno", created_at=T0, updated_at=T0)
    history = [{"id": "m1", "role": "user", "content": "Il bagno è 8,5 mq", "room_id": "bagno"}]

    rooms_repo = MagicMock()
    rooms_repo.get_room_versioned = AsyncMock(return_value=(room, T0))
    rooms_repo.update_brief = AsyncMock()
    rooms_repo.list_rooms = AsyncMock(return_value=[room])

    conversations_repo = MagicMock()
    conversations_repo.get_context = AsyncMock(return_value=history)

    async def slow_generate(**_: Any) -> SimpleNamespace:
        started.set()
        await asyncio.sleep(60)
        return SimpleNamespace(text=json.dumps({"changed": True, "brief": {"floor_mq": 8.5}, "summary": "Bagno"}))

    client = MagicMock()
    client.aio.models.generate_content = AsyncMock(side_effect=slow_generate)

    with (
        patch.object(room_brief, "get_room_repository", return_value=rooms_repo),
        patch.object(room_brief, "get_conversation_repository", return_value=conversations_repo),
        patch.object(room_brief, "get_genai_client", return_value=client),
        caplog.at_level(logging.INFO),
    ):
        task = schedule_room_brief_refresh(BriefTurn(project_id=PID, session_id=SID, room_id="bagno", is_guest=False))
        assert task is not None
        await asyncio.wait_for(started.wait(), timeout=1.0)

        room_brief.invalidate_room_brief_state(SID, "bagno")
        with pytest.raises(asyncio.CancelledError):
            await task

    assert task.cancelled()
    rooms_repo.update_brief.assert_not_awaited()
    assert (SID, "bagno") not in room_brief._running
    assert (SID, "bagno") not in room_brief._dirty
    assert (SID, "bagno") not in room_brief._saves
    assert (SID, "bagno") not in room_brief._watermark
    assert not any(r.levelno >= logging.ERROR for r in caplog.records)
    assert SID not in caplog.text and PID not in caplog.text


async def test_invalidate_does_not_clobber_newly_scheduled_refresh_on_unwind() -> None:
    first_started = asyncio.Event()
    second_release = asyncio.Event()
    room = RoomSchema(room_id="bagno", label="Bagno", room_type="bagno", created_at=T0, updated_at=T0)
    history = [{"id": "m1", "role": "user", "content": "Il bagno è 9 mq", "room_id": "bagno"}]
    calls = 0

    rooms_repo = MagicMock()
    rooms_repo.get_room_versioned = AsyncMock(return_value=(room, T0))
    rooms_repo.update_brief = AsyncMock()
    rooms_repo.list_rooms = AsyncMock(return_value=[room])

    conversations_repo = MagicMock()
    conversations_repo.get_context = AsyncMock(return_value=history)

    async def slow_generate(**_: Any) -> SimpleNamespace:
        nonlocal calls
        calls += 1
        if calls == 1:
            first_started.set()
            await asyncio.sleep(60)
        await second_release.wait()
        return SimpleNamespace(
            text=json.dumps({"changed": True, "brief": {"floor_mq": 9.0}, "summary": "Bagno 9 mq"})
        )

    client = MagicMock()
    client.aio.models.generate_content = AsyncMock(side_effect=slow_generate)

    with (
        patch.object(room_brief, "get_room_repository", return_value=rooms_repo),
        patch.object(room_brief, "get_conversation_repository", return_value=conversations_repo),
        patch.object(room_brief, "get_genai_client", return_value=client),
    ):
        first = schedule_room_brief_refresh(BriefTurn(project_id=PID, session_id=SID, room_id="bagno", is_guest=False))
        assert first is not None
        await asyncio.wait_for(first_started.wait(), timeout=1.0)

        # Invalidate and immediately schedule a replacement refresh before `first` unwinds.
        room_brief.invalidate_room_brief_state(SID, "bagno")
        second = schedule_room_brief_refresh(BriefTurn(project_id=PID, session_id=SID, room_id="bagno", is_guest=False))
        assert second is not None and second is not first

        # Let `first` unwind its finally block while `second` is in flight.
        with pytest.raises(asyncio.CancelledError):
            await first
        assert room_brief._running.get((SID, "bagno")) is second

        second_release.set()
        await second

    rooms_repo.update_brief.assert_awaited_once()
    assert room_brief._watermark[(SID, "bagno")] == "m1"
    assert (SID, "bagno") not in room_brief._running


def test_invalidate_room_brief_state_is_idempotent_when_absent() -> None:
    room_brief.invalidate_room_brief_state("unknown-session", "bagno")
    room_brief.invalidate_room_brief_state("unknown-session", None)
    assert not room_brief._running
    assert not room_brief._dirty
    assert not room_brief._saves
    assert not room_brief._watermark
