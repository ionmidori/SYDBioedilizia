import sys
from pathlib import Path
import asyncio
import re
import logging
import httpx

# Make `src` importable from any cwd: this file lives in backend_python/scripts/ops/.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.db.firebase_client import get_firestore_client
from firebase_admin import firestore

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_latest_session():
    db = get_firestore_client()
    sessions = db.collection('sessions').order_by('updatedAt', direction=firestore.Query.DESCENDING).limit(1).stream()
    for doc in sessions:
        return doc.id
    return None

def get_last_image_url(session_id):
    db = get_firestore_client()
    messages = db.collection('sessions').document(session_id).collection('messages').order_by('timestamp', direction=firestore.Query.DESCENDING).limit(10).stream()
    
    for doc in messages:
        content = doc.to_dict().get('content', '')
        if isinstance(content, str):
            match = re.search(r'\[Immagine allegata: (https?://[^\]]+)\]', content)
            if match:
                return match.group(1)
    return None

async def test_download(url):
    print(f"\n🔍 Testing URL: {url}")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            print(f"📡 Status Code: {response.status_code}")
            print(f"📄 Content-Type: {response.headers.get('content-type')}")
            print(f"📏 Content-Length: {response.headers.get('content-length')}")
            
            if response.status_code != 200:
                print(f"❌ Error Body: {response.text[:500]}")
            else:
                print("✅ Download SUCCESS!")
    except Exception as e:
        print(f"❌ Exception: {e}")

if __name__ == "__main__":
    session_id = get_latest_session()
    if not session_id:
        print("❌ No sessions found.")
    else:
        print(f"🆔 Session ID: {session_id}")
        url = get_last_image_url(session_id)
        if url:
            asyncio.run(test_download(url))
        else:
            print("❌ No image URL found in recent messages.")
