
import sys
from pathlib import Path

# Make `src` importable from any cwd: this file lives in backend_python/scripts/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv()

from src.storage.firebase_storage import get_storage_client

if __name__ == "__main__":
    print("📋 Listing Storage Buckets...")
    try:
        client = get_storage_client()
        buckets = list(client.list_buckets())
        
        if not buckets:
            print("⚠️ No buckets found for this project.")
        else:
            print(f"✅ Found {len(buckets)} buckets:")
            for bucket in buckets:
                print(f"- {bucket.name}")
                
    except Exception as e:
        print(f"❌ Error listing buckets: {e}")
