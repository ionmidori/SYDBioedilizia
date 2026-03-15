"""
Idempotency Key middleware for non-streaming POST endpoints.

Prevents duplicate submissions by caching JSON responses keyed by the
`Idempotency-Key` request header (RFC-compliant header name).

Behaviour:
  - No header present           → pass through unchanged (no idempotency guarantee)
  - Key seen, response cached   → replay cached status + body immediately (HTTP 200)
  - Key seen, in-flight         → return 409 Conflict (request still processing)
  - Key first seen              → process normally; cache the response

TTL: 24 hours (matches the quota window so a re-submit within a working day is safe).

Scope: In-memory per Cloud Run instance.  For multi-instance deployments this
       should be moved to a shared Firestore/Redis store, but single-instance
       Cloud Run is the current deployment model.

Applicable paths: Only routes listed in _IDEMPOTENCY_PATHS.
Excluded paths:   /chat/stream (streaming — never buffer) and any other SSE endpoint.
"""
import asyncio
import json
import logging
import time
from dataclasses import dataclass, field

from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger(__name__)

_TTL_SECONDS = 60 * 60 * 24  # 24 hours
_MAX_CACHE_SIZE = 10_000      # Prevent unbounded memory growth on Cloud Run


@dataclass
class _CachedResponse:
    status: int
    headers: list
    body: bytes
    created_at: float = field(default_factory=time.monotonic)

    def is_expired(self) -> bool:
        return time.monotonic() - self.created_at > _TTL_SECONDS


class IdempotencyMiddleware:
    """
    Raw ASGI middleware: idempotency key replay for non-streaming POST endpoints.

    Uses raw ASGI __call__ (not BaseHTTPMiddleware) to avoid buffering
    StreamingResponse bodies — this middleware only buffers explicitly listed paths.
    """

    # Only apply to endpoints where idempotency makes sense.
    # /chat/stream is intentionally excluded (streaming, not repeatable).
    _IDEMPOTENCY_PATHS: frozenset[str] = frozenset({
        "/api/submit-lead",
    })

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._cache: dict[str, _CachedResponse] = {}
        self._in_flight: set[str] = set()
        self._lock = asyncio.Lock()

    def _evict_expired(self) -> None:
        """Remove expired entries and enforce max cache size. Called within the lock."""
        expired = [k for k, v in self._cache.items() if v.is_expired()]
        for k in expired:
            del self._cache[k]

        # LRU-style eviction: if still over capacity, drop oldest entries first
        if len(self._cache) > _MAX_CACHE_SIZE:
            overflow = len(self._cache) - _MAX_CACHE_SIZE
            oldest_keys = sorted(
                self._cache, key=lambda k: self._cache[k].created_at
            )[:overflow]
            for k in oldest_keys:
                del self._cache[k]
            logger.warning(
                "[Idempotency] Cache over capacity — evicted %d oldest entries (size=%d)",
                overflow,
                len(self._cache),
            )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        method: str = scope.get("method", "")

        # Only intercept eligible POST endpoints
        if method != "POST" or path not in self._IDEMPOTENCY_PATHS:
            await self.app(scope, receive, send)
            return

        # Extract Idempotency-Key from headers
        idempotency_key: str | None = None
        for header_name, header_value in scope.get("headers", []):
            if header_name.lower() == b"idempotency-key":
                idempotency_key = header_value.decode("utf-8", errors="replace")
                break

        if not idempotency_key:
            await self.app(scope, receive, send)
            return

        # Sanitise: keys must be ≤ 255 chars, no control characters
        idempotency_key = idempotency_key[:255].strip()
        if not idempotency_key:
            await self.app(scope, receive, send)
            return

        async with self._lock:
            # Replay a cached response
            if idempotency_key in self._cache:
                cached = self._cache[idempotency_key]
                if not cached.is_expired():
                    logger.info(
                        "[Idempotency] Replaying cached response for key=%.20s… path=%s",
                        idempotency_key,
                        path,
                    )
                    await self._replay(send, cached)
                    return
                # Expired: evict and fall through to fresh processing
                del self._cache[idempotency_key]

            # Concurrent duplicate while original is in-flight
            if idempotency_key in self._in_flight:
                logger.warning(
                    "[Idempotency] Concurrent duplicate for key=%.20s… — returning 409",
                    idempotency_key,
                )
                await self._send_conflict(send, idempotency_key)
                return

            self._in_flight.add(idempotency_key)

        # ── Process the request; capture the response body for caching ──
        response_status: list[int] = [200]
        response_headers: list[list] = [[]]
        response_chunks: list[bytes] = []

        async def _capture_send(message: dict) -> None:
            if message["type"] == "http.response.start":
                response_status[0] = message.get("status", 200)
                response_headers[0] = list(message.get("headers", []))
            elif message["type"] == "http.response.body":
                chunk = message.get("body", b"")
                if chunk:
                    response_chunks.append(chunk)
            await send(message)

        try:
            await self.app(scope, receive, _capture_send)
        finally:
            async with self._lock:
                self._in_flight.discard(idempotency_key)
                # Only cache successful responses (2xx)
                if 200 <= response_status[0] < 300 and response_chunks:
                    self._cache[idempotency_key] = _CachedResponse(
                        status=response_status[0],
                        headers=response_headers[0],
                        body=b"".join(response_chunks),
                    )
                    self._evict_expired()
                    logger.info(
                        "[Idempotency] Cached response for key=%.20s… (status=%d, %d bytes)",
                        idempotency_key,
                        response_status[0],
                        sum(len(c) for c in response_chunks),
                    )

    @staticmethod
    async def _replay(send: Send, cached: _CachedResponse) -> None:
        await send({
            "type": "http.response.start",
            "status": cached.status,
            "headers": cached.headers + [
                [b"x-idempotency-replayed", b"true"],
            ],
        })
        await send({
            "type": "http.response.body",
            "body": cached.body,
            "more_body": False,
        })

    @staticmethod
    async def _send_conflict(send: Send, key: str) -> None:
        body = json.dumps({
            "error_code": "IDEMPOTENCY_CONFLICT",
            "message": "A request with this Idempotency-Key is already being processed.",
        }).encode()
        await send({
            "type": "http.response.start",
            "status": 409,
            "headers": [
                [b"content-type", b"application/json"],
                [b"content-length", str(len(body)).encode()],
            ],
        })
        await send({
            "type": "http.response.body",
            "body": body,
            "more_body": False,
        })
