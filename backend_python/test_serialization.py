import asyncio
import json
from datetime import datetime
from src.db.projects import get_user_projects
from src.core.logger import setup_logging

async def test_serialization():
    setup_logging()
    user_id = "eD2MWEyuIBU1s0VjYQApU0WPMOE3"
    print(f"Testing serialization for user {user_id}...")
    
    try:
        projects = await get_user_projects(user_id)
        print(f"Retrieved {len(projects)} projects.")
        
        # This is what FastAPI does internally
        def json_serial(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            raise TypeError(f"Type {type(obj)} not serializable")

        json_data = json.dumps(projects, default=json_serial)
        print("Success! Data is JSON serializable.")
        # print(json_data[:200] + "...")
        
    except Exception as e:
        print(f"FAILED serialization: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_serialization())
