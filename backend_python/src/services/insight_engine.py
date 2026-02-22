import logging
import json
import os
from typing import List, Dict, Any, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from src.core.config import settings
from src.services.pricing_service import PricingService
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

class SKUItemSuggestion(BaseModel):
    sku: str = Field(..., description="The SKU from the Master Price Book")
    qty: float = Field(..., description="Estimated quantity")
    ai_reasoning: str = Field(..., description="Why this item is necessary based on the chat/images")

class InsightAnalysis(BaseModel):
    suggestions: List[SKUItemSuggestion]
    summary: str = Field(..., description="A brief summary of the project requirements identified")

class InsightEngine:
    def __init__(self, model_name: str | None = None):
        if model_name is None:
            model_name = settings.CHAT_MODEL_VERSION
        self.llm = ChatGoogleGenerativeAI(
            model=model_name,
            api_key=settings.api_key,
            temperature=0.1
        )

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
        
        system_prompt = f"""
You are a 'Quantity Surveyor' AI assistant for SYD Bioedilizia.
Your task is to analyze the conversation between the user and the AI, and any provided images, to identify necessary renovation works.
Map these works to the specific SKUs provided in the Master Price Book below.

{price_book_summary}

RULES:
1. ONLY use SKUs from the provided list.
2. Estimate quantities based on the context (e.g., if the user mentions a 20mq room, use that for flooring).
3. Provide a clear reasoning for each item.
4. If the information is missing, make a reasonable conservative estimate or omit the item.
5. Focus on: Demolitions, Electrical, Plumbing, Structural works, and Flooring. Ignore furniture.

Output your analysis in a structured JSON format.
"""

        # Prepare messages
        messages = [SystemMessage(content=system_prompt)]
        
        # Add chat history summary or full history
        history_text = "Chat History:\n"
        for msg in chat_history:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            history_text += f"{role}: {content}\n"
        
        human_content = [{"type": "text", "text": history_text}]
        
        # Add images if available
        for url in media_urls:
            human_content.append({"type": "image_url", "image_url": {"url": url}})
            
        messages.append(HumanMessage(content=human_content))
        
        # Invoke LLM with structured output
        structured_llm = self.llm.with_structured_output(InsightAnalysis)
        
        try:
            logger.info("[InsightEngine] Analyzing project for quote...")
            analysis = await structured_llm.ainvoke(messages)
            return analysis
        except Exception as e:
            logger.error(f"[InsightEngine] Error during analysis: {e}")
            raise Exception(f"Failed to analyze project: {str(e)}")

# Singleton instance
_insight_engine = None

def get_insight_engine() -> InsightEngine:
    global _insight_engine
    if _insight_engine is None:
        _insight_engine = InsightEngine()
    return _insight_engine
