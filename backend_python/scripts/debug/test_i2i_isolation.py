
"""
Test I2I (image-to-image) flow in isolation.
Uses a real image URL from the user's bucket to simulate the rendering pipeline.
"""
import sys
import os
import asyncio

sys.path.append(os.path.join(os.path.dirname(__file__), "src"))
sys.path.append(os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from src.tools.sync_wrappers import generate_render_sync

# Use an existing test image URL from this session's uploads
# (Change this to a real uploaded image URL)
TEST_IMAGE_URL = "https://storage.googleapis.com/chatbotluca-a8a73.firebasestorage.app/renders/test-final-verify/1768768124100-ae16e136.png"

if __name__ == "__main__":
    print("🧪 Starting I2I Isolation Test...")
    print(f"📥 Source Image: {TEST_IMAGE_URL}")
    
    try:
        result = generate_render_sync(
            prompt="Transform to modern minimalist style",
            room_type="living room",
            style="Modern Minimalist",
            session_id="test-i2i-isolation",
            mode="modification",
            source_image_url=TEST_IMAGE_URL,
            keep_elements=["floor"]
        )
        print("\n✅ Result:")
        print(result)
    except Exception as e:
        print(f"\n❌ FAILED: {e}")
        import traceback
        traceback.print_exc()
