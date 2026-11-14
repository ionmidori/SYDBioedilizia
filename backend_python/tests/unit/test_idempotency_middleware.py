"""Unit tests for IdempotencyMiddleware route matching, replay scoping, and CORS preflight."""

import asyncio

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from httpx import ASGITransport, AsyncClient
from main import app as main_app
from src.middleware.idempotency import IdempotencyMiddleware, is_idempotent_path


def _test_app(
    *,
    entered: asyncio.Event | None = None,
    release: asyncio.Event | None = None,
) -> FastAPI:
    app = FastAPI()
    app.add_middleware(IdempotencyMiddleware)
    counter = {
        "feedback": 0,
        "testimonial": 0,
        "file": 0,
        "room": 0,
        "stream": 0,
        "get_testimonials": 0,
        "flaky": 0,
    }

    @app.post("/feedback")
    async def post_feedback():
        counter["feedback"] += 1
        return {"feedback_id": f"fb-{counter['feedback']}"}

    @app.post("/api/content/testimonials", status_code=201)
    async def post_testimonial():
        counter["testimonial"] += 1
        return {"status": "ok", "n": counter["testimonial"]}

    @app.get("/api/content/testimonials")
    async def get_testimonials():
        counter["get_testimonials"] += 1
        return {"calls": counter["get_testimonials"]}

    @app.post("/api/projects/{session_id}/files")
    async def post_file(session_id: str):
        counter["file"] += 1
        return {"file_id": f"f-{counter['file']}", "session_id": session_id}

    @app.post("/api/projects/flaky/rooms")
    async def post_flaky():
        counter["flaky"] += 1
        if counter["flaky"] == 1:
            raise HTTPException(status_code=422, detail="bad payload")
        return {"ok": True, "attempt": counter["flaky"]}

    @app.post("/api/projects/{session_id}/rooms", status_code=201)
    async def post_room(session_id: str):
        if entered is not None and release is not None:
            entered.set()
            await release.wait()
        counter["room"] += 1
        return {"room_id": f"r-{counter['room']}", "session_id": session_id}

    @app.post("/chat/stream")
    async def post_stream():
        counter["stream"] += 1
        return {"stream_call": counter["stream"]}

    return app


def test_is_idempotent_path_matches_active_endpoints_and_rejects_legacy() -> None:
    assert is_idempotent_path("/feedback") is True
    assert is_idempotent_path("/api/content/testimonials") is True
    assert is_idempotent_path("/api/projects/sess_123/files") is True
    assert is_idempotent_path("/api/projects/proj-abc_9/rooms") is True

    assert is_idempotent_path("/api/submit-lead") is False
    assert is_idempotent_path("/chat/stream") is False
    assert is_idempotent_path("/feedback/extra") is False
    assert is_idempotent_path("/api/content/testimonials/1") is False
    assert is_idempotent_path("/api/projects//rooms") is False
    assert is_idempotent_path("/api/projects/sess_123/files/file_1") is False
    assert is_idempotent_path(f"/api/projects/{'a' * 129}/rooms") is False


@pytest.mark.asyncio
async def test_idempotency_middleware_replays_cached_response_per_identity() -> None:
    app = _test_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r1 = await client.post(
            "/api/projects/sess_1/rooms",
            headers={"Idempotency-Key": "key-1", "Authorization": "Bearer user-a"},
        )
        r2 = await client.post(
            "/api/projects/sess_1/rooms",
            headers={"Idempotency-Key": "key-1", "Authorization": "Bearer user-a"},
        )
        r3 = await client.post(
            "/api/projects/sess_1/rooms",
            headers={"Idempotency-Key": "key-1", "Authorization": "Bearer user-b"},
        )
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r2.json() == r1.json()
    assert r2.headers.get("x-idempotency-replayed") == "true"
    assert r3.status_code == 201
    assert r3.json() != r1.json()
    assert "x-idempotency-replayed" not in r3.headers


@pytest.mark.asyncio
async def test_idempotency_middleware_replays_feedback_files_and_testimonials() -> None:
    app = _test_app()
    headers = {"Idempotency-Key": "dup-key", "Authorization": "Bearer user-a"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        fb1 = await client.post("/feedback", headers=headers)
        fb2 = await client.post("/feedback", headers=headers)
        f1 = await client.post("/api/projects/sess_1/files", headers=headers)
        f2 = await client.post("/api/projects/sess_1/files", headers=headers)
        t1 = await client.post("/api/content/testimonials", headers=headers)
        t2 = await client.post("/api/content/testimonials", headers=headers)

    assert fb1.status_code == 200 and fb2.json() == fb1.json()
    assert fb2.headers.get("x-idempotency-replayed") == "true"

    assert f1.status_code == 200 and f2.json() == f1.json()
    assert f2.headers.get("x-idempotency-replayed") == "true"

    assert t1.status_code == 201 and t2.status_code == 201 and t2.json() == t1.json()
    assert t2.headers.get("x-idempotency-replayed") == "true"


@pytest.mark.asyncio
async def test_idempotency_middleware_skips_missing_key_get_and_streaming() -> None:
    app = _test_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        no_key_1 = await client.post("/feedback")
        no_key_2 = await client.post("/feedback")
        get_1 = await client.get("/api/content/testimonials", headers={"Idempotency-Key": "k-get"})
        get_2 = await client.get("/api/content/testimonials", headers={"Idempotency-Key": "k-get"})
        stream_1 = await client.post("/chat/stream", headers={"Idempotency-Key": "k-stream"})
        stream_2 = await client.post("/chat/stream", headers={"Idempotency-Key": "k-stream"})

    assert no_key_1.json() != no_key_2.json()
    assert get_1.json() != get_2.json()
    assert stream_1.json() != stream_2.json()


def test_cors_middleware_allows_idempotency_key_header() -> None:
    cors_layers = [m for m in main_app.user_middleware if m.cls is CORSMiddleware]
    assert len(cors_layers) == 1
    allow_headers = cors_layers[0].kwargs.get("allow_headers", [])
    assert "Idempotency-Key" in allow_headers


@pytest.mark.asyncio
async def test_idempotency_middleware_returns_409_for_concurrent_inflight_request() -> None:
    entered = asyncio.Event()
    release = asyncio.Event()
    app = _test_app(entered=entered, release=release)
    headers = {"Idempotency-Key": "inflight-key", "Authorization": "Bearer user-a"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first_task = asyncio.create_task(client.post("/api/projects/sess_1/rooms", headers=headers))
        await entered.wait()
        conflict_resp = await client.post("/api/projects/sess_1/rooms", headers=headers)
        release.set()
        first_resp = await first_task

    assert conflict_resp.status_code == 409
    assert conflict_resp.json()["error_code"] == "IDEMPOTENCY_CONFLICT"
    assert first_resp.status_code == 201


@pytest.mark.asyncio
async def test_idempotency_middleware_does_not_cache_4xx_responses() -> None:
    app = _test_app()
    headers = {"Idempotency-Key": "retry-after-422", "Authorization": "Bearer user-a"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r1 = await client.post("/api/projects/flaky/rooms", headers=headers)
        r2 = await client.post("/api/projects/flaky/rooms", headers=headers)

    assert r1.status_code == 422
    assert r2.status_code == 200
    assert r2.json() == {"ok": True, "attempt": 2}
    assert "x-idempotency-replayed" not in r2.headers
