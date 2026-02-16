import os
import sys
from dotenv import load_dotenv

# Set CWD to backend_python to find .env
os.chdir('c:/Users/User01/.gemini/antigravity/scratch/renovation-next/backend_python')
load_dotenv()

from src.db.firebase_client import get_firestore_client

def discover_data():
    db = get_firestore_client()
    
    print("\n--- Firestore Data Discovery ---")
    
    # 1. Users
    print("\n[Users]")
    users = list(db.collection('users').limit(3).stream())
    for u in users:
        print(f"User ID: {u.id}")
        # Preferences subcollection
        prefs = list(db.collection('users').document(u.id).collection('preferences').limit(1).stream())
        if prefs:
            print(f"  - Has preferences (e.g., {prefs[0].id})")
            
    # 2. Projects
    print("\n[Projects]")
    projects = list(db.collection('projects').limit(3).stream())
    for p in projects:
        data = p.to_dict()
        print(f"Project ID: {p.id} | Owner: {data.get('userId')}")
        # Files subcollection
        files = list(db.collection('projects').document(p.id).collection('files').limit(1).stream())
        if files:
            print(f"  - Has files (e.g., {files[0].id})")
            
    # 3. Sessions
    print("\n[Sessions]")
    sessions = list(db.collection('sessions').limit(3).stream())
    for s in sessions:
        data = s.to_dict()
        print(f"Session ID: {s.id} | User: {data.get('userId')} | Created: {data.get('createdAt')}")
        # Messages subcollection
        messages = list(db.collection('sessions').document(s.id).collection('messages').limit(1).stream())
        if messages:
            print(f"  - Has messages (e.g., {messages[0].id})")

if __name__ == "__main__":
    try:
        discover_data()
    except Exception as e:
        print(f"Error: {e}")
