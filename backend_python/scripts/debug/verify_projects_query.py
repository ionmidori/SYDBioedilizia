import asyncio
import uuid
import logging
import sys
import os

# Add src to path
sys.path.append(os.getcwd())

from src.db.projects import get_user_projects

# Configure logging
logging.basicConfig(level=logging.INFO)

async def main():
    user_id = str(uuid.uuid4())
    print(f"Testing get_user_projects for user_id: {user_id}")
    try:
        projects = await get_user_projects(user_id)
        print(f"Success! Retrieved {len(projects)} projects.")
    except Exception as e:
        print(f"Failed: {e}")
        # Check if it's the specific index error
        if "The query requires an index" in str(e):
            print("Index missing or not yet ready.")
            sys.exit(1)
        else:
            print("Unexpected error.")
            sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
