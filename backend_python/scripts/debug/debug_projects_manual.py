
import asyncio
import os
import sys

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), "src"))

from src.db.projects import get_user_projects
from src.models.project import ProjectStatus

# Mock firebase client if needed, or just rely on real one checking credentials
# ensure environment variables are loaded
from dotenv import load_dotenv
load_dotenv()

async def main():
    user_id = "eD2MWEyuIBU1s0VjYQApU0WPMOE3" # From logs
    print(f"Fetching projects for {user_id}...")
    try:
        projects = await get_user_projects(user_id)
        print(f"Success. Found {len(projects)} projects.")
        for p in projects:
            print(f"- {p.title} ({p.status})")
    except Exception as e:
        print(f"CRASHED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
