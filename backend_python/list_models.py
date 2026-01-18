
import os
from dotenv import load_dotenv
from google import genai

# Load env variables
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("❌ GEMINI_API_KEY not found in .env")
    exit(1)

print(f"🔑 Using API Key: {api_key[:5]}...{api_key[-3:]}")

try:
    client = genai.Client(api_key=api_key)
    print("📡 Contacting Google GenAI API to list models...")
    
    # List models
    models = client.models.list()
    
    print("\n📋 Available Models:")
    found_imagen = False
    for m in models:
        # Filter to keep output clean-ish
        if "gemini" in m.name or "imagen" in m.name:
             print(f"- {m.name}")
             if "imagen" in m.name.lower():
                 found_imagen = True

    if not found_imagen:
        print("\n⚠️ NO IMAGEN MODELS FOUND available for this key.")
        
except Exception as e:
    print(f"\n❌ Error listing models: {e}")
