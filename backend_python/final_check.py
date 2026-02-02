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

async def check():
    db = get_async_firestore_client()
    uid = "eD2MWEyuIBU1s0VjYQApU0WPMOE3"
    
    logger.info(f"Analyzing for UID: {uid}")
    
    # 1. Real Projects
    sessions = db.collection('sessions').where('userId', '==', uid).stream()
    real_projects = []
    async for doc in sessions:
        d = doc.to_dict()
        name = d.get('name') or d.get('title')
        if name and name != 'Nuovo Progetto':
            real_projects.append((doc.id, name))
            
    logger.info(f"--- Real Projects ({len(real_projects)}) ---")
    for pid, name in real_projects:
        logger.info(f"ID: {pid} | Name: {name}")
        
    # 2. Files
    files = db.collection_group('files').stream()
    file_count = 0
    async for f in files:
        d = f.to_dict()
        pid = f.reference.parent.parent.id
        logger.info(f"File: {d.get('name')} | Type: {d.get('type')} | ProjectID: {pid}")
        file_count += 1
    
    logger.info(f"Total files in DB: {file_count}")

if __name__ == "__main__":
    asyncio.run(check())
