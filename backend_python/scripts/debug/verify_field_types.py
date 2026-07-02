import os
import sys
from dotenv import load_dotenv

# Set CWD
os.chdir('c:/Users/User01/.gemini/antigravity/scratch/renovation-next/backend_python')
load_dotenv()

from src.db.firebase_client import get_firestore_client
from google.cloud.firestore_v1.document import DocumentSnapshot

def verify_types():
    db = get_firestore_client()
    doc_id = '08108854-22a5-42b7-8359-e8248f10e594'
    doc = db.collection('sessions').document(doc_id).get()
    
    if not doc.exists:
        print(f"Document {doc_id} not found.")
        return

    data = doc.to_dict()
    created_at = data.get('createdAt')
    
    print(f"Field 'createdAt' type: {type(created_at)}")
    print(f"Field 'createdAt' value: {created_at}")
    
    # Check messages
    msg_col = db.collection('sessions').document(doc_id).collection('messages').limit(1).stream()
    for msg in msg_col:
        msg_data = msg.to_dict()
        timestamp = msg_data.get('timestamp')
        print(f"Message ID: {msg.id}")
        print(f"Field 'timestamp' type: {type(timestamp)}")
        print(f"Field 'timestamp' value: {timestamp}")

if __name__ == "__main__":
    verify_types()
