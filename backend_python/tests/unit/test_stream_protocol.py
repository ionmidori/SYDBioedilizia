"""
Tests for the AI SDK v6 UI message stream wrapper.

Focus: the `start` lifecycle frame must be able to carry a stable `messageId`
so the client adopts the backend-assigned id (eliminating the post-turn id
swap that caused message re-mount flicker).
"""
import json

import pytest

from src.utils.stream_protocol import to_ui_message_stream, stream_text


async def _empty_source():
    # An async generator that yields nothing (valid empty turn).
    if False:  # pragma: no cover
        yield {}


async def _text_source(text: str):
    async for chunk in stream_text(text):
        yield chunk


def _parse_frames(frames):
    """Turn raw `data: {...}\n\n` SSE frames into parsed chunk dicts."""
    parsed = []
    for f in frames:
        line = f.strip()
        if line.startswith("data: "):
            payload = line[len("data: "):]
            if payload != "[DONE]":
                parsed.append(json.loads(payload))
    return parsed


@pytest.mark.asyncio
async def test_start_frame_carries_message_id_when_provided():
    frames = [f async for f in to_ui_message_stream(_empty_source(), message_id="assist-123")]
    chunks = _parse_frames(frames)

    start = chunks[0]
    assert start["type"] == "start"
    assert start["messageId"] == "assist-123"


@pytest.mark.asyncio
async def test_start_frame_omits_message_id_when_absent():
    frames = [f async for f in to_ui_message_stream(_empty_source())]
    chunks = _parse_frames(frames)

    start = chunks[0]
    assert start["type"] == "start"
    assert "messageId" not in start


@pytest.mark.asyncio
async def test_text_turn_still_brackets_and_finishes_with_message_id():
    frames = [f async for f in to_ui_message_stream(_text_source("Ciao"), message_id="m9")]
    types = [c["type"] for c in _parse_frames(frames)]

    assert types[0] == "start"
    assert "text-start" in types and "text-delta" in types and "text-end" in types
    assert types[-1] == "finish"
