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

TARGET_UID = "eD2MWEyuIBU1s0VjYQApU0WPMOE3"

async def fix_ownership():
    try:
        db = get_async_firestore_client()
        logger.info(f"Fixing ownership for all sessions -> {TARGET_UID}")
        
        sessions_ref = db.collection('sessions')
        docs = sessions_ref.stream()
        
        count = 0
        batch = db.batch()
        
        async for doc in docs:
            # We can't batch too many in async easily with stream, but robust loop is fine
            # Let's just update one by one or small batches
            # Actually, just update directly
            await sessions_ref.document(doc.id).update({'userId': TARGET_UID})
            count += 1
            if count % 10 == 0:
                logger.info(f"Updated {count} sessions...")
                
        logger.info(f"✅ Complete. Updated {count} sessions.")
            
    except Exception as e:
        logger.error(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(fix_ownership())
