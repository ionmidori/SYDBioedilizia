
import firebase_admin
from firebase_admin import credentials, firestore
import os
from dotenv import load_dotenv

load_dotenv()

if not firebase_admin._apps:
    firebase_admin.initialize_app()

db = firestore.client()

# List last 5 projects
projects_ref = db.collection('projects').order_by('createdAt', direction=firestore.Query.DESCENDING).limit(5)
docs = projects_ref.stream()

print("-" * 40)
print("LATEST 5 PROJECTS")
print("-" * 40)

for doc in docs:
    data = doc.to_dict()
    print(f"ID: {doc.id}")
    print(f"UserId: {data.get('userId', 'MISSING')}")
    print(f"Name: {data.get('name', 'MISSING')}")
    print(f"CreatedAt: {data.get('createdAt', 'MISSING')}")
    print("-" * 20)
