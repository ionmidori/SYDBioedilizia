"""The middleware stack order is part of the API contract (see main.py,
"Middleware stack"). add_middleware() is LIFO, so a single call moved or added
in the wrong place silently changes which responses get a request id, security
headers or the JSON error envelope. ``app.user_middleware`` lists the layers
outermost first.
"""
from __future__ import annotations

from fastapi.middleware.cors import CORSMiddleware
from main import (
    AppCheckMiddleware,
    GlobalErrorCatcherMiddleware,
    RequestIDMiddleware,
    app,
)
from src.middleware.idempotency import IdempotencyMiddleware
from src.middleware.metrics import MetricsMiddleware
from src.middleware.security_headers import SecurityHeadersMiddleware

EXPECTED_OUTERMOST_FIRST = [
    RequestIDMiddleware,
    SecurityHeadersMiddleware,
    CORSMiddleware,
    GlobalErrorCatcherMiddleware,
    AppCheckMiddleware,
    IdempotencyMiddleware,
    MetricsMiddleware,
]


def test_middleware_stack_order() -> None:
    actual = [m.cls for m in app.user_middleware]
    assert actual == EXPECTED_OUTERMOST_FIRST
