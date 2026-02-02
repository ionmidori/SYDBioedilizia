import asyncio
import logging
import sys
import os
from datetime import datetime
from dotenv import load_dotenv

# Load env before imports that might need it (though firebase client usually loads it too, 
# explicit load is safer for scripts)
load_dotenv()

# Add parent directory to path to allow imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from firebase_admin import storage, firestore
from src.db.firebase_client import get_async_firestore_client, get_firestore_client
from src.db.projects import sync_project_cover, PROJECTS_COLLECTION

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def backfill_metadata_and_sync():
    """
    1. List all sessions.
    2. For each session, list blobs in Storage (uploads/ and renders/).
    3. Create missing entries in projects/{id}/files.
    4. Trigger sync_project_cover.
    """
    try:
        # Use sync client for Storage operations (firebase_admin storage is sync)
        db_sync = get_firestore_client()
        
        bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET")
        if not bucket_name:
            raise Exception("FIREBASE_STORAGE_BUCKET env var not set")
            
        bucket = storage.bucket(name=bucket_name)
        
        # Get all sessions
        sessions_ref = db_sync.collection(PROJECTS_COLLECTION)
        docs = sessions_ref.stream()
        
        for doc in docs:
            session_id = doc.id
            logger.info(f"Processing session: {session_id}")
            
            # --- BACKFILL METADATA ---
            # Define prefixes to scan
            prefixes = [f"uploads/{session_id}", f"renders/{session_id}"]
            
            found_blobs = []
            for prefix in prefixes:
                blobs = bucket.list_blobs(prefix=prefix)
                for blob in blobs:
                    found_blobs.append(blob)

            if not found_blobs:
                logger.info(f"   No blobs found in Storage.")
            else:
                files_ref = db_sync.collection('projects').document(session_id).collection('files')
                
                for blob in found_blobs:
                    # Check if exists
                    # Assuming public URL structure
                    # https://storage.googleapis.com/{bucket_name}/{blob_name}
                    # But better to check by name or partial URL match if possible, or just add if low count
                    
                    # Construct public URL (approximate, usually works for public buckets or signed)
                    # We use make_public() normally, so mediaLink or publicUrl
                    # Let's construct a standard URL we use in app
                    # https://storage.googleapis.com/<bucket>/<path>
                    file_url = f"https://storage.googleapis.com/{bucket.name}/{blob.name}"
                    
                    # Check existing
                    existing_docs = files_ref.where('url', '==', file_url).limit(1).get()
                    if len(existing_docs) > 0:
                        continue
                        
                    # Determine type
                    file_type = "image"
                    if "renders" in blob.name:
                        file_type = "render"
                    elif blob.content_type and "video" in blob.content_type:
                        file_type = "video"
                        
                    # Create Entry
                    doc_data = {
                        'url': file_url,
                        'type': file_type,
                        'name': os.path.basename(blob.name),
                        'size': blob.size,
                        'uploadedBy': 'system_backfill',
                        'uploadedAt': blob.time_created or datetime.utcnow(),
                        'mimeType': blob.content_type or 'application/octet-stream'
                    }
                    
                    files_ref.add(doc_data)
                    logger.info(f"   + Backfilled file: {doc_data['name']}")

            # --- SYNC COVER ---
            try:
                # sync_project_cover is async, but we can restart the loop or just run it
                # calling async from sync context is tricky if loop is running
                # Let's use asyncio.run or await if we convert this func to async
                # Since we are in 'async def', we can await!
                # But we used db_sync above. Mixing is fine if separate resources.
                did_update = await sync_project_cover(session_id)
                if did_update:
                    logger.info(f"   ✅ Updated cover")
            except Exception as e:
                logger.error(f"   ❌ Failed to sync cover: {e}")

        logger.info(f"Backfill All Complete.")
        
    except Exception as e:
        logger.error(f"Fatal error in backfill: {e}")

if __name__ == "__main__":
    asyncio.run(backfill_metadata_and_sync())
