import sys
import os
import asyncio
import logging

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from src.db.firebase_client import init_firebase
from src.api.chat_history import MessageResponse

# Mock logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_firebase_init():
    print("--- Testing Firebase Init Idempotency ---")
    try:
        init_firebase()
        print("First init success")
        init_firebase()
        print("Second init success (Idempotent)")
    except Exception as e:
        print(f"FAILED: {e}")

async def test_pydantic_model():
    print("\n--- Testing MessageResponse Pydantic Model ---")
    try:
        # Simulate the problematic data from logs
        bad_content = [{'text': 'Perfetto! Ho ricevuto...'}]
        
        # Test 1: Direct instantiation (Should Fail if model expects str)
        try:
            m = MessageResponse(
                id="123", 
                role="user", 
                content=bad_content, # Passing list directly
                timestamp="2023-01-01"
            )
            print("Direct List Validation: PASSED (Unexpected if field is str)")
        except Exception as e:
             print(f"Direct List Validation: CAUGHT EXPECTED ERROR: {e}")

        # Test 2: Simulating the logic in chat_history.py
        import json
        content_val = bad_content
        if isinstance(content_val, list):
             content_val = json.dumps(content_val)
        
        m2 = MessageResponse(
            id="123", 
            role="user", 
            content=content_val, 
            timestamp="2023-01-01"
        )
        print(f"Sanitized Validation: PASSED. Content: {m2.content[:20]}...")

    except Exception as e:
        print(f"FAILED: {e}")

async def main():
    await test_firebase_init()
    await test_pydantic_model()

if __name__ == "__main__":
    asyncio.run(main())
