"""The client picks the room to start from: its photos are measured in the background.

Test chat of 18/11: several photos at once got a full analysis in the same turn,
and the quote measured the photo again later. Now the turn only lists the rooms
(prompt rule 2bis); when a room is picked (`select_room`), the room's reference
photo is measured, and each other photo is compared with it, one at a time.
The estimate is stored on the room, so the quote reuses it (also after a
restart) and the brief shows it as an estimate, never as the client's value.
"""
import asyncio
import hashlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError
from src.adk import tools
from src.repositories import room_repository
from src.repositories.room_repository import RoomRepository
from src.schemas.room import DEFAULT_ROOM_ID, PhotoEstimate, RoomCreate, RoomSchema
from src.services import room_photo_vision as vision
from src.tools import quote_tools
from src.tools.room_tools import brief_lines
from src.utils.datetime_utils import utc_now
from src.utils.download import MediaUnavailableError
from src.vision.measure_room import MeasurementError, RoomMeasurements
from tests.unit.firestore_fakes import FakeDb

PROJECT = "proj-1"
ROOM = "r_sogg"
MEASURES = RoomMeasurements(
    room_type="soggiorno",
    estimated_floor_mq=18.0,
    estimated_walls_mq=42.0,
    estimated_ceiling_mq=18.0,
    estimated_perimeter_ml=17.0,
)


def _file(file_id: str, file_type: str = "image") -> dict:
    return {"id": file_id, "type": file_type, "metadata": {"storage_path": f"projects/{PROJECT}/{file_id}.jpg"}}


def _bytes(ref: str) -> bytes:
    return ref.encode()


def _hash(*refs: str) -> str:
    return hashlib.sha256(b"".join(hashlib.sha256(_bytes(r)).digest() for r in refs)).hexdigest()


def _room(reference: str | None = None, estimate: PhotoEstimate | None = None) -> RoomSchema:
    now = utc_now()
    return RoomSchema(
        room_id=ROOM, label="Soggiorno", room_type="soggiorno", created_at=now, updated_at=now,
        reference_photo_id=reference, photo_estimate=estimate,
    )


def _estimate(source_hash: str, reference: str = "f1", notes: list[str] | None = None) -> PhotoEstimate:
    return PhotoEstimate(
        source_hash=source_hash,
        reference_hash=hashlib.sha256(_bytes(f"projects/{PROJECT}/{reference}.jpg")).hexdigest(),
        measurements=MEASURES, notes=notes or [], at=utc_now(),
    )


def _repo(room: RoomSchema, files: list[dict]) -> MagicMock:
    repo = MagicMock()
    repo.require_room = AsyncMock(return_value=room)
    repo.files_for_room = AsyncMock(return_value=files)
    repo.update_photo_estimate = AsyncMock()
    return repo


async def _read(ref: str, session_id: str, **_):
    assert session_id == PROJECT
    return _bytes(ref), "image/jpeg"


@pytest.fixture
def env(monkeypatch):
    """Patches the room repository, the downloads and both vision calls."""
    def setup(room: RoomSchema, files: list[dict], *, measure=None, difference=None):
        repo = _repo(room, files)
        calls = MagicMock(
            repo=repo,
            measure=measure or AsyncMock(return_value=MEASURES),
            difference=difference or AsyncMock(side_effect=lambda ref, rm, other, om: f"nota {other.decode()[-6:-4]}"),
            read=AsyncMock(side_effect=_read),
        )
        monkeypatch.setattr(vision, "get_room_repository", lambda: repo)
        monkeypatch.setattr(vision, "download_session_media", calls.read)
        monkeypatch.setattr(vision, "measure_room_from_photo", calls.measure)
        monkeypatch.setattr(vision, "photo_difference", calls.difference)
        return calls
    return setup


async def test_one_photo_is_measured_without_a_difference_call(env):
    calls = env(_room(), [_file("f1")])
    assert await vision.estimate_room(PROJECT, ROOM) == "ok"
    calls.measure.assert_awaited_once_with(_bytes(f"projects/{PROJECT}/f1.jpg"), "image/jpeg")
    calls.difference.assert_not_awaited()
    saved: PhotoEstimate = calls.repo.update_photo_estimate.await_args.args[2]
    assert calls.repo.update_photo_estimate.await_args.args[:2] == (PROJECT, ROOM)
    assert saved.measurements == MEASURES and saved.notes == []
    assert saved.source_hash == _hash(f"projects/{PROJECT}/f1.jpg")


