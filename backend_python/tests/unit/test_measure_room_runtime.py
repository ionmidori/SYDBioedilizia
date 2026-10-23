"""Room measurement in the quote tool (10 Oct 2026, production test):
runs of 40–143 s with no timeout, the same photo re-measured at every draft
regeneration, "Empty response from Gemini" when the JSON came only from code
execution, and the full signed photo URL written to the logs. Since Phase 138
the photo is read by Storage path, among the session's own files only."""
import asyncio
import logging
from unittest.mock import AsyncMock, patch

import pytest
from google.genai import types
from src.tools import quote_tools
from src.utils.download import MediaUnavailableError
from src.vision.measure_room import RoomMeasurements, response_text

BUCKET = "test-bucket"
URL = f"https://storage.googleapis.com/{BUCKET}/user-uploads/s1/photo.jpg?X-Goog-Signature=SECRET"
MEASURES = RoomMeasurements(
    room_type="cucina",
    estimated_floor_mq=12.0,
    estimated_walls_mq=30.0,
    estimated_ceiling_mq=12.0,
    estimated_perimeter_ml=14.0,
)


async def _read_photo(ref, session_id, **_):
    return b"jpeg-bytes", "image/jpeg"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setattr(quote_tools.settings, "FIREBASE_STORAGE_BUCKET", BUCKET)
    monkeypatch.setattr(quote_tools, "download_session_media", _read_photo)
    quote_tools._measure_cache.clear()
    yield
    quote_tools._measure_cache.clear()


async def test_slow_measurement_is_cut_by_the_timeout(monkeypatch):
    monkeypatch.setattr(quote_tools.settings, "MEASURE_ROOM_TIMEOUT_SECONDS", 0.05)

    async def never_ends(*_args):
        await asyncio.sleep(10)

    with patch.object(quote_tools, "measure_room_from_photo", new=never_ends):
        started = asyncio.get_running_loop().time()
        assert await quote_tools._run_measurement_vision([URL], "s1") == ""
        assert asyncio.get_running_loop().time() - started < 2


async def test_the_same_photo_is_measured_once():
    measure = AsyncMock(return_value=MEASURES)
    with patch.object(quote_tools, "measure_room_from_photo", new=measure):
        first = await quote_tools._run_measurement_vision([URL], "s1")
        # Same bytes, freshly re-signed URL → still a cache hit.
        second = await quote_tools._run_measurement_vision([URL.replace("SECRET", "OTHER")], "s1")
    assert first and first == second
    measure.assert_awaited_once()


async def test_photo_is_read_by_path_after_the_signed_url_expired():
    """Phase 138: the history keeps 1-hour signed URLs; the tool reads the path."""
    reads: list[str] = []

    async def read(ref, session_id, **_):
        reads.append(ref)
        return b"jpeg-bytes", "image/jpeg"

    with patch.object(quote_tools, "download_session_media", new=read),          patch.object(quote_tools, "measure_room_from_photo", new=AsyncMock(return_value=MEASURES)):
        assert await quote_tools._run_measurement_vision([URL], "s1")
    assert reads == ["user-uploads/s1/photo.jpg"]


async def test_another_sessions_photo_is_never_read():
    """A URL planted in the chat cannot make the tool read another project's photo."""
    read = AsyncMock(return_value=(b"jpeg-bytes", "image/jpeg"))
    foreign = URL.replace("/s1/", "/s2/")
    with patch.object(quote_tools, "download_session_media", new=read),          patch.object(quote_tools, "measure_room_from_photo", new=AsyncMock(return_value=MEASURES)):
        assert await quote_tools._run_measurement_vision([foreign], "s1") == ""
    read.assert_not_awaited()


async def test_cache_never_answers_without_a_successful_read(monkeypatch):
    """The cache is keyed by the bytes: a photo that cannot be read (deleted,
    outside the session) never yields a cached measurement."""
    measure = AsyncMock(return_value=MEASURES)
    with patch.object(quote_tools, "measure_room_from_photo", new=measure):
        assert await quote_tools._run_measurement_vision([URL], "s1")  # photo cached

    async def missing(ref, session_id, **_):
        raise MediaUnavailableError("media file not found")

    monkeypatch.setattr(quote_tools, "download_session_media", missing)
    with patch.object(quote_tools, "measure_room_from_photo", new=measure):
        assert await quote_tools._run_measurement_vision([URL], "s1") == ""
    measure.assert_awaited_once()


async def test_renders_are_not_measured():
    render = f"https://storage.googleapis.com/{BUCKET}/renders/s1/r.png?X-Goog-Signature=SECRET"
    measure = AsyncMock(return_value=MEASURES)
    with patch.object(quote_tools, "measure_room_from_photo", new=measure):
        assert await quote_tools._run_measurement_vision([render], "s1") == ""
    measure.assert_not_awaited()


async def test_failures_never_log_the_signed_url(caplog):
    caplog.set_level(logging.WARNING, logger="src.tools.quote_tools")
    with patch.object(quote_tools, "measure_room_from_photo", new=AsyncMock(side_effect=RuntimeError(URL))):
        assert await quote_tools._run_measurement_vision([URL], "s1") == ""
    logged = " ".join(r.getMessage() + str(r.__dict__) for r in caplog.records)
    assert "Measurement failed" in logged
    assert "SECRET" not in logged and "photo.jpg" not in logged


def test_json_only_in_code_execution_output_is_found():
    response = types.GenerateContentResponse(
        candidates=[
            types.Candidate(
                content=types.Content(
                    role="model",
                    parts=[
                        types.Part(executable_code=types.ExecutableCode(code="print(1)", language="PYTHON")),
                        types.Part(
                            code_execution_result=types.CodeExecutionResult(
                                outcome="OUTCOME_OK", output='{"room_type": "cucina"}'
                            )
                        ),
                    ],
                )
            )
        ]
    )
    assert '"room_type": "cucina"' in response_text(response)


def test_plain_text_response_is_used_as_is():
    response = types.GenerateContentResponse(
        candidates=[types.Candidate(content=types.Content(role="model", parts=[types.Part(text="{}")]))]
    )
    assert response_text(response) == "{}"
