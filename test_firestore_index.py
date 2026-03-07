
import asyncio
import os
import logging
from src.db.firebase_client import get_async_firestore_client
from google.cloud.firestore_v1 import FieldFilter

logging.basicConfig(level=logging.INFO)

async def test_query():
    user_id = "eD2MWEyuIBU1s0VjYQApU0WPMOE3" # From previous logs
    try:
        db = get_async_firestore_client()
        print(f"Testing query for user: {user_id}")
        query = (
            db.collection("sessions")
            .where(filter=FieldFilter("userId", "==", user_id))
            .order_by("updatedAt", direction="DESCENDING")
            .limit(5)
        )
        
        docs = query.stream()
        count = 0
        async for doc in docs:
            count += 1
            print(f"Found doc: {doc.id}")
        
        print(f"Total docs found: {count}")
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_query())
