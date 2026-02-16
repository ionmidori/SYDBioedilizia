
import firebase_admin
from firebase_admin import credentials, firestore
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize Firebase (assuming local emulator or creds env var)
# If env vars are set properly in dev.ps1, we can just init.
# For safety, I'll rely on default strat.
if not firebase_admin._apps:
    firebase_admin.initialize_app()

db = firestore.client()

# List last 5 sessions
sessions_ref = db.collection('sessions').order_by('createdAt', direction=firestore.Query.DESCENDING).limit(5)
docs = sessions_ref.stream()

print("-" * 40)
print("LATEST 5 SESSIONS")
print("-" * 40)

for doc in docs:
    data = doc.to_dict()
    print(f"ID: {doc.id}")
    print(f"UserId: {data.get('userId', 'MISSING')}")
    print(f"CreatedAt: {data.get('createdAt', 'MISSING')}")
    print("-" * 20)
