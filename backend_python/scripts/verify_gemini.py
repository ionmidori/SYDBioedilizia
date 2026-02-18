import os
import sys
import logging
import asyncio
import logging

# Debug print - verify script start
print("🔹 verify_gemini.py STARTED", flush=True)

# Add the parent directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    print("🔹 Importing libraries...", flush=True)
    from dotenv import load_dotenv
    
    # Load .env file from two levels up (backend_python root)
    # MUST DO THIS BEFORE IMPORTING src.api.gemini_imagen because it reads env at import time
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
    if os.path.exists(env_path):
        print(f"📖 Loading environment from: {env_path}", flush=True)
        load_dotenv(env_path)
    else:
        print(f"⚠️ Warning: .env file not found at {env_path}", flush=True)

    # NOW import the module that needs the env var
    from src.api.gemini_imagen import generate_image_t2i, T2I_MODEL
    print("🔹 Imports successful!", flush=True)
except Exception as e:
    print(f"❌ Import Error: {e}", flush=True)
    exit(1)

async def main():
    print(f"\n🧪 STARTING GEMINI API VERIFICATION")
    print(f"--------------------------------------")
    
    # 1. Check API Key
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print(f"❌ ERROR: GEMINI_API_KEY is not set in the environment variables.")
        print(f"   Please set it using: $env:GEMINI_API_KEY='your_key'")
        return

    masked_key = f"{api_key[:4]}...{api_key[-4:]}"
    print(f"✅ API Key found: {masked_key}")
    print(f"🎯 Target Model: {T2I_MODEL}")

    # 2. Test T2I Generation
    print(f"\n🚀 Testing Text-to-Image Generation (CHEAP FLASH MODE)...")
    try:
        # ⚠️ OVERRIDING MODEL TO FLASH TO PREVENT COSTS
        CHEAP_MODEL = "gemini-3-flash-preview"
        print(f"💰 Using cheaper model: {CHEAP_MODEL}")
        
        result = await generate_image_t2i(
            prompt="A futuristic minimalist chair, white background, studio light",
            negative_prompt="blurry, low quality",
            model=CHEAP_MODEL # Pass cheaper model if supported
        )
        
        if result.get("success"):
            print(f"✅ SUCCESS! Image generated.")
            print(f"   Model used: {CHEAP_MODEL}")
            print(f"   Mime Type: {result.get('mime_type')}")
            print(f"   Base64 Length: {len(result.get('image_base64', ''))} chars")
        else:
            print(f"❌ FAILURE: Generation returned success=False")
            
    except Exception as e:
        print(f"❌ EXCEPTION: {str(e)}")
        print(f"   Check the logs for stack trace.")

if __name__ == "__main__":
    asyncio.run(main())
