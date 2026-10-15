import sys
from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

key = os.getenv('FIREBASE_PRIVATE_KEY', '')
print(f"Debug: Key length: {len(key)}")
print(f"Debug: Starts with '-----BEGIN': {key.strip().startswith('-----BEGIN PRIVATE KEY-----')}")
print(f"Debug: Ends with 'PRIVATE KEY-----': {key.strip().endswith('-----END PRIVATE KEY-----')}")
print(f"Debug: Contains literal \\n: {'\\n' in key}")
print(f"Debug: Contains actual newline: {'\n' in key}")

# Simulate the replace logic used in client
processed_key = key.replace('\\n', '\n')
print(f"Debug: Processed key has actual newlines: {'\n' in processed_key}")
print(f"Debug: Processed key first 30 chars: {repr(processed_key[:30])}")

# Make `src` importable from any cwd: this file lives in backend_python/scripts/ops/.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.db.firebase_client import get_firestore_client

try:
    print("\n🔥 Testing Firebase Connection with processed key...")
    db = get_firestore_client()
    collections = [c.id for c in db.collections(timeout=5)]
    print(f"✅ Firebase Connected! Found collections: {collections}")
except Exception as e:
    print(f"❌ Firebase Error: {e}")
    sys.exit(1)
