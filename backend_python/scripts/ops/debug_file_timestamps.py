from pathlib import Path
import asyncio
import logging
import sys
import os
from datetime import datetime


from firebase_admin import firestore

# Make `src` importable from any cwd: this file lives in backend_python/scripts/ops/.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.db.firebase_client import get_async_firestore_client
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def check_timestamps():
    try:
        db = get_async_firestore_client()
        logger.info(f"Checking timestamps...")
        
        # Get all sessions
        sessions_ref = db.collection('sessions') # or 'projects' since we use sessions collection mostly?
        # In projects.py PROJECTS_COLLECTION = "sessions"
        
        docs = sessions_ref.limit(5).stream()
        
        async for doc in docs:
            session_id = doc.id
            logger.info(f"--- Session: {session_id} ---")
            
            files_ref = db.collection('projects').document(session_id).collection('files')
            files = files_ref.stream()
            
            async for file_doc in files:
                data = file_doc.to_dict()
                name = data.get('name')
                uploaded_at = data.get('uploadedAt')
                
                uploaded_by = data.get('uploadedBy')
                logger.info(f"   File: {name} | UploadedAt: {uploaded_at} | By: {uploaded_by}")
                
    except Exception as e:
        logger.error(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_timestamps())
