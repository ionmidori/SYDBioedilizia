import time
import functools
import logging
import asyncio
from typing import Callable, Any
from .context import get_request_id
from .logger import _redact

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
