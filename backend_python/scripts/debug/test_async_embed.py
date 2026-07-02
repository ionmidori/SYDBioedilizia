import asyncio
from google import genai
from src.core.config import settings

async def main():
    try:
        api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
        if not api_key:
            print("NO API KEY")
            return
            
        client = genai.Client(api_key=api_key)
        
        try:
            print("Testing text-embedding-004 async...")
            resp1 = await client.aio.models.embed_content(
                model='text-embedding-004', 
                contents='test'
            )
            print("SUCCESS text-embedding-004:", resp1)
            return
        except Exception as e:
            print("ERROR with text-embedding-004:", e)
            
        print("Falling back to text-embedding-004...")
        try:
            resp2 = await client.aio.models.embed_content(
                model='text-embedding-004', 
                contents='test'
            )
            print("SUCCESS text-embedding-004:", resp2)
        except Exception as e:
            print("ERROR with text-embedding-004:", e)
            
        print("Falling back to gemini-embedding-001...")
        try:
            from google.genai import types
            resp_new = await client.aio.models.embed_content(
                model='gemini-embedding-001',
                contents='test'
            )
            print("SUCCESS gemini-embedding-001")
        except Exception as e:
            print("ERROR with gemini-embedding-001:", e)
            
    except Exception as e:
        print("FATAL ERROR:", e)

if __name__ == "__main__":
    asyncio.run(main())
