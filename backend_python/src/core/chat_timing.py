"""
Per-turn latency instrumentation for `/chat/stream`.

One `TurnTiming` object lives in a ContextVar for the duration of a chat turn.
The object itself is mutable and shared: tasks spawned by Starlette's
StreamingResponse and by the ADK runner copy the context, so they all see (and
write into) the same instance.

At the end of the turn a single structured log line `chat_turn_timing` is
emitted, with every phase expressed in milliseconds from request arrival:

    queued_ms        request arrival -> route handler (includes the wait for
                     the ADK warm-up on a cold instance)
    session_ms       ensure_session (Firestore, before the stream starts)
    first_text_ms    first text-delta sent to the client (real TTFT)
    total_ms         last chunk sent
    llm_calls        per model call: agent, model, duration, tokens
    guardrail_ms     time spent in Model Armor scans
    persist_ms       time spent persisting messages inside the stream

These fields land in `jsonPayload` on Cloud Logging, so log-based metrics and
dashboards can be built on them directly.
"""
from __future__ import annotations

import logging
import time
from contextvars import ContextVar
from dataclasses import dataclass, field

from opentelemetry import trace
from opentelemetry.trace import Span

from src.core.tracing import get_tracer

logger = logging.getLogger(__name__)

_tracer = get_tracer("syd.chat")

# Process-level cold start tracking: the first turn served by this instance
# is flagged so cold and warm latency can be separated in dashboards.
_PROCESS_START = time.perf_counter()
_first_turn_served = False


@dataclass
class LlmCallTiming:
    agent: str
    model: str
    started: float
    span: Span | None = None
    first_chunk_ms: float | None = None
    duration_ms: float | None = None
    guardrail_in_ms: float = 0.0
    prompt_tokens: int | None = None
    cached_tokens: int | None = None
    thoughts_tokens: int | None = None
    output_tokens: int | None = None

    def as_log(self) -> dict[str, str | int | float | None]:
        model_ms = None
        if self.duration_ms is not None:
            model_ms = round(self.duration_ms - self.guardrail_in_ms, 1)
        return {
            "agent": self.agent,
            "model": self.model,
            "duration_ms": self.duration_ms,
            "model_ms": model_ms,
            "first_chunk_ms": self.first_chunk_ms,
            "prompt_tokens": self.prompt_tokens,
            "cached_tokens": self.cached_tokens,
            "thoughts_tokens": self.thoughts_tokens,
            "output_tokens": self.output_tokens,
        }


@dataclass
class TurnTiming:
    session_id: str
    arrival: float
    cold_start: bool
    uptime_ms: float
    marks: dict[str, float] = field(default_factory=dict)
    llm_calls: list[LlmCallTiming] = field(default_factory=list)
    _open_llm_calls: dict[str, LlmCallTiming] = field(default_factory=dict)
    guardrail_ms: float = 0.0
    persist_ms: float = 0.0
    emitted: bool = False

    def elapsed_ms(self, since: float | None = None) -> float:
        return round((time.perf_counter() - (since if since is not None else self.arrival)) * 1000, 1)

    def mark(self, name: str, *, once: bool = True) -> None:
        """Record `name` at the current time (ms from arrival)."""
        if once and name in self.marks:
            return
        self.marks[name] = self.elapsed_ms()

    # ── LLM calls ────────────────────────────────────────────────────────────
    def llm_started(self, key: str, agent: str, model: str) -> None:
        span = _tracer.start_span(f"llm/{agent}", kind=trace.SpanKind.CLIENT)
        span.set_attribute("llm.agent", agent)
        span.set_attribute("llm.model", model)
        self._open_llm_calls[key] = LlmCallTiming(
            agent=agent, model=model, started=time.perf_counter(), span=span
        )

    def llm_chunk(self, key: str) -> None:
        call = self._open_llm_calls.get(key)
        if call is not None and call.first_chunk_ms is None:
            call.first_chunk_ms = self.elapsed_ms(call.started)

    def llm_finished(
        self,
        key: str,
        *,
        prompt_tokens: int | None = None,
        cached_tokens: int | None = None,
        thoughts_tokens: int | None = None,
        output_tokens: int | None = None,
    ) -> None:
        call = self._open_llm_calls.pop(key, None)
        if call is None:
            return
        call.duration_ms = self.elapsed_ms(call.started)
        call.prompt_tokens = prompt_tokens
        call.cached_tokens = cached_tokens
        call.thoughts_tokens = thoughts_tokens
        call.output_tokens = output_tokens
        if call.span is not None:
            for attr, value in call.as_log().items():
                if value is not None:
                    call.span.set_attribute(f"llm.{attr}", value)
            call.span.end()
            call.span = None
        self.llm_calls.append(call)

    # ── Guardrails / persistence ─────────────────────────────────────────────
    def add_guardrail(self, key: str | None, phase: str, ms: float) -> None:
        self.guardrail_ms += ms
        if phase == "input" and key is not None:
            call = self._open_llm_calls.get(key)
            if call is not None:
                call.guardrail_in_ms += ms

    def add_persist(self, ms: float) -> None:
        self.persist_ms += ms

    # ── Emission ─────────────────────────────────────────────────────────────
    def emit(self, *, outcome: str = "ok") -> None:
        if self.emitted:
            return
        self.emitted = True
        # Close spans of calls that never finished (client disconnect, error).
        for call in self._open_llm_calls.values():
            if call.span is not None:
                call.span.end()
        total_ms = self.marks.get("finish", self.elapsed_ms())
        logger.info(
            "chat_turn_timing",
            extra={
                "event": "chat_turn_timing",
                "outcome": outcome,
                "cold_start": self.cold_start,
                "uptime_ms": self.uptime_ms,
                "queued_ms": self.marks.get("handler"),
                "session_ms": self.marks.get("session_ready"),
                "ttfb_ms": self.marks.get("first_chunk"),
                "first_text_ms": self.marks.get("first_text"),
                "total_ms": total_ms,
                "n_llm_calls": len(self.llm_calls),
                "llm_total_ms": round(sum(c.duration_ms or 0 for c in self.llm_calls), 1),
                "llm_calls": [c.as_log() for c in self.llm_calls],
                "guardrail_ms": round(self.guardrail_ms, 1),
                "persist_ms": round(self.persist_ms, 1),
                "marks": self.marks,
            },
        )


_current_turn: ContextVar[TurnTiming | None] = ContextVar("chat_turn_timing", default=None)


def start_turn(session_id: str, arrival: float | None = None) -> TurnTiming:
    """Create the timing object for this turn and bind it to the context."""
    global _first_turn_served
    cold = not _first_turn_served
    _first_turn_served = True
    start = arrival if arrival is not None else time.perf_counter()
    turn = TurnTiming(
        session_id=session_id,
        arrival=start,
        cold_start=cold,
        uptime_ms=round((start - _PROCESS_START) * 1000, 1),
    )
    _current_turn.set(turn)
    return turn


def current_turn() -> TurnTiming | None:
    return _current_turn.get()
