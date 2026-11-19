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

from src.core.pricing import estimate_llm_cost_usd
from src.core.tracing import get_tracer

logger = logging.getLogger(__name__)

_tracer = get_tracer("syd.chat")

# Process-level cold start tracking: the first turn served by this instance
# is flagged so cold and warm latency can be separated in dashboards.
_PROCESS_START = time.perf_counter()
_first_turn_served = False


@dataclass
class ToolCallTiming:
    name: str
    duration_ms: float
    status: str = "ok"

    def as_log(self) -> dict[str, str | float]:
        return {
            "name": self.name,
            "duration_ms": round(self.duration_ms, 1),
            "status": self.status,
        }


def _span_trace_id(span: Span | None) -> str | None:
    if span is None:
        return None
    ctx = span.get_span_context()
    if ctx is None or not ctx.is_valid or ctx.trace_id == 0:
        return None
    return f"{ctx.trace_id:032x}"


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
    estimated_cost_usd: float = 0.0
    trace_id: str | None = None

    def as_log(self) -> dict[str, str | int | float | None]:
        model_ms = None
        if self.duration_ms is not None:
            model_ms = round(self.duration_ms - self.guardrail_in_ms, 1)
        prompt = max(0, self.prompt_tokens or 0)
        cached = min(prompt, max(0, self.cached_tokens or 0))
        cache_hit_ratio = round(cached / prompt, 4) if prompt > 0 else 0.0
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
            "cache_hit_ratio": cache_hit_ratio,
            "estimated_cost_usd": self.estimated_cost_usd,
        }