async def test_the_reference_photo_is_measured_and_each_other_photo_compared_with_it(env):
    # files_for_room: newest first; the reference photo is the oldest one.
    calls = env(_room(reference="f1"), [_file("f3"), _file("f2"), _file("f1")])
    assert await vision.estimate_room(PROJECT, ROOM) == "ok"
    ref = _bytes(f"projects/{PROJECT}/f1.jpg")
    calls.measure.assert_awaited_once_with(ref, "image/jpeg")
    compared = [c.args for c in calls.difference.await_args_list]
    assert compared == [
        (ref, "image/jpeg", _bytes(f"projects/{PROJECT}/f3.jpg"), "image/jpeg"),
        (ref, "image/jpeg", _bytes(f"projects/{PROJECT}/f2.jpg"), "image/jpeg"),
    ]
    saved: PhotoEstimate = calls.repo.update_photo_estimate.await_args.args[2]
    assert saved.notes == ["nota f3", "nota f2"]


async def test_the_comparisons_run_one_at_a_time(env):
    running: list[int] = []

    async def difference(*_args):
        running.append(1)
        assert len(running) == 1
        await asyncio.sleep(0)
        running.pop()
        return ""

    calls = env(_room(), [_file("f3"), _file("f2"), _file("f1")], difference=AsyncMock(side_effect=difference))
    assert await vision.estimate_room(PROJECT, ROOM) == "ok"
    assert calls.difference.await_count == 2
    # A photo that adds nothing leaves no note.
    assert calls.repo.update_photo_estimate.await_args.args[2].notes == []


async def test_renders_and_videos_are_never_read(env):
    calls = env(_room(), [_file("r1", "render"), _file("v1", "video"), _file("f1")])
    await vision.estimate_room(PROJECT, ROOM)
    assert [c.args[0] for c in calls.read.await_args_list] == [f"projects/{PROJECT}/f1.jpg"]


async def test_no_more_photos_than_the_configured_cap(env, monkeypatch):
    monkeypatch.setattr(vision.settings, "ROOM_VISION_MAX_PHOTOS", 2)
    calls = env(_room(), [_file("f4"), _file("f3"), _file("f2"), _file("f1")])
    await vision.estimate_room(PROJECT, ROOM)
    assert calls.read.await_count == 2 and calls.difference.await_count == 1


async def test_a_room_without_photos_is_not_measured(env):
    calls = env(_room(), [])
    assert await vision.estimate_room(PROJECT, ROOM) == "no_photos"
    calls.measure.assert_not_awaited()
    calls.repo.update_photo_estimate.assert_not_awaited()


async def test_the_same_photos_are_not_measured_again(env):
    stored = _estimate(_hash(f"projects/{PROJECT}/f2.jpg", f"projects/{PROJECT}/f1.jpg"))
    calls = env(_room(estimate=stored), [_file("f2"), _file("f1")])
    assert await vision.estimate_room(PROJECT, ROOM) == "unchanged"
    calls.measure.assert_not_awaited()
    calls.difference.assert_not_awaited()
    calls.repo.update_photo_estimate.assert_not_awaited()


async def test_a_new_photo_measures_the_room_again(env):
    stored = _estimate(_hash(f"projects/{PROJECT}/f1.jpg"))
    calls = env(_room(estimate=stored), [_file("f2"), _file("f1")])
    assert await vision.estimate_room(PROJECT, ROOM) == "ok"
    calls.measure.assert_awaited_once()


@pytest.mark.parametrize("error", [MeasurementError("no json"), TimeoutError()])
async def test_a_failed_measurement_stores_nothing(env, error):
    calls = env(_room(), [_file("f1")], measure=AsyncMock(side_effect=error))
    assert (await vision.estimate_room(PROJECT, ROOM)).startswith("error")
    calls.repo.update_photo_estimate.assert_not_awaited()


async def test_a_failed_comparison_keeps_the_others(env):
    async def difference(ref, rm, other, om):
        if other.endswith(b"f2.jpg"):  # f3, the newest, is the reference
            raise TimeoutError
        return "parete con finestra"

    calls = env(_room(), [_file("f3"), _file("f2"), _file("f1")], difference=AsyncMock(side_effect=difference))
    assert await vision.estimate_room(PROJECT, ROOM) == "ok"
    assert calls.repo.update_photo_estimate.await_args.args[2].notes == ["parete con finestra"]


