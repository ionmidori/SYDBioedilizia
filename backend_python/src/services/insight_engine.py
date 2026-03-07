import logging
import json
from typing import List, Dict, Any
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, Field
from src.core.config import settings
from src.services.pricing_service import PricingService

logger = logging.getLogger(__name__)

class SKUItemSuggestion(BaseModel):
    model_config = {"extra": "forbid"}
    sku: str = Field(..., description="The SKU from the Master Price Book")
    qty: float = Field(..., description="Estimated quantity")
    ai_reasoning: str = Field(..., description="Why this item is necessary based on the chat/images")

class InsightAnalysis(BaseModel):
    model_config = {"extra": "forbid"}
    suggestions: List[SKUItemSuggestion]
    summary: str = Field(..., description="A brief summary of the project requirements identified")

class InsightEngine:
    def __init__(self, model_name: str | None = None):
        self.model_name = model_name or settings.CHAT_MODEL_VERSION
        self.client = genai.Client(api_key=settings.api_key)

    def _get_price_book_summary(self) -> str:
        price_book = PricingService.load_price_book()
        summary = "Available SKUs in Master Price Book:\n"
        for item in price_book:
            summary += f"- SKU: {item['sku']}, Description: {item['description']}, Unit: {item['unit']}, Category: {item['category']}\n"
        return summary

    async def analyze_project_for_quote(self, chat_history: List[Dict[str, Any]], media_urls: List[str] = []) -> InsightAnalysis:
        """
        Analyzes chat and media to suggest SKUs and quantities.
        """
        price_book_summary = self._get_price_book_summary()

        system_prompt = f"""You are a 'Quantity Surveyor' AI assistant for SYD Bioedilizia.
Your task is to analyze the conversation between the user and the AI, and any provided images, to identify necessary renovation works.
Map these works to the specific SKUs provided in the Master Price Book below.

{price_book_summary}

RULES:
1. ONLY use SKUs from the provided list.
2. Estimate quantities based on the context (e.g., if the user mentions a 20mq room, use that for flooring).
3. Provide a clear reasoning for each item.
4. If the information is missing, make a reasonable conservative estimate or omit the item.
5. Focus on: Demolitions, Electrical, Plumbing, Structural works, and Flooring. Ignore furniture.

Output your analysis as a valid JSON object with this structure:
{{
  "suggestions": [
    {{"sku": "...", "qty": 0.0, "ai_reasoning": "..."}}
  ],
  "summary": "..."
}}
"""

        history_text = "Chat History:\n"
        for msg in chat_history:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            history_text += f"{role}: {content}\n"

        parts: list[genai_types.Part] = [
            genai_types.Part(text=system_prompt),
            genai_types.Part(text=history_text),
        ]
        
        if media_urls:
            import httpx
            import asyncio
            from urllib.parse import urlparse
            async with httpx.AsyncClient(timeout=10.0) as client:
                for url in media_urls:
                    try:
                        parsed_url = urlparse(url)
                        if settings.FIREBASE_STORAGE_BUCKET not in parsed_url.netloc:
                            logger.warning(f"[InsightEngine] Skipping unauthorized URL: {url}")
                            continue
                            
                        response = await client.get(url)
                        response.raise_for_status()
                        mime_type = "image/jpeg" # Default assumption
                        if "video" in url:
                            mime_type = "video/mp4"
                        parts.append(genai_types.Part(
                            inline_data=genai_types.Blob(mime_type=mime_type, data=response.content)
                        ))
                    except Exception as e:
                        logger.error(f"[InsightEngine] Failed to fetch image {url}: {e}")
                        parts.append(genai_types.Part(text=f"[Image: {url} - Unfetchable]"))

        try:
            logger.info("[InsightEngine] Analyzing project for quote...")
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=[genai_types.Content(parts=parts)],
                config=genai_types.GenerateContentConfig(temperature=0.1),
            )
            raw_output = (response.text or "").replace("```json", "").replace("```", "").strip()
            parsed = json.loads(raw_output)
            return InsightAnalysis(**parsed)
        except Exception as e:
            logger.error(f"[InsightEngine] Error during analysis: {e}")
            raise Exception(f"Failed to analyze project: {str(e)}")


_insight_engine: InsightEngine | None = None

def get_insight_engine() -> InsightEngine:
    global _insight_engine
    if _insight_engine is None:
        _insight_engine = InsightEngine()
    return _insight_engine
