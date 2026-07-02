
import os
import sys

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), "src"))
sys.path.append(os.path.dirname(__file__))

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
