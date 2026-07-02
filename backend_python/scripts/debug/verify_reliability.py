import asyncio
import logging
import json
from src.core.schemas import APIErrorResponse
from src.core.exceptions import ResourceNotFound
from src.core.telemetry import trace_span
from src.utils.async_utils import run_blocking
from src.core.context import set_request_id, get_request_id

# 1. Test Exception Serialization
def test_exception_serialization():
    print("Test 1: Exception Serialization")
    try:
        raise ResourceNotFound("User not found", detail={"uid": "123"})
    except ResourceNotFound as e:
        model = APIErrorResponse(
            error_code=e.error_code,
            message=e.message,
            detail=e.detail,
            request_id="test-req-id"
        )
        json_out = model.model_dump_json()
        print(f"Serialized: {json_out}")
        assert "RESOURCE_NOT_FOUND" in json_out
        assert "123" in json_out
    print("✅ Passed")

# 2. Test Telemetry & Context
@trace_span(name="test_span")
async def traced_func():
    await asyncio.sleep(0.01)
    return "ok"

async def test_telemetry():
    print("Test 2: Telemetry & Context")
    set_request_id("REQ-XYZ")
    assert get_request_id() == "REQ-XYZ"
    
    # We can't easily assert logs capture here without complex patching, 
    # but we verify the decorator runs without error and preserves return
    res = await traced_func()
    assert res == "ok"
    print("✅ Passed")

# 3. Test Async Blocking Wrapper
def blocking_cpu_bound(n):
    import time
    time.sleep(0.1) # Simulate CPU work
    return n * n

async def test_blocking_wrapper():
    print("Test 3: Async Blocking Wrapper")
    res = await run_blocking(blocking_cpu_bound, 10)
    assert res == 100
    print("✅ Passed")

async def main():
    test_exception_serialization()
    await test_telemetry()
    await test_blocking_wrapper()

if __name__ == "__main__":
    asyncio.run(main())
