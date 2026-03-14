"""
Unit Tests - Services & Utils (Coverage Boost)
================================================
Tests for low-coverage modules:
  - src/services/intent_classifier.py (0%)
  - src/utils/stream_protocol.py (56%)
"""

from __future__ import annotations

import json
import pytest


# ---------------------------------------------------------------------------
# 1. src/services/intent_classifier.py
# ---------------------------------------------------------------------------

class TestIntentClassifier:
    async def test_empty_messages_returns_reasoning(self):
        from src.services.intent_classifier import IntentClassifier
        assert await IntentClassifier.classify_intent([]) == "reasoning"

    async def test_non_user_role_returns_reasoning(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "assistant", "content": "hello"}])
        assert result == "reasoning"

    async def test_greeting_ciao_returns_execution(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": "ciao"}])
        assert result == "execution"

    async def test_greeting_hello_returns_execution(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": "hello"}])
        assert result == "execution"

    async def test_greeting_buongiorno_returns_execution(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": "buongiorno"}])
        assert result == "execution"

    async def test_greeting_buonasera_returns_execution(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": "buonasera"}])
        assert result == "execution"

    async def test_greeting_hi_returns_execution(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": "hi"}])
        assert result == "execution"

    async def test_greeting_case_insensitive(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": "CIAO!"}])
        assert result == "execution"

    async def test_long_message_returns_reasoning(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([
            {"role": "user", "content": "I want to renovate my bathroom and kitchen please"}
        ])
        assert result == "reasoning"

    async def test_multimodal_list_content_returns_reasoning(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([
            {"role": "user", "content": [{"type": "text", "text": "hello"}]}
        ])
        assert result == "reasoning"

    async def test_object_style_message(self):
        from src.services.intent_classifier import IntentClassifier

        class Msg:
            role = "user"
            content = "ciao"

        result = await IntentClassifier.classify_intent([Msg()])
        assert result == "execution"

    async def test_only_inspects_last_message(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([
            {"role": "user", "content": "I want a full renovation of my apartment"},
            {"role": "user", "content": "ciao"},
        ])
        assert result == "execution"

    async def test_non_greeting_short_message_returns_reasoning(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": "prezzo?"}])
        assert result == "reasoning"

    async def test_empty_string_content_returns_reasoning(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([{"role": "user", "content": ""}])
        assert result == "reasoning"

    async def test_multimodal_list_with_string_parts(self):
        from src.services.intent_classifier import IntentClassifier
        result = await IntentClassifier.classify_intent([
            {"role": "user", "content": ["hello", "there"]}
        ])
        # list content → reasoning (complexity check)
        assert result == "reasoning"


# ---------------------------------------------------------------------------
# 2. src/utils/stream_protocol.py
# ---------------------------------------------------------------------------

class TestStreamText:
    async def test_yields_text_chunk(self):
        from src.utils.stream_protocol import stream_text
        chunks = [c async for c in stream_text("hello")]
        assert len(chunks) == 1
        assert chunks[0] == '0:"hello"\n'

    async def test_empty_text_yields_nothing(self):
        from src.utils.stream_protocol import stream_text
        chunks = [c async for c in stream_text("")]
        assert len(chunks) == 0

    async def test_special_chars_escaped(self):
        from src.utils.stream_protocol import stream_text
        chunks = [c async for c in stream_text('he said "hi"')]
        assert len(chunks) == 1
        assert '\\"' in chunks[0]


class TestStreamData:
    async def test_dict_data(self):
        from src.utils.stream_protocol import stream_data
        chunks = [c async for c in stream_data({"key": "value"})]
        assert len(chunks) == 1
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed == [{"key": "value"}]

    async def test_string_data(self):
        from src.utils.stream_protocol import stream_data
        chunks = [c async for c in stream_data("hello")]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed == ["hello"]

    async def test_int_data(self):
        from src.utils.stream_protocol import stream_data
        chunks = [c async for c in stream_data(42)]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed == [42]

    async def test_bool_data(self):
        from src.utils.stream_protocol import stream_data
        chunks = [c async for c in stream_data(True)]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed == [True]

    async def test_list_data(self):
        from src.utils.stream_protocol import stream_data
        chunks = [c async for c in stream_data([1, 2, 3])]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed == [[1, 2, 3]]


class TestStreamError:
    async def test_error_format(self):
        from src.utils.stream_protocol import stream_error
        chunks = [c async for c in stream_error("something went wrong")]
        assert chunks[0] == '3:"something went wrong"\n'

    async def test_error_with_quotes(self):
        from src.utils.stream_protocol import stream_error
        chunks = [c async for c in stream_error('error "quote"')]
        assert '\\"' in chunks[0]


class TestStreamToolCall:
    async def test_tool_call_format(self):
        from src.utils.stream_protocol import stream_tool_call
        chunks = [c async for c in stream_tool_call("tc-1", "analyze_room", {"url": "test"})]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed[0]["toolCallId"] == "tc-1"
        assert parsed[0]["toolName"] == "analyze_room"
        assert parsed[0]["args"] == {"url": "test"}

    async def test_tool_call_empty_args(self):
        from src.utils.stream_protocol import stream_tool_call
        chunks = [c async for c in stream_tool_call("tc-2", "health_check", {})]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed[0]["args"] == {}


class TestStreamToolResult:
    async def test_tool_result_format(self):
        from src.utils.stream_protocol import stream_tool_result
        chunks = [c async for c in stream_tool_result("tc-1", {"status": "ok"})]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed[0]["toolCallId"] == "tc-1"
        assert parsed[0]["result"] == {"status": "ok"}

    async def test_tool_result_string(self):
        from src.utils.stream_protocol import stream_tool_result
        chunks = [c async for c in stream_tool_result("tc-2", "success")]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed[0]["result"] == "success"

    async def test_tool_result_none(self):
        from src.utils.stream_protocol import stream_tool_result
        chunks = [c async for c in stream_tool_result("tc-3", None)]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed[0]["result"] is None


class TestStreamStatus:
    async def test_status_format(self):
        from src.utils.stream_protocol import stream_status
        chunks = [c async for c in stream_status("Processing...")]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed == [{"type": "status", "message": "Processing..."}]


class TestStreamReasoning:
    async def test_reasoning_format(self):
        from src.utils.stream_protocol import stream_reasoning
        chunks = [c async for c in stream_reasoning({"analysis": "testing"})]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed == [{"type": "reasoning", "data": {"analysis": "testing"}}]

    async def test_sensitive_tool_redacted_submit_lead(self):
        from src.utils.stream_protocol import stream_reasoning
        data = {"tool_name": "submit_lead", "tool_args": {"email": "pii@test.com"}}
        chunks = [c async for c in stream_reasoning(data)]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed[0]["data"]["tool_args"] == {"REDACTED": "*** PII HIDDEN ***"}

    async def test_sensitive_tool_redacted_store_user_data(self):
        from src.utils.stream_protocol import stream_reasoning
        data = {"tool_name": "store_user_data", "tool_args": {"name": "John"}}
        chunks = [c async for c in stream_reasoning(data)]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed[0]["data"]["tool_args"] == {"REDACTED": "*** PII HIDDEN ***"}

    async def test_sensitive_tool_redacted_update_profile(self):
        from src.utils.stream_protocol import stream_reasoning
        data = {"tool_name": "update_profile", "tool_args": {"phone": "+39123"}}
        chunks = [c async for c in stream_reasoning(data)]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed[0]["data"]["tool_args"] == {"REDACTED": "*** PII HIDDEN ***"}

    async def test_safe_tool_not_redacted(self):
        from src.utils.stream_protocol import stream_reasoning
        data = {"tool_name": "analyze_room", "tool_args": {"url": "test.jpg"}}
        chunks = [c async for c in stream_reasoning(data)]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed[0]["data"]["tool_args"] == {"url": "test.jpg"}

    async def test_original_dict_not_mutated(self):
        from src.utils.stream_protocol import stream_reasoning
        original = {"tool_name": "submit_lead", "tool_args": {"email": "pii@test.com"}}
        original_copy = original.copy()
        _ = [c async for c in stream_reasoning(original)]
        assert original["tool_args"] == original_copy["tool_args"]

    async def test_no_tool_name_key(self):
        from src.utils.stream_protocol import stream_reasoning
        data = {"analysis": "No tool involved"}
        chunks = [c async for c in stream_reasoning(data)]
        parsed = json.loads(chunks[0][2:].rstrip("\n"))
        assert parsed[0]["data"]["analysis"] == "No tool involved"
