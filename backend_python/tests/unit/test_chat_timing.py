"""
Unit tests for the per-turn latency instrumentation:
- src/core/chat_timing.py   (TurnTiming, start_turn/current_turn, emission)
- src/adk/latency_plugin.py (model call timing via ADK plugin callbacks)
"""
import asyncio
import logging
import time
from types import SimpleNamespace

import pytest
from src.adk import latency_plugin
from src.adk.latency_plugin import LatencyPlugin, llm_call_key
from src.core import chat_timing
from src.core.chat_timing import current_turn, start_turn


def _ctx(agent: str = "syd_orchestrator", invocation: str = "inv-1"):
    return SimpleNamespace(agent_name=agent, invocation_id=invocation)


def _response(partial: bool = False, usage=None):
    return SimpleNamespace(partial=partial, usage_metadata=usage)


@pytest.fixture(autouse=True)
def _fresh_turn_context():
    # Each test runs with no bound turn and a warm process.
    token = chat_timing._current_turn.set(None)
    chat_timing._first_turn_served = True
    yield
    chat_timing._current_turn.reset(token)


def test_first_turn_of_the_process_is_flagged_cold():
    chat_timing._first_turn_served = False
    assert start_turn("s1").cold_start is True
    assert start_turn("s2").cold_start is False


def test_marks_are_relative_to_arrival_and_recorded_once():
    turn = start_turn("s1", arrival=time.perf_counter() - 0.5)
    turn.mark("handler")
    first = turn.marks["handler"]
    assert first >= 500
    turn.mark("handler")
    assert turn.marks["handler"] == first


def test_turn_is_shared_with_child_tasks():
    async def child():
        current_turn().mark("from_child")

    async def run():
        turn = start_turn("s1")
        await asyncio.create_task(child())
        return turn

    turn = asyncio.run(run())
    assert "from_child" in turn.marks


async def test_plugin_records_model_call_with_tokens():
    turn = start_turn("s1")
    plugin = LatencyPlugin()
    ctx = _ctx()
    await plugin.before_model_callback(
        callback_context=ctx, llm_request=SimpleNamespace(model="model-x")
    )
    turn.add_guardrail(llm_call_key(ctx), "input", 12.0)
    await plugin.after_model_callback(callback_context=ctx, llm_response=_response(partial=True))
    usage = SimpleNamespace(
        prompt_token_count=1000,
        cached_content_token_count=800,
        thoughts_token_count=40,
        candidates_token_count=25,
    )
    await plugin.after_model_callback(callback_context=ctx, llm_response=_response(usage=usage))

    assert len(turn.llm_calls) == 1
    call = turn.llm_calls[0].as_log()
    assert call["agent"] == "syd_orchestrator"
    assert call["model"] == "model-x"
    assert call["prompt_tokens"] == 1000
    assert call["cached_tokens"] == 800
    assert call["thoughts_tokens"] == 40
    assert call["output_tokens"] == 25
    assert call["first_chunk_ms"] is not None
    assert call["model_ms"] == pytest.approx(call["duration_ms"] - 12.0, abs=0.2)
    assert turn.guardrail_ms == 12.0


async def test_plugin_is_inert_without_a_turn():
    plugin = LatencyPlugin()
    ctx = _ctx()
    assert await plugin.before_model_callback(
        callback_context=ctx, llm_request=SimpleNamespace(model="m")
    ) is None
    assert await plugin.after_model_callback(callback_context=ctx, llm_response=_response()) is None


def test_emit_logs_one_structured_line(caplog):
    turn = start_turn("s1")
    turn.mark("handler")
    turn.mark("first_text")
    turn.add_persist(30.0)
    turn.llm_started("k", agent="quote", model="m")  # never finished (disconnect)
    with caplog.at_level(logging.INFO, logger=chat_timing.__name__):
        turn.mark("finish")
        turn.emit(outcome="client_disconnected")
        turn.emit()  # idempotent

    records = [r for r in caplog.records if r.getMessage() == "chat_turn_timing"]
    assert len(records) == 1
    rec = records[0]
    assert rec.outcome == "client_disconnected"
    assert rec.first_text_ms is not None
    assert rec.total_ms == turn.marks["finish"]
    assert rec.persist_ms == 30.0
    assert rec.n_llm_calls == 0


def test_guardrail_scan_is_attributed_to_the_open_model_call():
    turn = start_turn("s1")
    ctx = _ctx(agent="quote")
    turn.llm_started(llm_call_key(ctx), agent="quote", model="m")
    turn.add_guardrail(llm_call_key(ctx), "input", 5.0)
    turn.add_guardrail(llm_call_key(ctx), "output", 7.0)
    turn.llm_finished(llm_call_key(ctx))
    assert turn.guardrail_ms == 12.0
    assert turn.llm_calls[0].guardrail_in_ms == 5.0


def test_call_key_distinguishes_agents_of_the_same_invocation():
    assert latency_plugin.llm_call_key(_ctx("a")) != latency_plugin.llm_call_key(_ctx("b"))


