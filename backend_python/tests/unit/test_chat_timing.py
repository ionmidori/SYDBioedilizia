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
