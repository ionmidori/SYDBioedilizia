
import asyncio
import os
from dotenv import load_dotenv
from src.vision.architect import generate_architectural_prompt
from src.storage.upload import upload_base64_image
from src.core.config import settings

# Load env vars
load_dotenv()

async def test_full_flow():
    print("Testing Full Render Flow (Architect -> Upload)...")
    
    # 1. Mock image (small red square)
    import base64
    red_pixel = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    
    try:
        # 2. Architect Test
        print("--- Step 1: Architect ---")
        arch_output = await generate_architectural_prompt(
            image_bytes=red_pixel,
            target_style="Modern",
            mime_type="image/png"
        )
        print("✅ Architect SUCCESS")
        
        # 3. Upload Test
        print("--- Step 2: Storage Upload ---")
        # Use a dummy base64 matching the red pixel
        dummy_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        image_url = upload_base64_image(
            base64_data=f"data:image/png;base64,{dummy_base64}",
            session_id="test_session_verification"
        )
        print(f"✅ Upload SUCCESS: {image_url.split('?')[0]}...[SIGNED]")
        
        print("\n🏆 ALL SYSTEMS CONFIGURED CORRECTLY!")
        
    except Exception as e:
        print(f"❌ FLOW FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_full_flow())