def test_pricing_estimates_vertex_gemini_costs():
    from src.core.pricing import estimate_llm_cost_usd

    # gemini-2.5-flash: 1000 prompt (800 cached -> 200 uncached @ $0.30/1M, 800 cached @ $0.03/1M),
    # 100 thoughts + 200 output = 300 @ $2.50/1M
    cost_flash = estimate_llm_cost_usd(
        "gemini-2.5-flash",
        prompt_tokens=1000,
        cached_tokens=800,
        thoughts_tokens=100,
        output_tokens=200,
    )
    expected = (200 * 0.30 + 800 * 0.03 + 300 * 2.50) / 1_000_000
    assert cost_flash == pytest.approx(expected, abs=1e-6)

    # gemini-2.5-flash-lite should be cheaper than flash
    cost_lite = estimate_llm_cost_usd(
        "gemini-2.5-flash-lite",
        prompt_tokens=1000,
        cached_tokens=0,
        thoughts_tokens=0,
        output_tokens=200,
    )
    assert cost_lite == pytest.approx((1000 * 0.10 + 200 * 0.40) / 1_000_000, abs=1e-6)

    # Missing usage returns 0.0 safely
    assert estimate_llm_cost_usd("gemini-2.5-flash", prompt_tokens=None, cached_tokens=None, thoughts_tokens=None, output_tokens=None) == 0.0

    # Resource path containing "projects/" must not false-positive as "pro" tier
    cost_unknown_path = estimate_llm_cost_usd(
        "projects/123/locations/eu/publishers/google/models/unknown-model",
        prompt_tokens=1000,
        cached_tokens=2000,  # clamped to prompt_tokens
        thoughts_tokens=-5,  # clamped to 0
        output_tokens=0,
    )
    # Default tier (flash): 1000 cached @ $0.03/1M
    assert cost_unknown_path == pytest.approx((1000 * 0.03) / 1_000_000, abs=1e-6)

    # Pro tier uses pro rates
    cost_pro = estimate_llm_cost_usd(
        "gemini-2.5-pro",
        prompt_tokens=1000,
        cached_tokens=0,
        thoughts_tokens=0,
        output_tokens=100,
    )
    assert cost_pro == pytest.approx((1000 * 1.25 + 100 * 10.00) / 1_000_000, abs=1e-6)


def test_emit_aggregates_tokens_cost_cache_agent_and_emits_llm_call_timing(caplog):
    turn = start_turn("s-agg")
    with caplog.at_level(logging.INFO, logger=chat_timing.__name__):
        turn.llm_started("k1", agent="syd_orchestrator", model="gemini-2.5-flash-lite")
        turn.llm_finished("k1", prompt_tokens=1000, cached_tokens=500, thoughts_tokens=0, output_tokens=50)
        turn.llm_started("k2", agent="quote_agent", model="gemini-2.5-flash")
        turn.llm_finished("k2", prompt_tokens=3000, cached_tokens=1500, thoughts_tokens=200, output_tokens=400)
        turn.add_tool("pricing_engine", 145.5, status="ok")
        turn.emit(outcome="ok")

    llm_records = [r for r in caplog.records if r.getMessage() == "llm_call_timing"]
    assert len(llm_records) == 2
    assert llm_records[0].agent == "syd_orchestrator"
    assert llm_records[0].model == "gemini-2.5-flash-lite"
    assert llm_records[1].agent == "quote_agent"
    assert llm_records[1].estimated_cost_usd > 0

    turn_records = [r for r in caplog.records if r.getMessage() == "chat_turn_timing"]
    assert len(turn_records) == 1
    rec = turn_records[0]
    assert rec.prompt_tokens_total == 4000
    assert rec.cached_tokens_total == 2000
    assert rec.thoughts_tokens_total == 200
    assert rec.output_tokens_total == 450
    assert rec.cache_hit_ratio == pytest.approx(0.5, abs=1e-4)
    assert rec.estimated_cost_usd > 0
    assert rec.primary_agent == "quote_agent"
    assert rec.n_tool_calls == 1
    assert rec.tool_total_ms == pytest.approx(145.5, abs=0.1)
    assert rec.tool_names == ["pricing_engine"]
    assert rec.tool_calls == [{"name": "pricing_engine", "duration_ms": 145.5, "status": "ok"}]


async def test_instrumented_tool_records_duration_in_active_turn():
    from src.core.telemetry import instrumented_tool

    @instrumented_tool("demo_tool")
    async def _tool() -> str:
        return "ok"

    @instrumented_tool("failing_tool")
    async def _bad_tool() -> str:
        raise RuntimeError("boom")

    @instrumented_tool("sync_tool")
    def _sync_tool() -> str:
        return "sync"

    turn = start_turn("s-tool")
    assert await _tool() == "ok"
    assert _sync_tool() == "sync"
    with pytest.raises(RuntimeError, match="boom"):
        await _bad_tool()

    assert [t.name for t in turn.tool_calls] == ["demo_tool", "sync_tool", "failing_tool"]
    assert [t.status for t in turn.tool_calls] == ["ok", "ok", "error"]
    assert turn.tool_total_ms >= 0.0


def test_turn_timing_outcome_override_wins_over_default_ok(caplog):
    turn = start_turn("sess-timeout")
    turn.set_outcome("timeout")
    with caplog.at_level(logging.INFO, logger=chat_timing.__name__):
        turn.emit(outcome="ok")
    records = [r for r in caplog.records if r.getMessage() == "chat_turn_timing"]
    assert len(records) == 1
    assert records[0].outcome == "timeout"


def test_turn_timing_explicit_error_wins_over_override(caplog):
    turn = start_turn("sess-err")
    turn.set_outcome("timeout")
    with caplog.at_level(logging.INFO, logger=chat_timing.__name__):
        turn.emit(outcome="client_disconnected")
    records = [r for r in caplog.records if r.getMessage() == "chat_turn_timing"]
    assert len(records) == 1
    assert records[0].outcome == "client_disconnected"
