"""
Measures of a room estimated from its photos when the client picks it.

Several photos sent at once are first only sorted into rooms (prompt rule 2bis);
the room the client starts from is measured here, in the background, when
`select_room` makes it active. The reference photo (`reference_photo_id`, else
the newest) is measured; each other photo is then compared with it, one call at
a time, for what it adds (a wall, a window, damage). The result is stored on
the room (`PhotoEstimate`), so it survives a restart: the quote reuses it for
the same reference photo, and the brief shows it as an estimate, never as the
client's value.

Nothing here reaches the reply: errors are logged and the chat goes on; the
quote measures the photo itself when no estimate fits.
"""
import asyncio
import hashlib
import logging

import httpx
from google.api_core.exceptions import GoogleAPIError
from google.genai import errors as genai_errors
from pydantic import ValidationError

from src.adk.background import run_in_background
from src.core.config import settings
from src.core.exceptions import RoomNotFoundError
from src.repositories.room_repository import get_room_repository
from src.schemas.room import DEFAULT_ROOM_ID, PhotoEstimate
from src.utils.datetime_utils import utc_now
from src.utils.download import MediaUnavailableError, download_session_media
from src.vision.measure_room import MeasurementError, format_measurements_for_insight, measure_room_from_photo
from src.vision.photo_difference import photo_difference

logger = logging.getLogger(__name__)

_Key = tuple[str, str]  # (project_id, room_id)
# Rooms being measured: a second pick of the same room meanwhile starts nothing.
_running: dict[_Key, asyncio.Task[None]] = {}

_Photo = tuple[bytes, str, str]  # (content, mime type, sha256 of the content)


def schedule_room_vision(project_id: str, room_id: str) -> asyncio.Task[None] | None:
    """Estimate the room's measures from its photos in the background; None when
    nothing was started ("Generale", disabled, or that room is being measured).
    Callers gate guests: only registered users have rooms."""
    if not settings.ROOM_VISION_ENABLED or room_id == DEFAULT_ROOM_ID:
        return None
    key = (project_id, room_id)
    if key in _running:
        return None
    task = run_in_background(_run(project_id, room_id), name="room_photo_vision")
    _running[key] = task
    task.add_done_callback(lambda _: _running.pop(key, None))
    return task


async def _run(project_id: str, room_id: str) -> None:
    outcome = await estimate_room(project_id, room_id)
    (logger.info if not outcome.startswith("error") else logger.warning)(
        "[RoomVision] Estimate", extra={"event": "room_photo_vision", "outcome": outcome, "room_id": room_id}
    )


async def estimate_room(project_id: str, room_id: str) -> str:
    """Measure the room from its photos and store the estimate; the outcome
    ("ok", "unchanged", "no_photos", "error:<type>"), never an exception."""
    try:
        return await _estimate(project_id, room_id)
    except (
        TimeoutError, MeasurementError, GoogleAPIError, RoomNotFoundError,
        genai_errors.APIError, httpx.HTTPError, ValidationError,
    ) as exc:
        return f"error:{type(exc).__name__}"


async def _estimate(project_id: str, room_id: str) -> str:
    repo = get_room_repository()
    room, files = await asyncio.gather(
        repo.require_room(project_id, room_id), repo.files_for_room(project_id, room_id)  # newest first
    )
    images = [f for f in files if f.get("type") == "image"]
    images.sort(key=lambda f: f["id"] != room.reference_photo_id)  # stable: the reference first
    photos = await _read_photos(project_id, images)
    if not photos:
        return "no_photos"
    source_hash = hashlib.sha256(b"".join(bytes.fromhex(p[2]) for p in photos)).hexdigest()
    if room.photo_estimate is not None and room.photo_estimate.source_hash == source_hash:
        return "unchanged"

    (reference, mime, reference_hash), others = photos[0], photos[1:]
    measurements = await asyncio.wait_for(
        measure_room_from_photo(reference, mime), timeout=settings.MEASURE_ROOM_TIMEOUT_SECONDS
    )
    notes = [note for other in others if (note := await _difference(reference, mime, other))]
    await repo.update_photo_estimate(project_id, room_id, PhotoEstimate(
        source_hash=source_hash, reference_hash=reference_hash, measurements=measurements, notes=notes, at=utc_now(),
    ))
    return "ok"


async def _read_photos(project_id: str, images: list[dict]) -> list[_Photo]:
    """The first `ROOM_VISION_MAX_PHOTOS` readable images, in order; an unreadable one is skipped."""
    photos: list[_Photo] = []
    for image in images:
        if len(photos) >= settings.ROOM_VISION_MAX_PHOTOS:
            break
        ref = str((image.get("metadata") or {}).get("storage_path") or "")
        try:
            content, mime = await download_session_media(ref, project_id)
        except MediaUnavailableError:
            continue
        if mime.startswith("image/"):
            photos.append((content, mime, hashlib.sha256(content).hexdigest()))
    return photos


async def _difference(reference: bytes, mime: str, other: _Photo) -> str:
    """What one other photo adds ("" when it fails: the others still count)."""
    try:
        return await asyncio.wait_for(
            photo_difference(reference, mime, other[0], other[1]), timeout=settings.PHOTO_DIFF_TIMEOUT_SECONDS
        )
    except (TimeoutError, genai_errors.APIError, httpx.HTTPError) as exc:
        logger.warning("[RoomVision] Comparison failed", extra={"error_type": type(exc).__name__})
        return ""


def photo_estimate_block(estimate: PhotoEstimate) -> str:
    """The estimate as the quote reads it: the measures, then what the other photos add."""
    notes = "".join(f"\n- {note}" for note in estimate.notes)
    return format_measurements_for_insight(estimate.measurements) + (
        f"\n\n**Dalle altre foto della stanza**:{notes}" if notes else ""
    )
