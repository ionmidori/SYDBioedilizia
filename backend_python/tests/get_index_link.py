import sys
import os
import asyncio
import logging

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from src.db.projects import get_user_projects
from src.db.firebase_client import init_firebase, get_async_firestore_client

# Mock logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def trigger_index_error():
    print("--- Triggering Firestore Index Usage ---")
    try:
        init_firebase()
        # Use a dummy user ID that likely won't return results but will trigger the query plan
        # We need a user ID that definitely has <some> projects or just the query plan check?
        # Actually, query plan check happens even with no results if the index is missing.
        user_id = "DOES_NOT_EXIST" 
        
        print(f"Querying projects for user: {user_id}")
        projects = await get_user_projects(user_id)
        print(f"Success? Retrieved {len(projects)} projects (Unexpected if index missing)")
    except Exception as e:
        print(f"\nCaught Expected Error:\n{e}")
        if "The query requires an index" in str(e):
             print("\n✅ SUCCESS: Index Missing Error Caught.")
             # Extract link if possible or just rely on the print
             import re
             link = re.search(r'(https://console\.firebase\.google\.com[^\s]*)', str(e))
             if link:
                 print(f"\n🔗 CREATE INDEX LINK:\n{link.group(0)}\n")

if __name__ == "__main__":
    asyncio.run(trigger_index_error())
