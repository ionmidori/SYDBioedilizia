import asyncio
from fastapi.responses import JSONResponse
from src.db.projects import get_user_projects
from src.core.logger import setup_logging
from pydantic import RootModel
from src.models.project import ProjectListItem
from typing import List

async def test_fastapi_serialization():
    setup_logging()
    user_id = "eD2MWEyuIBU1s0VjYQApU0WPMOE3"
    print(f"Testing FastAPI JSONResponse serialization for user {user_id}...")
    
    try:
        projects = await get_user_projects(user_id)
        print(f"Retrieved {len(projects)} projects.")
        
        # This simulates exactly what FastAPI does with response_model=List[ProjectListItem]
        # 1. Validate against model
        validated_projects = [ProjectListItem.model_validate(p) for p in projects]
        
        # 2. Convert to JSONResponse
        # FastAPI's JSONResponse uses a internal encoder. 
        # Here we just try to create it.
        response = JSONResponse(content=[p.model_dump() for p in validated_projects])
        print(f"Success! Status code: {response.status_code}")
        print(f"Body: {response.body.decode()[:100]}...")
        
    except Exception as e:
        print(f"FAILED serialization: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_fastapi_serialization())
