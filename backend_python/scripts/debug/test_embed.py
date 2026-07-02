import os
from google import genai
from src.core.config import settings

def main():
    try:
        api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
        if not api_key:
            print("NO API KEY")
            return
            
        client = genai.Client(api_key=api_key)
        
        models = client.models.list_models()
        print("Available embedding models:")
        for m in models:
            if "embed" in m.name.lower():
                print(f" - {m.name}")
                
        print("\nTesting embed_content...")
        response = client.models.embed_content(
            model='text-embedding-004', 
            contents='test',
            config={"task_type": "RETRIEVAL_DOCUMENT"}
        )
        print("SUCCESS:", response)
    except Exception as e:
        print("ERROR:", e)

if __name__ == "__main__":
    main()
