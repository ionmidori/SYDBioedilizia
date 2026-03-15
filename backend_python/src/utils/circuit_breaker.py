"""
Asyncio-native circuit breaker for external service calls.

Prevents cascading failures when Vertex AI or Firestore degrades.

State machine:
  CLOSED  →  (fail_max consecutive failures)  →  OPEN
  OPEN    →  (reset_timeout seconds elapsed)   →  HALF_OPEN
  HALF_OPEN → (probe succeeds)                 →  CLOSED
  HALF_OPEN → (probe fails)                    →  OPEN

Usage:
    from src.utils.circuit_breaker import vertex_ai_breaker, CircuitOpenError

    if not await vertex_ai_breaker.before_call():
        raise CircuitOpenError("vertex_ai")
    try:
        result = await do_vertex_ai_work()
        await vertex_ai_breaker.on_success()
    except Exception as exc:
        await vertex_ai_breaker.on_failure(exc)
        raise
"""
import asyncio
import logging
import time
from enum import Enum

logger = logging.getLogger(__name__)


class _State(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """
    Asyncio-native circuit breaker.

    Thread-safe via asyncio.Lock (single-event-loop, Cloud Run model).
    Compatible with both coroutines and async generators.
    """

    def __init__(self, name: str, fail_max: int = 5, reset_timeout: float = 60.0):
        self.name = name
        self.fail_max = fail_max
        self.reset_timeout = reset_timeout
        self._failures = 0
        self._state = _State.CLOSED
        self._opened_at: float | None = None
        self._lock = asyncio.Lock()

    @property
    def state(self) -> _State:
        """Current state, accounting for elapsed reset timeout."""
        if self._state == _State.OPEN and self._opened_at is not None:
            if time.monotonic() - self._opened_at >= self.reset_timeout:
                return _State.HALF_OPEN
        return self._state

    @property
    def fail_count(self) -> int:
        return self._failures

    async def before_call(self) -> bool:
        """
        Returns True if the call is allowed to proceed.
        Returns False if the circuit is OPEN (caller should serve degraded response).
        Logs transition to HALF_OPEN so observability picks it up.
        """
        async with self._lock:
            s = self.state
            if s == _State.OPEN:
                logger.warning(
                    "[CircuitBreaker:%s] OPEN — rejecting call (%d/%d failures, opened %.0fs ago)",
                    self.name,
                    self._failures,
                    self.fail_max,
                    time.monotonic() - (self._opened_at or time.monotonic()),
                )
                return False
            if s == _State.HALF_OPEN:
                logger.info("[CircuitBreaker:%s] HALF_OPEN — allowing probe", self.name)
            return True

    async def on_success(self) -> None:
        """Record a successful call. Resets the breaker to CLOSED."""
        async with self._lock:
            prev = self._state
            self._failures = 0
            self._state = _State.CLOSED
            self._opened_at = None
            if prev != _State.CLOSED:
                logger.info(
                    "[CircuitBreaker:%s] Probe succeeded — state CLOSED", self.name
                )

    async def on_failure(self, exc: Exception) -> None:
        """Record a failed call. Opens the breaker after fail_max consecutive failures."""
        async with self._lock:
            self._failures += 1
            should_open = (
                self._failures >= self.fail_max or self._state == _State.HALF_OPEN
            )
            if should_open:
                self._state = _State.OPEN
                self._opened_at = time.monotonic()
                logger.error(
                    "[CircuitBreaker:%s] OPENED after %d failures (reset in %.0fs). "
                    "Last error: %s: %s",
                    self.name,
                    self._failures,
                    self.reset_timeout,
                    type(exc).__name__,
                    exc,
                )
            else:
                logger.warning(
                    "[CircuitBreaker:%s] Failure %d/%d: %s: %s",
                    self.name,
                    self._failures,
                    self.fail_max,
                    type(exc).__name__,
                    exc,
                )


class CircuitOpenError(Exception):
    """Raised when a call is attempted against an open circuit."""

    def __init__(self, name: str):
        super().__init__(
            f"Circuit '{name}' is OPEN — service temporarily unavailable"
        )
        self.circuit_name = name


# ── Singletons ────────────────────────────────────────────────────────────────

vertex_ai_breaker = CircuitBreaker(
    name="vertex_ai",
    fail_max=5,          # Open after 5 consecutive Vertex AI failures
    reset_timeout=60.0,  # Allow probe after 60 seconds
)

firestore_breaker = CircuitBreaker(
    name="firestore",
    fail_max=10,         # Firestore is more resilient — tolerate more failures
    reset_timeout=30.0,  # Shorter probe window
)
