import asyncio
import os
import sys

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# LOAD ENV BEFORE IMPORTS
from dotenv import load_dotenv
load_dotenv()

from src.api.perplexity import fetch_market_prices

async def main():
    print("Testing Perplexity API...")
    try:
        query = "average cost of porcelain tiles in italy"
        print(f"Query: {query}")
        result = await fetch_market_prices(query)
        
        if result["success"]:
            print("✅ Success!")
            print("Content:", result["content"][:200] + "...")
            print("Citations:", result["citations"])
        else:
            print("❌ Failed:", result)
            
    except Exception as e:
        print(f"❌ Exception: {e}")

if __name__ == "__main__":
    asyncio.run(main())
