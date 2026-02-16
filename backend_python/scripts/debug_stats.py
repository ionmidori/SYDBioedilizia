
import asyncio
import sys
import os

# Add project root to path
sys.path.append(os.getcwd())

from src.db.projects import get_user_projects
from src.core.config import settings
from src.db.firebase_client import get_async_firestore_client

# Dummy user ID (replace with real one if needed, but query should run)
USER_ID = "test_user_id"

async def main():
    print(f"Testing get_user_projects for user: {USER_ID}")
    try:
        # Initialize DB (if needed explicitly, though client handles it)
        db = get_async_firestore_client()
        print("DB Client initialized")
        
        projects = await get_user_projects(USER_ID)
        print(f"Success! Found {len(projects)} projects.")
        for p in projects:
            print(f" - {p.title} ({p.status})")
            
    except Exception as e:
        print(f"ERROR CAUGHT IN MAIN: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
