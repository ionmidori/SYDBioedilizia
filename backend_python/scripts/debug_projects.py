import asyncio
import os
import sys

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.db.projects import get_user_projects
from src.core.config import settings

async def main():
    print(f"Using Project ID: {settings.PROJECT_ID}")
    try:
        # Use a dummy user ID or one that likely exists
        user_id = "test_user_Id_123" 
        print(f"Attempting to fetch projects for user: {user_id}")
        
        projects = await get_user_projects(user_id)
        
        print(f"Successfully retrieved {len(projects)} projects.")
        for p in projects:
            print(f" - {p.title} ({p.session_id})")
            
    except Exception as e:
        print(f"\nCRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