async def test_an_unreadable_photo_is_skipped(env):
    async def read(ref, session_id, **_):
        if ref.endswith("f2.jpg"):
            raise MediaUnavailableError("gone")
        return _bytes(ref), "image/jpeg"

    calls = env(_room(), [_file("f2"), _file("f1")])
    calls.read.side_effect = read
    assert await vision.estimate_room(PROJECT, ROOM) == "ok"
    calls.measure.assert_awaited_once_with(_bytes(f"projects/{PROJECT}/f1.jpg"), "image/jpeg")


async def test_errors_never_reach_the_chat(env):
    calls = env(_room(), [_file("f1")])
    calls.repo.update_photo_estimate.side_effect = vision.GoogleAPIError("down")
    assert await vision.estimate_room(PROJECT, ROOM) == "error:GoogleAPIError"


# ── Scheduling ──────────────────────────────────────────────────────────────

async def test_one_estimate_per_room_at_a_time(monkeypatch):
    gate = asyncio.Event()

    async def slow(*_args):
        await gate.wait()
        return "ok"

    monkeypatch.setattr(vision, "estimate_room", slow)
    first = vision.schedule_room_vision(PROJECT, ROOM)
    assert first is not None
    assert vision.schedule_room_vision(PROJECT, ROOM) is None
    gate.set()
    await first
    await asyncio.sleep(0)
    again = vision.schedule_room_vision(PROJECT, ROOM)
    assert again is not None
    await again


def test_the_general_room_is_not_measured():
    # "Generale" holds the photos of the whole home, not of one room.
    assert vision.schedule_room_vision(PROJECT, DEFAULT_ROOM_ID) is None


def test_nothing_is_scheduled_when_disabled(monkeypatch):
    monkeypatch.setattr(vision.settings, "ROOM_VISION_ENABLED", False)
    assert vision.schedule_room_vision(PROJECT, ROOM) is None


def _ctx() -> MagicMock:
    ctx = MagicMock()
    ctx.session.id = PROJECT
    ctx.user_id = "uid"
    ctx.state = {}
    return ctx


async def test_picking_a_room_starts_its_estimate():
    ok = {"status": "success", "room_id": ROOM, "label": "Soggiorno", "room_type": "soggiorno"}
    with patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)), \
         patch.object(tools.room_tools, "select_room", new=AsyncMock(return_value=(ok, [_room()]))), \
         patch.object(tools, "schedule_room_vision") as schedule:
        await tools.select_room(name="Soggiorno", room_type="soggiorno", session_id=PROJECT, tool_context=_ctx())
    schedule.assert_called_once_with(PROJECT, ROOM)


async def test_a_failed_pick_starts_nothing():
    with patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)), \
         patch.object(tools.room_tools, "select_room", new=AsyncMock(return_value=({"status": "error"}, []))), \
         patch.object(tools, "schedule_room_vision") as schedule:
        await tools.select_room(name="x", room_type="altro", session_id=PROJECT, tool_context=_ctx())
    schedule.assert_not_called()


# ── Reuse: quote and brief ──────────────────────────────────────────────────

async def test_the_quote_reuses_the_stored_estimate(monkeypatch):
    """After a restart the in-memory cache is empty: the stored estimate is used."""
    monkeypatch.setattr(quote_tools.settings, "FIREBASE_STORAGE_BUCKET", "b")
    monkeypatch.setattr(quote_tools, "session_media_path", lambda ref, sid: ref)
    monkeypatch.setattr(quote_tools, "download_session_media", _read)
    quote_tools._measure_cache.clear()
    measure = AsyncMock(return_value=MEASURES)
    monkeypatch.setattr(quote_tools, "measure_room_from_photo", measure)
    stored = _estimate("0" * 64, notes=["parete con finestra"])
    block = await quote_tools._run_measurement_vision([f"projects/{PROJECT}/f1.jpg"], PROJECT, stored=stored)
    measure.assert_not_awaited()
    assert "18.0 mq" in block and "parete con finestra" in block
    quote_tools._measure_cache.clear()


async def test_the_quote_measures_when_the_stored_estimate_is_of_another_photo(monkeypatch):
    monkeypatch.setattr(quote_tools, "session_media_path", lambda ref, sid: ref)
    monkeypatch.setattr(quote_tools, "download_session_media", _read)
    quote_tools._measure_cache.clear()
    measure = AsyncMock(return_value=MEASURES)
    monkeypatch.setattr(quote_tools, "measure_room_from_photo", measure)
    stored = _estimate("0" * 64, reference="f9")
    await quote_tools._run_measurement_vision([f"projects/{PROJECT}/f1.jpg"], PROJECT, stored=stored)
    measure.assert_awaited_once()
    quote_tools._measure_cache.clear()


