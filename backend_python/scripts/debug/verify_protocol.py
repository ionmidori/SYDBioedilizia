import asyncio
import json
from src.utils.stream_protocol import (
    stream_text,
    stream_data,
    stream_status,
    to_ui_message_stream,
    TEXT_PART_ID,
)


async def verify_protocol():
    print("🧪 Testing AI SDK v6 UI Message Stream Protocol...")

    # Helpers now yield chunk DICTS (serialization happens in to_ui_message_stream)
    async for chunk in stream_text("Hello"):
        assert chunk == {"type": "text-delta", "id": TEXT_PART_ID, "delta": "Hello"}, f"Text failed: {chunk}"
        print("✅ text-delta: OK")

    async for chunk in stream_status("working"):
        assert chunk["type"] == "data-status" and chunk["transient"] is True, f"Status failed: {chunk}"
        print("✅ data-status (transient): OK")

    async for chunk in stream_data({"type": "interrupt", "payload": {}}):
        assert chunk["type"] == "data-event" and chunk["transient"] is True, f"Data failed: {chunk}"
        print("✅ data-event (transient): OK")

    # Full lifecycle as SSE
    async def src():
        async for c in stream_text("Ciao"):
            yield c

    sse = [c async for c in to_ui_message_stream(src())]
    assert sse[0] == 'data: {"type": "start"}\n\n', f"start failed: {sse[0]!r}"
    assert sse[-1] == "data: [DONE]\n\n", f"[DONE] failed: {sse[-1]!r}"
    types = [json.loads(s[6:].rstrip("\n"))["type"] for s in sse if not s.endswith("[DONE]\n\n")]
    assert types == ["start", "text-start", "text-delta", "text-end", "finish"], f"lifecycle failed: {types}"
    print("✅ SSE lifecycle (start → text → finish → [DONE]): OK")

    print("🎉 All Protocol Tests Passed")


if __name__ == "__main__":
    asyncio.run(verify_protocol())
