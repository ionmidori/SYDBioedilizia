"""
Unit Tests - Core Modules
==========================
Tests for modules at 0% coverage:
  - src/core/context.py
  - src/core/logger.py
  - src/core/telemetry.py
  - src/core/container.py
  - src/core/schemas.py
  - src/core/exceptions.py (supplement existing tests)
  - src/services/orchestrator_factory.py
"""

from __future__ import annotations

import json
import logging
import sys
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# 1. src/core/context.py
# ---------------------------------------------------------------------------

class TestContext:
    def test_get_request_id_returns_default(self):
        from src.core.context import _request_id_ctx_var, get_request_id
        token = _request_id_ctx_var.set("system")
        try:
            assert get_request_id() == "system"
        finally:
            _request_id_ctx_var.reset(token)

    def test_set_and_get_request_id(self):
        from src.core.context import get_request_id, set_request_id
        set_request_id("req-abc-123")
        assert get_request_id() == "req-abc-123"

    def test_get_session_id_returns_none_by_default(self):
        from src.core.context import _session_id_ctx_var, get_session_id
        token = _session_id_ctx_var.set(None)
        try:
            assert get_session_id() is None
        finally:
            _session_id_ctx_var.reset(token)

    def test_set_and_get_session_id(self):
        from src.core.context import get_session_id, set_session_id
        set_session_id("sess-xyz-789")
        assert get_session_id() == "sess-xyz-789"

    def test_get_user_id_returns_none_by_default(self):
        from src.core.context import _user_id_ctx_var, get_user_id
        token = _user_id_ctx_var.set(None)
        try:
            assert get_user_id() is None
        finally:
            _user_id_ctx_var.reset(token)

    def test_set_and_get_user_id(self):
        from src.core.context import get_user_id, set_user_id
        set_user_id("user-uid-001")
        assert get_user_id() == "user-uid-001"

    def test_multiple_context_vars_are_independent(self):
        from src.core.context import (
            get_request_id, get_session_id, get_user_id,
            set_request_id, set_session_id, set_user_id,
        )
        set_request_id("r1")
        set_session_id("s1")
        set_user_id("u1")
        assert get_request_id() == "r1"
        assert get_session_id() == "s1"
        assert get_user_id() == "u1"

    def test_overwriting_request_id(self):
        from src.core.context import get_request_id, set_request_id
        set_request_id("first-id")
        set_request_id("second-id")
        assert get_request_id() == "second-id"


# ---------------------------------------------------------------------------
# 2. src/core/logger.py
# ---------------------------------------------------------------------------

class TestRedact:
    def test_redacts_email(self):
        from src.core.logger import _redact
        result = _redact("Contact us at john.doe@example.com for support")
        assert "[EMAIL]" in result
        assert "john.doe@example.com" not in result

    def test_redacts_multiple_emails(self):
        from src.core.logger import _redact
        result = _redact("From: a@b.com To: c@d.org")
        assert result.count("[EMAIL]") == 2

    def test_redacts_phone_number(self):
        from src.core.logger import _redact
        result = _redact("Call me at +39 02 1234567")
        assert "[PHONE]" in result
        assert "+39 02 1234567" not in result

    def test_redacts_jwt_bearer_token(self):
        from src.core.logger import _redact
        token = "Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9.abc123"
        result = _redact(f"Authorization: {token}")
        assert "Bearer [TOKEN]" in result
        assert "eyJhbGciOiJSUzI1NiJ9" not in result

    def test_plain_text_unchanged(self):
        from src.core.logger import _redact
        text = "No PII here, just a regular message."
        assert _redact(text) == text

    def test_redacts_combined_pii(self):
        from src.core.logger import _redact
        text = "user@test.com called +1 555 123 4567 with token Bearer a.b.c"
        result = _redact(text)
        assert "[EMAIL]" in result
        assert "[PHONE]" in result


