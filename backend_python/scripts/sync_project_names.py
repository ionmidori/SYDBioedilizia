import asyncio
import os
import sys
import logging

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), "../"))
from src.db.firebase_client import get_async_firestore_client

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sync_projects")

async def sync_project_names():
    """
    Reads all documents from 'sessions' collection (Source of Truth)
    and updates/creates corresponding documents in 'projects' collection
    to ensure the Global Gallery has correct names.
    """
    db = get_async_firestore_client()
    logger.info("Starting project name synchronization...")
    
    sessions_ref = db.collection("sessions")
    projects_ref = db.collection("projects")
    
    # Batch size for updates
    batch_size = 500
    batch = db.batch()
    count = 0
    updated_count = 0
    
    async for doc in sessions_ref.stream():
        data = doc.to_dict()
        session_id = doc.id
        title = data.get("title", "Nuovo Progetto")
        user_id = data.get("userId", "unknown")
        created_at = data.get("createdAt")
        
        # Prepare update for 'projects' collection
        project_doc_ref = projects_ref.document(session_id)
        
        # We use set with merge=True to be safe
        batch.set(project_doc_ref, {
            "id": session_id,
            "name": title,
            "userId": user_id,
            "updatedAt": datetime.utcnow() if not created_at else created_at, # approximate
            "status": "active" 
        }, merge=True)
        
        count += 1
        updated_count += 1
        
        if count >= batch_size:
            await batch.commit()
            logger.info(f"Committed batch of {count} updates...")
            batch = db.batch()
            count = 0
            
    if count > 0:
        await batch.commit()
        logger.info(f"Committed final batch of {count} updates.")
        
    logger.info(f"✅ Synchronization complete. Processed {updated_count} projects.")

if __name__ == "__main__":
    from datetime import datetime
    asyncio.run(sync_project_names())
