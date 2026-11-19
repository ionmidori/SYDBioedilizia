"""Unit tests for LatencyPlugin streaming usage aggregation."""
from types import SimpleNamespace

import pytest
from src.adk.latency_plugin import LatencyPlugin
from src.core import chat_timing
from src.core.chat_timing import start_turn


@pytest.fixture(autouse=True)
def _fresh_turn():
    token = chat_timing._current_turn.set(None)
    chat_timing._first_turn_served = True
    yield
    chat_timing._current_turn.reset(token)


async def test_latency_plugin_preserves_thoughts_tokens_from_partial_chunk():
    turn = start_turn("s-thoughts")
    plugin = LatencyPlugin()
    ctx = SimpleNamespace(agent_name="quote", invocation_id="inv-thoughts")

    await plugin.before_model_callback(
        callback_context=ctx,
        llm_request=SimpleNamespace(model="gemini-3.8-flash"),
    )
    partial_usage = SimpleNamespace(
        prompt_token_count=10000,
        cached_content_token_count=4000,
        thoughts_token_count=420,
        candidates_token_count=10,
    )
    await plugin.after_model_callback(
        callback_context=ctx,
        llm_response=SimpleNamespace(partial=True, usage_metadata=partial_usage),
    )
    final_usage = SimpleNamespace(
        prompt_token_count=10000,
        cached_content_token_count=4000,
        thoughts_token_count=None,
        candidates_token_count=80,
    )
    await plugin.after_model_callback(
        callback_context=ctx,
        llm_response=SimpleNamespace(partial=False, usage_metadata=final_usage),
    )

    assert len(turn.llm_calls) == 1
    call = turn.llm_calls[0]
    assert call.thoughts_tokens == 420
    assert call.output_tokens == 80
    assert call.estimated_cost_usd > 0