class TestJsonFormatter:
    def _make_record(self, msg, level=logging.INFO, **extras):
        record = logging.LogRecord(
            name="test.logger", level=level, pathname=__file__,
            lineno=1, msg=msg, args=(), exc_info=None,
        )
        for k, v in extras.items():
            setattr(record, k, v)
        return record

    def test_output_is_valid_json(self):
        from src.core.logger import JsonFormatter
        formatter = JsonFormatter(datefmt="%Y-%m-%d")
        data = json.loads(formatter.format(self._make_record("hello world")))
        assert isinstance(data, dict)

    def test_required_fields_present(self):
        from src.core.logger import JsonFormatter
        formatter = JsonFormatter(datefmt="%Y-%m-%d")
        data = json.loads(formatter.format(self._make_record("test")))
        for field in ("timestamp", "level", "logger", "message", "request_id", "session_id", "user_id"):
            assert field in data, f"Missing: {field}"

    def test_pii_redacted_in_message(self):
        from src.core.logger import JsonFormatter
        formatter = JsonFormatter(datefmt="%Y-%m-%d")
        data = json.loads(formatter.format(self._make_record("user pii@test.com sent a request")))
        assert "pii@test.com" not in data["message"]
        assert "[EMAIL]" in data["message"]

    def test_extra_fields_merged_into_output(self):
        from src.core.logger import JsonFormatter
        formatter = JsonFormatter(datefmt="%Y-%m-%d")
        data = json.loads(formatter.format(self._make_record("event", duration_ms=42.0, span="my_span")))
        assert data["duration_ms"] == 42.0
        assert data["span"] == "my_span"

    def test_session_id_falls_back_to_system_when_none(self):
        from src.core.context import _session_id_ctx_var
        from src.core.logger import JsonFormatter
        formatter = JsonFormatter(datefmt="%Y-%m-%d")
        token = _session_id_ctx_var.set(None)
        try:
            data = json.loads(formatter.format(self._make_record("hello")))
            assert data["session_id"] == "system"
        finally:
            _session_id_ctx_var.reset(token)

    def test_user_id_falls_back_to_anonymous_when_none(self):
        from src.core.context import _user_id_ctx_var
        from src.core.logger import JsonFormatter
        formatter = JsonFormatter(datefmt="%Y-%m-%d")
        token = _user_id_ctx_var.set(None)
        try:
            data = json.loads(formatter.format(self._make_record("hello")))
            assert data["user_id"] == "anonymous"
        finally:
            _user_id_ctx_var.reset(token)

    def test_exception_info_included_and_redacted(self):
        from src.core.logger import JsonFormatter
        formatter = JsonFormatter(datefmt="%Y-%m-%d")
        try:
            raise ValueError("boom pii@test.com")
        except ValueError:
            exc_info = sys.exc_info()
        record = self._make_record("error occurred", level=logging.ERROR)
        record.exc_info = exc_info
        data = json.loads(formatter.format(record))
        assert "exception" in data
        assert "pii@test.com" not in data["exception"]

    def test_stdlib_attrs_not_duplicated_in_output(self):
        from src.core.logger import JsonFormatter
        formatter = JsonFormatter(datefmt="%Y-%m-%d")
        data = json.loads(formatter.format(self._make_record("test")))
        for stdlib_attr in ("lineno", "module", "funcName", "levelno", "pathname"):
            assert stdlib_attr not in data, f"Stdlib attr leaked: {stdlib_attr}"


class TestGetLogger:
    def test_returns_logger_with_given_name(self):
        from src.core.logger import get_logger
        logger = get_logger("my.module")
        assert isinstance(logger, logging.Logger)
        assert logger.name == "my.module"

    def test_same_name_returns_same_instance(self):
        from src.core.logger import get_logger
        assert get_logger("shared.logger") is get_logger("shared.logger")


# ---------------------------------------------------------------------------
# 3. src/core/telemetry.py
# ---------------------------------------------------------------------------

