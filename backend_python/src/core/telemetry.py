import time
import functools
import logging
import asyncio
from typing import Callable, Any
from .context import get_request_id, get_session_id, get_user_id
from .logger import _redact
from .tracing import get_tracer

from opentelemetry import trace
from opentelemetry.trace import StatusCode

logger = logging.getLogger(__name__)

def trace_span(name: str = None, log_args: bool = False):
    """
    Decorator to trace function execution time and errors.
    
    Args:
        name: Override function name in logs.
        log_args: If True, log arguments (WARNING: Potential PII leak). Default False.
    """
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            span_name = name or func.__name__
            req_id = get_request_id()
            start_time = time.perf_counter()
            
            try:
                # Log Start (Debug only)
                logger.debug(f"Span Start: {span_name}", extra={"request_id": req_id})
                
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                duration = (time.perf_counter() - start_time) * 1000
                logger.error(f"Span Error: {span_name}", extra={
                    "request_id": req_id,
                    "duration_ms": duration,
                    "error": str(e)
                })
                raise e
            finally:
                duration = (time.perf_counter() - start_time) * 1000
                log_data = {
                    "event": "trace_span",
                    "span": span_name,
                    "request_id": req_id,
                    "duration_ms": round(duration, 2)
                }
                if log_args:
                    log_data["span_args"] = _redact(str(args)[:500])
                    log_data["span_kwargs"] = _redact(str(kwargs)[:500])

                logger.info(f"Span End: {span_name} ({round(duration, 2)}ms)", extra=log_data)

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            # Same logic for sync functions
            span_name = name or func.__name__
            req_id = get_request_id()
            start_time = time.perf_counter()
            try:
                return func(*args, **kwargs)
            except Exception as e:
                duration = (time.perf_counter() - start_time) * 1000
                logger.error(f"Span Error: {span_name} - {e}", extra={"request_id": req_id, "duration_ms": duration})
                raise e
            finally:
                duration = (time.perf_counter() - start_time) * 1000
                logger.info(f"Span End: {span_name}", extra={
                    "request_id": req_id,
                    "duration_ms": round(duration, 2),
                    "span": span_name
                })

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    return decorator


def instrumented_tool(tool_name: str | None = None):
    """
    Decorator for ADK tool functions.

    Creates an OpenTelemetry span with tool-specific attributes:
      - tool.name, tool.session_id, tool.user_id
      - tool.duration_ms, tool.error (on failure)
      - Sets OTel span status to ERROR on exception

    Also emits structured log lines (dual-write) so existing log-based
    dashboards continue to work alongside Cloud Trace.

    Usage:
        @instrumented_tool()
        async def generate_render(session_id: str, prompt: str, ...):
            ...

        @instrumented_tool("pricing_engine")
        async def pricing_engine_tool(session_id: str, ...):
            ...
    """
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        name = tool_name or func.__name__
        tracer = get_tracer("syd.adk.tools")

        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            req_id = get_request_id()
            session_id = kwargs.get("session_id") or get_session_id() or "unknown"
            user_id = get_user_id() or "unknown"
            start = time.perf_counter()

            with tracer.start_as_current_span(
                f"tool/{name}",
                kind=trace.SpanKind.INTERNAL,
            ) as span:
                span.set_attribute("tool.name", name)
                span.set_attribute("tool.session_id", session_id)
                span.set_attribute("tool.user_id", user_id)
                span.set_attribute("request.id", req_id)

                try:
                    result = await func(*args, **kwargs)
                    duration_ms = round((time.perf_counter() - start) * 1000, 2)
                    span.set_attribute("tool.duration_ms", duration_ms)
                    span.set_status(StatusCode.OK)

                    logger.info(
                        f"[Tool] {name} completed in {duration_ms}ms",
                        extra={
                            "event": "tool_call",
                            "tool_name": name,
                            "session_id": session_id,
                            "duration_ms": duration_ms,
                            "request_id": req_id,
                            "status": "ok",
                        },
                    )
                    return result

                except Exception as exc:
                    duration_ms = round((time.perf_counter() - start) * 1000, 2)
                    span.set_attribute("tool.duration_ms", duration_ms)
                    span.set_attribute("tool.error", str(exc)[:500])
                    span.set_status(StatusCode.ERROR, str(exc)[:200])
                    span.record_exception(exc)

                    logger.error(
                        f"[Tool] {name} failed after {duration_ms}ms: {exc}",
                        extra={
                            "event": "tool_call",
                            "tool_name": name,
                            "session_id": session_id,
                            "duration_ms": duration_ms,
                            "request_id": req_id,
                            "status": "error",
                            "error": str(exc)[:500],
                        },
                    )
                    raise

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            req_id = get_request_id()
            session_id = kwargs.get("session_id") or get_session_id() or "unknown"
            start = time.perf_counter()

            with tracer.start_as_current_span(
                f"tool/{name}",
                kind=trace.SpanKind.INTERNAL,
            ) as span:
                span.set_attribute("tool.name", name)
                span.set_attribute("tool.session_id", session_id)
                span.set_attribute("request.id", req_id)

                try:
                    result = func(*args, **kwargs)
                    duration_ms = round((time.perf_counter() - start) * 1000, 2)
                    span.set_attribute("tool.duration_ms", duration_ms)
                    span.set_status(StatusCode.OK)

                    logger.info(
                        f"[Tool] {name} completed in {duration_ms}ms",
                        extra={
                            "event": "tool_call",
                            "tool_name": name,
                            "session_id": session_id,
                            "duration_ms": duration_ms,
                            "request_id": req_id,
                            "status": "ok",
                        },
                    )
                    return result

                except Exception as exc:
                    duration_ms = round((time.perf_counter() - start) * 1000, 2)
                    span.set_attribute("tool.error", str(exc)[:500])
                    span.set_status(StatusCode.ERROR, str(exc)[:200])
                    span.record_exception(exc)

                    logger.error(
                        f"[Tool] {name} failed after {duration_ms}ms: {exc}",
                        extra={
                            "event": "tool_call",
                            "tool_name": name,
                            "session_id": session_id,
                            "duration_ms": duration_ms,
                            "request_id": req_id,
                            "status": "error",
                            "error": str(exc)[:500],
                        },
                    )
                    raise

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    return decorator
