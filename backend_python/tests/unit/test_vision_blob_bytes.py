"""Regression test for the base64-vs-raw-bytes vision bug.

Four vision pipelines (analyze / architect / web_architect / cad_engine, since removed) built a
base64 *string* and passed it to ``genai_types.Blob(data=...)``, whose ``data``
field expects **raw bytes** — the genai SDK base64-encodes it for the wire. A
base64 str therefore double-encoded, so the Gemini model received corrupted
image data. The working references (``measure_room.py``, ``adk_orchestrator.py``)
pass raw ``image_bytes``.

This test drives ``analyze.analyze_room_structure`` with a mocked genai client and asserts the ``Blob.data``
handed to ``generate_content`` is the **raw bytes**, not a base64 string.
"""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.vision import analyze


@pytest.mark.asyncio
async def test_analyze_sends_raw_bytes_to_blob():
    image_bytes = b"\x89PNG\r\n\x1a\n raw-image-bytes-not-base64"

    fake_response = MagicMock()
    fake_response.text = json.dumps({
        "room_type": "kitchen",
        "approximate_size_sqm": 12,
        "architectural_features": [],
        "flooring_type": "tiles",
        "wall_color": "white",
        "ceiling_type": "flat",
    })
    generate_content = AsyncMock(return_value=fake_response)
    fake_client = MagicMock()
    fake_client.aio.models.generate_content = generate_content

    with patch.object(analyze, "get_genai_client", return_value=fake_client):
        await analyze.analyze_room_structure(image_bytes)

    contents = generate_content.call_args.kwargs["contents"]
    blob = contents[0].parts[1].inline_data
    # The exact raw bytes must reach the Blob — NOT base64.b64encode(...).decode().
    assert isinstance(blob.data, bytes)
    assert blob.data == image_bytes