class TestTraceSpanAsync:
    async def test_async_function_result_is_returned(self):
        from src.core.telemetry import trace_span

        @trace_span()
        async def add(x, y):
            return x + y

        assert await add(3, 4) == 7

    async def test_async_custom_span_name_used(self, caplog):
        from src.core.telemetry import trace_span

        @trace_span(name="custom_name")
        async def noop():
            return None

        with caplog.at_level(logging.INFO, logger="src.core.telemetry"):
            await noop()
        assert "custom_name" in caplog.text

    async def test_async_exception_is_reraised(self):
        from src.core.telemetry import trace_span

        @trace_span()
        async def explode():
            raise RuntimeError("test error")

        with pytest.raises(RuntimeError, match="test error"):
            await explode()

    async def test_async_exception_logged_as_error(self, caplog):
        from src.core.telemetry import trace_span

        @trace_span(name="failing_span")
        async def bad():
            raise ValueError("oops")

        with caplog.at_level(logging.ERROR, logger="src.core.telemetry"):
            with pytest.raises(ValueError):
                await bad()
        assert "failing_span" in caplog.text

    async def test_async_log_args_mode(self, caplog):
        from src.core.telemetry import trace_span

        @trace_span(log_args=True)
        async def greet(name):
            return f"Hello {name}"

        with caplog.at_level(logging.INFO, logger="src.core.telemetry"):
            result = await greet("Alice")
        assert result == "Hello Alice"
        # Verify span_args is in log record extra (not in text, but in record)
        assert any("Span End" in r.message for r in caplog.records)
        span_end_record = [r for r in caplog.records if "Span End" in r.message][0]
        assert hasattr(span_end_record, "span_args")

    async def test_async_span_end_logged_even_on_error(self, caplog):
        from src.core.telemetry import trace_span

        @trace_span()
        async def crash():
            raise Exception("crash")

        with caplog.at_level(logging.INFO, logger="src.core.telemetry"):
            with pytest.raises(Exception):
                await crash()
        assert "Span End" in caplog.text

    async def test_async_default_span_name_is_function_name(self, caplog):
        from src.core.telemetry import trace_span

        @trace_span()
        async def my_service_call():
            return "ok"

        with caplog.at_level(logging.INFO, logger="src.core.telemetry"):
            await my_service_call()
        assert "my_service_call" in caplog.text


class TestTraceSpanSync:
    def test_sync_function_result_is_returned(self):
        from src.core.telemetry import trace_span

        @trace_span()
        def multiply(x, y):
            return x * y

        assert multiply(3, 5) == 15

    def test_sync_exception_is_reraised(self):
        from src.core.telemetry import trace_span

        @trace_span()
        def boom():
            raise TypeError("sync boom")

        with pytest.raises(TypeError, match="sync boom"):
            boom()

    def test_sync_span_end_logged(self, caplog):
        from src.core.telemetry import trace_span

        @trace_span(name="sync_op")
        def do_work():
            return 42

        with caplog.at_level(logging.INFO, logger="src.core.telemetry"):
            do_work()
        assert "Span End" in caplog.text

    def test_sync_exception_logs_error(self, caplog):
        from src.core.telemetry import trace_span

        @trace_span(name="sync_fail")
        def fail():
            raise RuntimeError("sync failure")

        with caplog.at_level(logging.ERROR, logger="src.core.telemetry"):
            with pytest.raises(RuntimeError):
                fail()
        assert "sync_fail" in caplog.text

    def test_async_function_gets_async_wrapper(self):
        import asyncio
        from src.core.telemetry import trace_span

        @trace_span()
        async def async_fn():
            return 1

        assert asyncio.iscoroutinefunction(async_fn)

    def test_sync_function_gets_sync_wrapper(self):
        import asyncio
        from src.core.telemetry import trace_span

        @trace_span()
        def sync_fn():
            return 1

        assert not asyncio.iscoroutinefunction(sync_fn)

    def test_functools_wraps_preserves_metadata(self):
        from src.core.telemetry import trace_span

        @trace_span()
        def documented_function():
            """My docstring."""
            return 1

        assert documented_function.__name__ == "documented_function"
        assert documented_function.__doc__ == "My docstring."


