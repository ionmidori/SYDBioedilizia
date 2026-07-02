
import asyncio
import os
import base64
from src.api.gemini_imagen import generate_image_i2i, generate_image_t2i
from dotenv import load_dotenv
import pathlib

# Force load .env from current directory
env_path = pathlib.Path(__file__).parent.parent / '.env'
print(f"Loading .env from: {env_path.resolve()}")
load_dotenv(dotenv_path=env_path)

async def test_generation():
    print("🚀 Starting Isolation Test for Gemini Imagen...")
    
    # 1. Test T2I (Simpler)
    print("\n[1] Testing Text-to-Image (T2I)...")
    try:
        res = await generate_image_t2i("A futuristic kitchen with neon lights, 8k resolution")
        print(f"✅ T2I Success! Size: {len(res['image_base64'])} bytes")
    except Exception as e:
        print(f"❌ T2I Failed: {e}")

    # 2. Test I2I (The suspected blocker)
    print("\n[2] Testing Image-to-Image (I2I)...")
    
    # Create a 1x1 pixel red image for testing
    # Red pixel base64: iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==
    dummy_image_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    dummy_bytes = base64.b64decode(dummy_image_b64)
    
    try:
        res = await generate_image_i2i(
            source_image_bytes=dummy_bytes,
            prompt="Turn this into a blue pixel",
            mime_type="image/png"
        )
        print(f"✅ I2I Success! Size: {len(res['image_base64'])} bytes")
    except Exception as e:
        print(f"❌ I2I Failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_generation())
