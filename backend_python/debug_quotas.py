

import sys
import os

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), "src"))
sys.path.append(os.path.dirname(__file__))

# Explicitly load .env
from dotenv import load_dotenv
load_dotenv()

from src.db.firebase_client import get_firestore_client

if __name__ == "__main__":
    db = get_firestore_client()
    doc_ref = db.collection("usage_quotas").document("guest-session-_generate_render")
    doc_ref.delete()
    print("✅ DELETED 'guest-session-_generate_render'")
