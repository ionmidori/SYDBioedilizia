"""
Project and session ids are UUIDs and, for a guest, a bearer token: the logger masks them
wherever they reach a log (message, extra fields, uvicorn access lines with the URL path).
"""
from __future__ import annotations

import json
import logging

import pytest
from src.core import logger as log_module
from src.core.logger import AccessLogIdFilter, JsonFormatter, _redact, setup_logging

PROJECT_ID = "fdf6be7f-a8b8-40bc-9e5d-e599788fe20a"


def _record(msg: str, args: tuple[object, ...] = (), **extra: object) -> logging.LogRecord:
    record = logging.LogRecord("t", logging.INFO, __file__, 1, msg, args, None)
    record.__dict__.update(extra)
    return record


def test_redact_masks_a_uuid_before_the_phone_pattern_can_split_it() -> None:
    assert _redact(f"session {PROJECT_ID} saved") == "session [ID] saved"


def test_formatter_masks_a_uuid_in_the_message_and_in_extra_fields() -> None:
    body = json.loads(JsonFormatter().format(_record(f"open {PROJECT_ID}", path=f"/api/projects/{PROJECT_ID}/x", n=3)))
    assert PROJECT_ID not in json.dumps(body)
    assert body["path"] == "/api/projects/[ID]/x"
    assert body["n"] == 3


def test_access_filter_masks_the_uuid_in_the_request_path() -> None:
    record = _record(
        '%s - "%s %s HTTP/%s" %d', ("10.0.0.1:1", "GET", f"/api/projects/{PROJECT_ID}/confirmations", "1.1", 200)
    )
    assert AccessLogIdFilter().filter(record) is True
    assert PROJECT_ID not in record.getMessage()
    assert "/api/projects/[ID]/confirmations" in record.getMessage()


@pytest.fixture
def restore_uvicorn_access():
    access = logging.getLogger("uvicorn.access")
    before = list(access.filters)
    yield access
    access.filters[:] = before


def test_setup_logging_puts_the_filter_on_the_uvicorn_access_logger(
    restore_uvicorn_access: logging.Logger, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(log_module.settings, "ENV", "production")  # no log file on disk
    monkeypatch.setattr(logging, "basicConfig", lambda **_: None)  # keep pytest's own handlers
    setup_logging()
    setup_logging()
    filters = [f for f in restore_uvicorn_access.filters if isinstance(f, AccessLogIdFilter)]
    assert len(filters) == 1
