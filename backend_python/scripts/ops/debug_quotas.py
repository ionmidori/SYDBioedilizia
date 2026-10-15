from pathlib import Path
import sys
import os


# Explicitly load .env
from dotenv import load_dotenv
load_dotenv()

# Make `src` importable from any cwd: this file lives in backend_python/scripts/ops/.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.db.firebase_client import get_firestore_client

if __name__ == "__main__":
    db = get_firestore_client()
    doc_ref = db.collection("usage_quotas").document("guest-session-_generate_render")
    doc_ref.delete()
    print("✅ DELETED 'guest-session-_generate_render'")
