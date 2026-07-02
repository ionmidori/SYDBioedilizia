from src.core.schemas import APIErrorResponse
from src.core.context import set_request_id

def test_error_response():
    print("Testing APIErrorResponse instantiation...")
    try:
        # Test default factory
        resp = APIErrorResponse(
            error_code="TEST_ERROR",
            message="Test message"
        )
        print(f"Success! Model: {resp.model_dump()}")
        
        # Test with explicit request_id
        set_request_id("test-req-123")
        resp2 = APIErrorResponse(
            error_code="TEST_ERROR",
            message="Test message"
        )
        print(f"Success with request_id! Model: {resp2.model_dump()}")
        
    except Exception as e:
        print(f"FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_error_response()
