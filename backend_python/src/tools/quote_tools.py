from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import logging
from src.services.insight_engine import get_insight_engine
from src.services.pricing_service import PricingService
from src.repositories.conversation_repository import ConversationRepository
from src.db.firebase_client import get_async_firestore_client
from src.schemas.quote import QuoteSchema

logger = logging.getLogger(__name__)

# Quantity bounds: reject AI-suggested quantities outside this range to prevent pricing injection
_MIN_QTY = 0.01   # Allow fractional units (e.g. 0.5 m²)
_MAX_QTY = 10_000  # Hard cap — anything above is almost certainly an AI hallucination


class SuggestQuoteItemsInput(BaseModel):
    session_id: str = Field(..., description="The ID of the current chat session")
    project_id: Optional[str] = Field(None, description="Optional: ID of the project associated with the session")
    user_id: Optional[str] = Field(None, description="Optional: UID of the user")

def build_chat_summary(history: List[Dict[str, Any]], limit_chars: int = 500) -> str:
    """
    Extracts a readable summary from chat history, truncating long messages.
    Pattern: QUANTITY_SURVEYOR.md
    """
    lines = []
    for msg in history:
        role = msg.get("role", "user")
        content = str(msg.get("content", ""))
        if len(content) > limit_chars:
            content = content[:limit_chars] + "..."
        lines.append(f"{role.upper()}: {content}")
    return "\n".join(lines)

def validate_sku_suggestions(suggestions: List[Any]) -> List[str]:
    """
    Verifies that suggested SKUs exist in the Price Book.
    Pattern: QUANTITY_SURVEYOR.md
    """
    price_book = PricingService.load_price_book()
    valid_skus = {i["sku"] for i in price_book}

    unknown_skus = []
    for s in suggestions:
        if s.sku not in valid_skus:
            unknown_skus.append(s.sku)
            logger.warning(f"[QS] SKU sconosciuto dall'AI: {s.sku}")

    return unknown_skus


def _validate_qty_bounds(suggestions: List[Any]) -> tuple[List[Any], List[str]]:
    """
    Filters out suggestions with quantities outside safe bounds (_MIN_QTY .. _MAX_QTY).
    Returns (valid_suggestions, list_of_warning_messages).
    Prevents pricing injection via AI-hallucinated extreme quantities.
    """
    valid = []
    warnings = []
    for s in suggestions:
        qty = getattr(s, "qty", None)
        if qty is None or qty < _MIN_QTY or qty > _MAX_QTY:
            msg = f"SKU {s.sku}: qty={qty} rejected (must be {_MIN_QTY} ≤ qty ≤ {_MAX_QTY})"
            logger.warning(f"[QuoteTool] Qty out of bounds — {msg}")
            warnings.append(msg)
        else:
            valid.append(s)
    return valid, warnings

async def suggest_quote_items_wrapper(session_id: str, project_id: Optional[str] = None, user_id: Optional[str] = None) -> str:
    """
    Analyzes the current chat session and suggests a list of quote items based on the Master Price Book.
    Use this when the user asks for a preliminary quote, cost estimation, or 'what needs to be done'.
    """
    try:
        # 1. Load context
        repo = ConversationRepository()
        history = await repo.get_context(session_id, limit=20)
        
        # 2. Extract media URLs
        media_urls = []
        for msg in history:
            attachments = msg.get("attachments", [])
            for att in attachments:
                if att.get("url"):
                    media_urls.append(att["url"])
        
        # Optimization: Build Chat Summary instead of raw history
        chat_summary = build_chat_summary(history)
        
        # 3. Analyze with Insight Engine
        engine = get_insight_engine()
        # We pass the summary wrapped in a dict list to match existing signature or refactor engine.
        # Ideally, engine should accept summary. But engine expects list of dicts.
        # Let's mock the list of dicts with one system/user message containing summary.
        # Wait, existing engine loops over list.
        # Let's pass the raw history for now, but I should refactor engine to use summary if I strictly follow pattern.
        # The pattern says: "Input Preprocessing: Chat Summary".
        # I will update InsightEngine to accept a summary string or list of messages?
        # For now, let's keep passing history but relying on engine's internal logic.
        # Actually, let's pass the summary as a single "user" message to the engine.
        
        summary_message = [{"role": "user", "content": f"Here is the chat summary:\n{chat_summary}"}]
        analysis = await engine.analyze_project_for_quote(summary_message, media_urls)
        
        if not analysis.suggestions:
            return f"""I couldn't identify specific renovation items to quote at this time. Could you provide more details about the room size or specific works you're interested in?

Summary: {analysis.summary}"""

        # Validation Pattern: SKU existence check
        unknown_skus = validate_sku_suggestions(analysis.suggestions)
        valid_suggestions = [s for s in analysis.suggestions if s.sku not in unknown_skus]

        if not valid_suggestions:
            return f"I identified potential works ({', '.join(unknown_skus)}) but they don't match our current price book. Please contact a human agent."

        # Validation Pattern: quantity bounds check (pricing injection prevention)
        valid_suggestions, qty_warnings = _validate_qty_bounds(valid_suggestions)
        if qty_warnings:
            logger.warning(f"[QuoteTool] Filtered {len(qty_warnings)} suggestion(s) with out-of-bounds qty")
        if not valid_suggestions:
            return "Quote generation failed: all suggested quantities were outside acceptable bounds. Please describe the project scope in more detail."

        # 4. Generate Pricing
        sku_list = [{"sku": s.sku, "qty": s.qty, "ai_reasoning": s.ai_reasoning} for s in valid_suggestions]
        # We need a user_id. If not provided, we try to get it from context or use session_id
        final_user_id = user_id or "guest_" + session_id
        
        quote = PricingService.create_quote_from_skus(project_id or session_id, final_user_id, sku_list)

        # Sanity check: suspiciously low totals often indicate malformed AI output
        if quote.financials.grand_total < 100 and len(quote.items) > 1:
            logger.warning(
                f"[QuoteTool] Suspicious grand_total=€{quote.financials.grand_total:.2f} "
                f"for {len(quote.items)} items (project={project_id or session_id}). "
                "Verify pricing service and AI output."
            )

        # 5. Save the draft to Firestore (Collection: projects/{projectId}/private_data/quote)
        db = get_async_firestore_client()
        target_project_id = project_id or session_id
        
        quote_ref = db.collection('projects').document(target_project_id).collection('private_data').document('quote')
        await quote_ref.set(quote.model_dump(exclude_none=True))
        
        # 6. Return human-readable summary
        response = f"**{analysis.summary}**\n\nI've generated a preliminary quote draft based on our conversation:\n\n"
        for item in quote.items:
            response += f"- {item.sku}: {item.description} ({item.qty} {item.unit}) - EUR {item.total:.2f}\n"
        
        response += f"\n**Estimated Subtotal: EUR {quote.financials.subtotal:.2f}**\n"
        response += f"**Estimated Grand Total (incl. VAT): EUR {quote.financials.grand_total:.2f}**\n\n"
        response += "You can review and edit this draft in your dashboard under 'Quote Review'."
        
        return response

    except Exception as e:
        logger.error(f"[QuoteTool] Error: {e}", exc_info=True)
        return f"Sorry, I encountered an error while generating the quote: {str(e)}"

# Tool definition
suggest_quote_items = StructuredTool.from_function(
    func=suggest_quote_items_wrapper,
    name="suggest_quote_items",
    description="Analyze chat and images to suggest a preliminary quote with SKUs from the price book.",
    args_schema=SuggestQuoteItemsInput
)
