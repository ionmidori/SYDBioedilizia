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

async def list_all_files():
    try:
        db = get_async_firestore_client()
        logger.info("Listing all documents in 'files' collection groups...")
        
        # collection_group query
        files = db.collection_group('files').stream()
        
        count = 0
        async for file in files:
            d = file.to_dict()
            parent_path = file.reference.parent.parent.path if file.reference.parent.parent else "Unknown"
            logger.info(f"File: {d.get('name')} | Type: {repr(d.get('type'))} | Project: {parent_path}")
            count += 1
            
        logger.info(f"Total files found: {count}")
            
    except Exception as e:
        logger.error(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(list_all_files())
