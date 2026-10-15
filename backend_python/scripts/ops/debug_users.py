from pathlib import Path
import asyncio
import logging
import sys
import os

# Make `src` importable from any cwd: this file lives in backend_python/scripts/ops/.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.db.firebase_client import get_async_firestore_client
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def list_users():
    try:
        db = get_async_firestore_client()
        logger.info("Listing users...")
        users = db.collection('users').stream()
        async for user in users:
            logger.info(f"User Found: {user.id} => {user.to_dict()}")
            
    except Exception as e:
        logger.error(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(list_users())