@dataclass
class TurnTiming:
    session_id: str
    arrival: float
    cold_start: bool
    uptime_ms: float
    marks: dict[str, float] = field(default_factory=dict)
    llm_calls: list[LlmCallTiming] = field(default_factory=list)
    tool_calls: list[ToolCallTiming] = field(default_factory=list)
    _open_llm_calls: dict[str, LlmCallTiming] = field(default_factory=dict)
    guardrail_ms: float = 0.0
    persist_ms: float = 0.0
    tool_total_ms: float = 0.0
    trace_id: str | None = None
    outcome_override: str | None = None
    emitted: bool = False

    def set_outcome(self, outcome: str) -> None:
        """Record an internal outcome (e.g. 'timeout') when stream closes without raising."""
        self.outcome_override = outcome

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

    def llm_chunk(
        self,
        key: str,
        *,
        prompt_tokens: int | None = None,
        cached_tokens: int | None = None,
        thoughts_tokens: int | None = None,
        output_tokens: int | None = None,
    ) -> None:
        call = self._open_llm_calls.get(key)
        if call is None:
            return
        if call.first_chunk_ms is None:
            call.first_chunk_ms = self.elapsed_ms(call.started)
        if prompt_tokens is not None:
            call.prompt_tokens = prompt_tokens
        if cached_tokens is not None:
            call.cached_tokens = cached_tokens
        if thoughts_tokens is not None:
            call.thoughts_tokens = thoughts_tokens
        if output_tokens is not None:
            call.output_tokens = output_tokens

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
        if prompt_tokens is not None:
            call.prompt_tokens = prompt_tokens
        if cached_tokens is not None:
            call.cached_tokens = cached_tokens
        if thoughts_tokens is not None:
            call.thoughts_tokens = thoughts_tokens
        if output_tokens is not None:
            call.output_tokens = output_tokens
        call.estimated_cost_usd = estimate_llm_cost_usd(
            call.model,
            prompt_tokens=call.prompt_tokens,
            cached_tokens=call.cached_tokens,
            thoughts_tokens=call.thoughts_tokens,
            output_tokens=call.output_tokens,
        )
        call.trace_id = _span_trace_id(call.span) or _span_trace_id(trace.get_current_span())
        if self.trace_id is None and call.trace_id is not None:
            self.trace_id = call.trace_id
        log_payload = call.as_log()
        if call.span is not None:
            for attr, value in log_payload.items():
                if value is not None:
                    call.span.set_attribute(f"llm.{attr}", value)
            call.span.end()
            call.span = None
        self.llm_calls.append(call)
        logger.info(
            "llm_call_timing",
            extra={
                "event": "llm_call_timing",
                "trace_id": call.trace_id,
                **log_payload,
            },
        )

    # ── Guardrails / persistence / tools ─────────────────────────────────────
    def add_guardrail(self, key: str | None, phase: str, ms: float) -> None:
        self.guardrail_ms += ms
        if phase == "input" and key is not None:
            call = self._open_llm_calls.get(key)
            if call is not None:
                call.guardrail_in_ms += ms

    def add_persist(self, ms: float) -> None:
        self.persist_ms += ms

    def add_tool(self, name: str, duration_ms: float, *, status: str = "ok") -> None:
        self.tool_total_ms += duration_ms
        rounded_ms = round(duration_ms, 1)
        self.tool_calls.append(ToolCallTiming(name=name, duration_ms=duration_ms, status=status))
        trace_id = self.trace_id or _span_trace_id(trace.get_current_span())
        if self.trace_id is None and trace_id is not None:
            self.trace_id = trace_id
        logger.info(
            "tool_call_timing",
            extra={
                "event": "tool_call_timing",
                "trace_id": trace_id,
                "tool_name": name,
                "duration_ms": rounded_ms,
                "status": status,
            },
        )

    def _primary_agent(self) -> str:
        if not self.llm_calls:
            return "none"
        for call in reversed(self.llm_calls):
            if call.agent != "syd_orchestrator":
                return call.agent
        return self.llm_calls[-1].agent

    # ── Emission ─────────────────────────────────────────────────────────────
    def emit(self, *, outcome: str = "ok") -> None:
        if self.emitted:
            return
        self.emitted = True
        # Close spans of calls that never finished (client disconnect, error).
        for call in self._open_llm_calls.values():
            if call.span is not None:
                call.span.end()
        if self.trace_id is None:
            self.trace_id = _span_trace_id(trace.get_current_span())
        total_ms = self.marks.get("finish", self.elapsed_ms())
        prompt_total = sum(max(0, c.prompt_tokens or 0) for c in self.llm_calls)
        cached_total = min(prompt_total, sum(max(0, c.cached_tokens or 0) for c in self.llm_calls))
        thoughts_total = sum(max(0, c.thoughts_tokens or 0) for c in self.llm_calls)
        output_total = sum(max(0, c.output_tokens or 0) for c in self.llm_calls)
        cache_hit_ratio = min(1.0, round(cached_total / prompt_total, 4)) if prompt_total > 0 else 0.0
        estimated_cost_usd = round(sum(c.estimated_cost_usd for c in self.llm_calls), 6)
        effective_outcome = outcome if outcome != "ok" else (self.outcome_override or "ok")
        logger.info(
            "chat_turn_timing",
            extra={
                "event": "chat_turn_timing",
                "trace_id": self.trace_id,
                "outcome": effective_outcome,
                "cold_start": self.cold_start,
                "uptime_ms": self.uptime_ms,
                "queued_ms": self.marks.get("handler"),
                "session_ms": self.marks.get("session_ready"),
                "ttfb_ms": self.marks.get("first_chunk"),
                "first_text_ms": self.marks.get("first_text"),
                "total_ms": total_ms,
                "n_llm_calls": len(self.llm_calls),
                "llm_total_ms": round(sum(c.duration_ms or 0 for c in self.llm_calls), 1),
                "primary_agent": self._primary_agent(),
                "prompt_tokens_total": prompt_total,
                "cached_tokens_total": cached_total,
                "thoughts_tokens_total": thoughts_total,
                "output_tokens_total": output_total,
                "cache_hit_ratio": cache_hit_ratio,
                "estimated_cost_usd": estimated_cost_usd,
                "n_tool_calls": len(self.tool_calls),
                "has_tools": bool(self.tool_calls),
                "tool_error_count": sum(1 for t in self.tool_calls if t.status != "ok"),
                "tool_total_ms": round(self.tool_total_ms, 1),
                "tool_names": [t.name for t in self.tool_calls],
                "tool_calls": [t.as_log() for t in self.tool_calls],
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
