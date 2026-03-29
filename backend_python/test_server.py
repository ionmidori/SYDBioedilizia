import sys
import os

print(f"Python path: {sys.path}")
print(f"CWD: {os.getcwd()}")

try:
    print("Importing FastAPI...")
    from fastapi import FastAPI
    print("Importing Pydantic...")
    from pydantic import BaseModel
    print("Importing src components...")
    from src.db.firebase_client import init_firebase, get_async_firestore_client
    from src.api.routes.projects_router import router as projects_router
    
    print("Initializing Firebase...")
    init_firebase()
    
    print("Testing Firestore connection...")
    db = get_async_firestore_client()
    print("Diagnostic test PASSED")
    
except Exception as e:
    print(f"Diagnostic test FAILED: {str(e)}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
