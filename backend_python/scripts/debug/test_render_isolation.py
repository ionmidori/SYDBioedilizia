
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
    print("🧪 Starting Render Isolation Test...")
    try:
        # Mocking a T2I request
        result = generate_render_sync(
            prompt="Luxury modern living room, white marble floor, large windows, sunset view",
            room_type="living_room",
            style="Modern Luxury",
            session_id="test-session-isolation",
            mode="creation"
        )
        print("\n✅ Result:")
        print(result)
    except Exception as e:
        print(f"\n❌ Error: {e}")