def test_the_brief_shows_the_estimate_as_an_estimate():
    lines = brief_lines(_room(estimate=_estimate("0" * 64)))
    line = next(x for x in lines if "foto" in x)
    assert "stima" in line.casefold() and "18" in line and "42" in line
    assert not any(x.startswith("- Pavimento (mq)") for x in lines)  # not the client's value


def test_the_estimate_stays_out_of_the_api():
    room = _room(estimate=_estimate("0" * 64))
    assert "photo_estimate" not in room.model_dump() and "photo_estimate" not in room.model_dump_json()


def test_an_unreadable_estimate_reads_as_none():
    now = utc_now()
    room = RoomSchema.model_validate({
        "room_id": ROOM, "label": "Soggiorno", "room_type": "soggiorno", "created_at": now, "updated_at": now,
        "photo_estimate": {"source_hash": "x", "future_field": 1},
    })
    assert room.photo_estimate is None


def test_the_estimate_rejects_a_bad_hash():
    with pytest.raises(ValidationError):
        PhotoEstimate(source_hash="x", reference_hash="0" * 64, measurements=MEASURES, at=utc_now())


async def test_the_estimate_is_stored_on_the_room_and_read_back():
    with patch.object(room_repository, "get_async_firestore_client", return_value=FakeDb()):
        repo = RoomRepository()
        room = await repo.create_room(PROJECT, RoomCreate(label="Soggiorno", room_type="soggiorno"))
        estimate = _estimate("0" * 64, notes=["parete con finestra"])
        await repo.update_photo_estimate(PROJECT, room.room_id, estimate)
        stored = await repo.get_room(PROJECT, room.room_id)
    assert stored is not None and stored.photo_estimate == estimate and stored.label == "Soggiorno"


# ── Review fixes: a stale estimate, a pick while measuring ─────────────────

async def test_a_room_left_without_photos_loses_its_estimate(env):
    calls = env(_room(estimate=_estimate("0" * 64)), [])
    assert await vision.estimate_room(PROJECT, ROOM) == "no_photos"
    calls.repo.update_photo_estimate.assert_awaited_once_with(PROJECT, ROOM, None)


async def test_moving_a_photo_clears_the_estimate_of_both_rooms():
    db = FakeDb()
    with patch.object(room_repository, "get_async_firestore_client", return_value=db):
        repo = RoomRepository()
        living = await repo.create_room(PROJECT, RoomCreate(label="Soggiorno", room_type="soggiorno"))
        bath = await repo.create_room(PROJECT, RoomCreate(label="Bagno", room_type="bagno"))
        for room in (living, bath):
            await repo.update_photo_estimate(PROJECT, room.room_id, _estimate("0" * 64))
        db.put("projects", PROJECT, "files", "f1", {"type": "image", "roomId": bath.room_id})
        await repo.assign_file_to_room(PROJECT, "f1", living.room_id)
        rooms = [await repo.get_room(PROJECT, r.room_id) for r in (living, bath)]
    assert [r.photo_estimate for r in rooms if r is not None] == [None, None]


async def test_the_quote_brief_leaves_the_estimate_to_the_measures_block():
    """The quote reads the estimate only through _run_measurement_vision (same photo):
    in its brief an outdated one would contradict the new measurement."""
    block = quote_tools._brief_block(_room(estimate=_estimate("0" * 64)))
    assert "Stima da foto" not in block


async def test_a_new_room_is_not_measured_when_created():
    """Rule 2bis creates the rooms in the listing turn, before their photos are filed."""
    ok = {"status": "success", "room_id": ROOM, "label": "Soggiorno", "room_type": "soggiorno", "created": True}
    with patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)), \
         patch.object(tools.room_tools, "select_room", new=AsyncMock(return_value=(ok, [_room()]))), \
         patch.object(tools, "schedule_room_vision") as schedule:
        await tools.select_room(name="Soggiorno", room_type="soggiorno", session_id=PROJECT, tool_context=_ctx())
    schedule.assert_not_called()


async def test_a_pick_while_measuring_measures_again_afterwards(monkeypatch):
    gate = asyncio.Event()
    runs: list[int] = []

    async def slow(*_args):
        runs.append(1)
        if len(runs) == 1:
            await gate.wait()
        return "ok"

    monkeypatch.setattr(vision, "estimate_room", slow)
    task = vision.schedule_room_vision(PROJECT, ROOM)
    assert task is not None
    await asyncio.sleep(0)
    assert vision.schedule_room_vision(PROJECT, ROOM) is None  # photos filed meanwhile
    gate.set()
    await task
    assert len(runs) == 2
