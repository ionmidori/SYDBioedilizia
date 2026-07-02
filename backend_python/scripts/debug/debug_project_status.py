import asyncio
import logging
import sys
import os
from datetime import datetime

# Add parent directory to path to allow imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.db.firebase_client import get_async_firestore_client
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def analyze_projects():
    try:
        db = get_async_firestore_client()
        logger.info(f"Analyzing all projects...")
        
        projects_ref = db.collection('projects')   # Note: in code it uses 'sessions' sometimes? 
        # In projects.py: PROJECTS_COLLECTION = "sessions"
        # Wait, let's check projects.py to be sure which collection is used.
        # But in useDashboardStats.ts it uses 'projects'.
        # If projects.py uses 'sessions', and frontend uses 'projects', that's a HUGE mismatch.
        # Let's check projects.py again.
        
        # Checking collection name...
        # If I can't check projects.py right now, I'll check both.
        
        logger.info("--- Checking 'projects' collection ---")
        docs = projects_ref.stream()
        count_projects = 0
        async for doc in docs:
            d = doc.to_dict()
            logger.info(f"ID: {doc.id} | Name: {d.get('name')} | Status: {d.get('status')} | Created: {d.get('createdAt')}")
            count_projects += 1
        logger.info(f"Total in 'projects': {count_projects}")

        logger.info("--- Checking 'sessions' collection ---")
        sessions_ref = db.collection('sessions')
        docs_s = sessions_ref.stream()
        count_sessions = 0
        async for doc in docs_s:
            d = doc.to_dict()
            title = d.get('title')
            name = d.get('name')
            user_id = d.get('userId')
            logger.info(f"ID: {doc.id} | Title: {repr(title)} | Name: {repr(name)} | UID: {user_id}")
            count_sessions += 1
        logger.info(f"Total in 'sessions': {count_sessions}")
        
    except Exception as e:
        logger.error(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(analyze_projects())
