
import sys
import os
import asyncio

sys.path.append(os.path.join(os.path.dirname(__file__), "src"))
sys.path.append(os.path.dirname(__file__))

# Load env
from dotenv import load_dotenv
load_dotenv()

from src.tools.sync_wrappers import generate_render_sync

if __name__ == "__main__":
    print("🧪 Starting Final Verification...")
    try:
        # Mocking a T2I request
        result = generate_render_sync(
            prompt="Minimalist bright white kitchen, wooden floor",
            room_type="kitchen",
            style="Minimalist",
            session_id="test-final-verify",
            mode="creation"
        )
        print("\n✅ SUCCESS! Result:")
        print(result)
    except Exception as e:
        print(f"\n❌ FAILED: {e}")
