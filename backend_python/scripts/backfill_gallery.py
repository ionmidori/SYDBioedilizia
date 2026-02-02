import asyncio
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
import os
import sys

# Add src to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Initialize Firebase (Local)
cred = credentials.Certificate("firebase-service-account.json")
try:
    firebase_admin.initialize_app(cred)
except ValueError:
    pass # Already initialized

db = firestore.client()

async def backfill_gallery():
    print("🚀 Starting Gallery Backfill...")
    
    # 1. Get all sessions
    sessions_ref = db.collection('sessions')
    sessions = sessions_ref.stream()
    
    count = 0
    
    for session in sessions:
        session_id = session.id
        print(f"📂 Processing Session/Project: {session_id}")
        
        # 2. Get messages with attachments
        messages_ref = sessions_ref.document(session_id).collection('messages')
        messages = messages_ref.stream()
        
        for msg in messages:
            data = msg.to_dict()
            attachments = data.get('attachments', [])
            
            # Check for legacy text markers if attachments array is empty
            content = data.get('content', '')
            # (Simple regex for legacy markers could go here if needed, but we focus on structured data first)
            
            if not attachments:
                continue
                
            print(f"   found {len(attachments)} attachments in msg {msg.id}")
            
            for att in attachments:
                url = att.get('url')
                if not url: continue
                
                # Check if exists in files
                files_ref = db.collection('projects').document(session_id).collection('files')
                existing = files_ref.where('url', '==', url).limit(1).get()
                
                if len(existing) > 0:
                    print(f"   ⚠️ File already in gallery: {url[:30]}...")
                    continue
                
                # Create File Doc
                file_type = att.get('media_type', 'image')
                mime_type = att.get('mime_type', 'application/octet-stream')
                
                new_doc = {
                    'url': url,
                    'type': file_type,
                    'name': f"Backfilled {file_type.capitalize()} {datetime.now().strftime('%Y-%m-%d')}",
                    'size': 0,
                    'uploadedBy': session.to_dict().get('userId', 'system'),
                    'uploadedAt': data.get('timestamp', firestore.SERVER_TIMESTAMP),
                    'mimeType': mime_type,
                    'backfilled': True
                }
                
                files_ref.add(new_doc)
                print(f"   ✅ Added to Gallery: {new_doc['name']}")
                count += 1

    print(f"🎉 Backfill Complete! Added {count} files.")

if __name__ == "__main__":
    # Python 3.7+
    loop = asyncio.get_event_loop()
    loop.run_until_complete(backfill_gallery())