# ---------------------------------------------------------------------------
# 4. src/core/container.py
# ---------------------------------------------------------------------------

class TestContainer:
    def test_get_instance_returns_container(self):
        from src.core.container import Container
        assert isinstance(Container.get_instance(), Container)

    def test_get_instance_is_singleton(self):
        from src.core.container import Container
        assert Container.get_instance() is Container.get_instance()

    def test_module_level_container_is_same_instance(self):
        from src.core.container import Container, container
        assert container is Container.get_instance()


# ---------------------------------------------------------------------------
# 5. src/core/schemas.py
# ---------------------------------------------------------------------------

class TestAPIErrorResponse:
    def test_valid_construction(self):
        from src.core.schemas import APIErrorResponse
        err = APIErrorResponse(error_code="AUTH_001", message="Token expired")
        assert err.error_code == "AUTH_001"
        assert err.message == "Token expired"

    def test_detail_defaults_to_none(self):
        from src.core.schemas import APIErrorResponse
        assert APIErrorResponse(error_code="X", message="Y").detail is None

    def test_detail_can_be_provided(self):
        from src.core.schemas import APIErrorResponse
        payload = {"field": "email", "reason": "invalid"}
        err = APIErrorResponse(error_code="VAL_001", message="Validation error", detail=payload)
        assert err.detail == payload

    def test_request_id_populated(self):
        from src.core.schemas import APIErrorResponse
        err = APIErrorResponse(error_code="E", message="M")
        assert isinstance(err.request_id, str) and len(err.request_id) > 0

    def test_request_id_reflects_context(self):
        from src.core.context import set_request_id
        from src.core.schemas import APIErrorResponse
        set_request_id("ctx-req-999")
        err = APIErrorResponse(error_code="E", message="M")
        assert err.request_id == "ctx-req-999"

    def test_model_serialises_to_dict(self):
        from src.core.schemas import APIErrorResponse
        d = APIErrorResponse(
            error_code="SRV_001", message="Service unavailable", detail={"retry_after": 30}
        ).model_dump()
        for key in ("error_code", "message", "detail", "request_id"):
            assert key in d


# ---------------------------------------------------------------------------
# 6. src/services/orchestrator_factory.py
# ---------------------------------------------------------------------------

class TestOrchestratorFactory:
    def _reset_singleton(self):
        import src.services.orchestrator_factory as mod
        mod._orchestrator = None

    @patch("src.services.orchestrator_factory.ADKOrchestrator")
    def test_get_orchestrator_returns_adk_orchestrator(self, MockADK):
        self._reset_singleton()
        mock_instance = MagicMock()
        MockADK.return_value = mock_instance
        from src.services.orchestrator_factory import get_orchestrator
        result = get_orchestrator()
        assert result is mock_instance
        MockADK.assert_called_once()

    @patch("src.services.orchestrator_factory.ADKOrchestrator")
    def test_get_orchestrator_is_singleton(self, MockADK):
        self._reset_singleton()
        mock_instance = MagicMock()
        MockADK.return_value = mock_instance
        from src.services.orchestrator_factory import get_orchestrator
        first = get_orchestrator()
        second = get_orchestrator()
        assert first is second
        MockADK.assert_called_once()

    @patch("src.services.orchestrator_factory.ADKOrchestrator")
    def test_reset_and_recreate_singleton(self, MockADK):
        import src.services.orchestrator_factory as mod
        self._reset_singleton()
        instance_a = MagicMock(name="instance_a")
        instance_b = MagicMock(name="instance_b")
        MockADK.side_effect = [instance_a, instance_b]
        from src.services.orchestrator_factory import get_orchestrator
        first = get_orchestrator()
        mod._orchestrator = None
        second = get_orchestrator()
        assert first is instance_a
        assert second is instance_b
        assert MockADK.call_count == 2
