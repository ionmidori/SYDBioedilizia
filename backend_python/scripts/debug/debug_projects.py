import asyncio
import os
import sys

# Add src to path
sys.path.append(os.getcwd())

from src.db.firebase_client import get_async_firestore_client
from google.cloud.firestore_v1 import FieldFilter

async def main():
    db = get_async_firestore_client()
    
    print("Fetching last 5 sessions...")
    try:
        # Get last 10 sessions where userId is not null (streaming manually to filter)
        docs = db.collection("sessions").order_by("createdAt", direction="DESCENDING").limit(20).stream()
        
        count = 0
        async for doc in docs:
            data = doc.to_dict()
            if data.get('userId'):
                print(f"\nID: {doc.id}")
                print(f"Title: {data.get('title')}")
                print(f"User ID: {data.get('userId')}")
                print(f"Status: {data.get('status')}")
                print("-" * 30)
                count += 1
        
        if count == 0:
            print("No projects with userId found.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
