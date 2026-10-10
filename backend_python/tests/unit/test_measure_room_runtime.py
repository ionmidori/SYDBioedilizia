"""Room measurement in the quote tool (10 Oct 2026, production test):
runs of 40–143 s with no timeout, the same photo re-measured at every draft
regeneration, "Empty response from Gemini" when the JSON came only from code
execution, and the full signed photo URL written to the logs."""
import asyncio
import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.genai import types
from src.tools import quote_tools
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


class _FakeHttp:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url):
        resp = MagicMock()
        resp.content = b"jpeg-bytes"
        resp.headers = {"content-type": "image/jpeg"}
        resp.raise_for_status = MagicMock()
        return resp


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setattr(quote_tools.settings, "FIREBASE_STORAGE_BUCKET", BUCKET)
    monkeypatch.setattr(quote_tools.httpx, "AsyncClient", lambda **_: _FakeHttp())
    quote_tools._measure_cache.clear()
    yield
    quote_tools._measure_cache.clear()


async def test_slow_measurement_is_cut_by_the_timeout(monkeypatch):
    monkeypatch.setattr(quote_tools.settings, "MEASURE_ROOM_TIMEOUT_SECONDS", 0.05)

    async def never_ends(*_args):
        await asyncio.sleep(10)

    with patch.object(quote_tools, "measure_room_from_photo", new=never_ends):
        started = asyncio.get_running_loop().time()
        assert await quote_tools._run_measurement_vision([URL]) == ""
        assert asyncio.get_running_loop().time() - started < 2


async def test_the_same_photo_is_measured_once():
    measure = AsyncMock(return_value=MEASURES)
    with patch.object(quote_tools, "measure_room_from_photo", new=measure):
        first = await quote_tools._run_measurement_vision([URL])
        # Same bytes, freshly re-signed URL → still a cache hit.
        second = await quote_tools._run_measurement_vision([URL.replace("SECRET", "OTHER")])
    assert first and first == second
    measure.assert_awaited_once()


async def test_cache_never_answers_without_a_successful_download(monkeypatch):
    """Security review: a path-keyed cache consulted before the download let a
    forged/unsigned URL with a known object path read another client's
    measurement. The download (signature check) must always happen first."""
    measure = AsyncMock(return_value=MEASURES)
    with patch.object(quote_tools, "measure_room_from_photo", new=measure):
        assert await quote_tools._run_measurement_vision([URL])  # victim's photo cached

    class _Forbidden(_FakeHttp):
        async def get(self, url):
            resp = await super().get(url)
            resp.raise_for_status = MagicMock(side_effect=RuntimeError("403 Forbidden"))
            return resp

    monkeypatch.setattr(quote_tools.httpx, "AsyncClient", lambda **_: _Forbidden())
    forged = URL.split("?")[0]  # same object path, no valid signature
    with patch.object(quote_tools, "measure_room_from_photo", new=measure):
        assert await quote_tools._run_measurement_vision([forged]) == ""
    measure.assert_awaited_once()


async def test_failures_never_log_the_signed_url(caplog):
    caplog.set_level(logging.WARNING, logger="src.tools.quote_tools")
    with patch.object(quote_tools, "measure_room_from_photo", new=AsyncMock(side_effect=RuntimeError(URL))):
        assert await quote_tools._run_measurement_vision([URL]) == ""
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
