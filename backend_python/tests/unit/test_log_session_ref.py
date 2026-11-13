"""
Cloud Logging reads `severity`, not `level`: without it every app line has no severity and
`severity>=WARNING` (alerts, Error Reporting, the console filter) misses them. And once the
session id is out of the logs, `session_ref` (a short hash of it) is how a multi-turn
conversation is followed.
"""
from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import pytest
from src.adk import adk_orchestrator as orchestrator_module
from src.adk.adk_orchestrator import ADKOrchestrator
from src.api.routes import projects_router
from src.core import context
from src.core.logger import JsonFormatter

SESSION_ID = "fdf6be7f-a8b8-40bc-9e5d-e599788fe20a"


@pytest.fixture(autouse=True)
def _clean_context():
    token = context._session_ref_ctx_var.set(None)
    yield
    context._session_ref_ctx_var.reset(token)


def _line(level: int = logging.INFO, msg: str = "x") -> dict[str, Any]:
    record = logging.LogRecord("t", level, __file__, 1, msg, (), None)
    return json.loads(JsonFormatter().format(record))


@pytest.mark.parametrize("level", [logging.DEBUG, logging.INFO, logging.WARNING, logging.ERROR, logging.CRITICAL])
def test_every_line_carries_the_severity_cloud_logging_reads(level: int) -> None:
    assert _line(level)["severity"] == logging.getLevelName(level)


def test_session_ref_is_short_stable_and_not_the_id() -> None:
    ref = context.session_ref(SESSION_ID)
    assert ref == context.session_ref(SESSION_ID)
    assert len(ref) == context.SESSION_REF_LENGTH
    assert all(c in "0123456789abcdef" for c in ref)
    assert SESSION_ID not in ref and SESSION_ID[:8] not in ref
    assert ref != context.session_ref(SESSION_ID[:-1] + "0")


def test_bound_session_shows_up_as_session_ref_never_as_the_id() -> None:
    context.bind_session(SESSION_ID)
    body = _line()
    assert body["session_ref"] == context.session_ref(SESSION_ID)
    assert SESSION_ID not in json.dumps(body)
    assert "session_id" not in body


def test_no_session_no_session_ref() -> None:
    assert "session_ref" not in _line()


async def test_a_chat_turn_binds_its_session(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str | None] = []

    async def events(*_a: object, **_k: object) -> AsyncIterator[dict]:
        seen.append(context.get_session_ref())
        yield {}

    async def stream(source: AsyncIterator[dict], message_id: str) -> AsyncIterator[str]:
        async for _ in source:
            yield "data"

    orchestrator = ADKOrchestrator.__new__(ADKOrchestrator)
    monkeypatch.setattr(orchestrator, "_stream_events", events)
    monkeypatch.setattr(orchestrator_module, "to_ui_message_stream", stream)
    request = type("R", (), {"session_id": SESSION_ID})()

    _ = [chunk async for chunk in orchestrator.stream_chat(request, object())]

    assert seen == [context.session_ref(SESSION_ID)]


async def test_a_project_route_binds_its_session(monkeypatch: pytest.MonkeyPatch) -> None:
    class Doc:
        exists = True

        def to_dict(self) -> dict[str, str]:
            return {"user_id": "u1"}

    class Ref:
        async def get(self) -> Doc:
            return Doc()

    class Collection:
        def document(self, _id: str) -> Ref:
            return Ref()

    class Client:
        def collection(self, _name: str) -> Collection:
            return Collection()

    monkeypatch.setattr(projects_router, "get_async_firestore_client", lambda: Client())
    monkeypatch.setattr(projects_router, "is_owner", lambda *_a: True)

    await projects_router._require_owned_project(SESSION_ID, "u1")

    assert context.get_session_ref() == context.session_ref(SESSION_ID)
