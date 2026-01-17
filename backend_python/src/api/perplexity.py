import os
import logging
import httpx
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"

async def fetch_market_prices(query: str) -> Dict[str, Any]:
    """
    Fetch market price information using Perplexity API.
    
    Args:
        query: Search query for market prices (e.g., "average price for kitchen tiles in Italy")
        
    Returns:
        Dictionary with price information and sources
        
    Raises:
        Exception: If API call fails
    """
    if not PERPLEXITY_API_KEY:
        raise Exception("PERPLEXITY_API_KEY not configured in environment")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                PERPLEXITY_API_URL,
                headers={
                    "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.1-sonar-small-128k-online",
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a helpful assistant that provides accurate market price information for renovation materials and services in Italy. Always cite your sources and provide price ranges when available."
                        },
                        {
                            "role": "user",
                            "content": query
                        }
                    ]
                }
            )
            
            response.raise_for_status()
            data = response.json()
            
            # Extract the response content
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            citations = data.get("citations", [])
            
            logger.info(f"Market prices fetched successfully for query: {query[:50]}...")
            
            return {
                "success": True,
                "content": content,
                "citations": citations,
                "query": query
            }
            
    except httpx.HTTPStatusError as e:
        logger.error(f"Perplexity API HTTP error: {e.response.status_code} - {e.response.text}")
        raise Exception(f"API request failed: {e.response.status_code}")
    except Exception as e:
        logger.error(f"Failed to fetch market prices: {str(e)}", exc_info=True)
        raise Exception(f"Market price lookup failed: {str(e)}")
