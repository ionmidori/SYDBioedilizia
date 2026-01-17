from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from src.api.perplexity import fetch_market_prices

class MarketPricesInput(BaseModel):
    """Input schema for get_market_prices tool."""
    query: str = Field(
        ..., 
        description="Search query for market prices (e.g., 'average cost per square meter for bathroom tiles in Rome')"
    )

async def get_market_prices_wrapper(query: str) -> str:
    """
    Fetch current market prices for renovation materials and services.
    Use this when the user asks about costs, pricing, or market rates.
    """
    try:
        result = await fetch_market_prices(query)
        
        if not result["success"]:
            return "Unable to fetch market prices at this time. Please try again later."
        
        # Format the response with citations
        response = result["content"]
        if result.get("citations"):
            response += "\n\nSources:\n"
            for i, citation in enumerate(result["citations"][:3], 1):  # Limit to 3 sources
                response += f"{i}. {citation}\n"
        
        return response
        
    except Exception as e:
        return f"Error fetching market prices: {str(e)}"

# Tool definition
MARKET_PRICES_TOOL_DEF = {
    "name": "get_market_prices",
    "description": "Fetch current market prices for renovation materials and services using real-time search.",
    "args_schema": MarketPricesInput
}
