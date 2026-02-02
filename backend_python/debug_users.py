import asyncio
import logging
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
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
