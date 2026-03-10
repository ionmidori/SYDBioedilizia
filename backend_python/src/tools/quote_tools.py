from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import logging
from src.services.insight_engine import get_insight_engine, InsightEngineError
from src.services.pricing_service import PricingService
from src.repositories.conversation_repository import ConversationRepository
from src.db.firebase_client import get_async_firestore_client
from src.schemas.quote import QuoteSchema

logger = logging.getLogger(__name__)

# Quantity bounds: reject AI-suggested quantities outside this range to prevent pricing injection
_MIN_QTY = 0.01   # Allow fractional units (e.g. 0.5 m²)
_MAX_QTY = 10_000  # Hard cap — anything above is almost certainly an AI hallucination


class SuggestQuoteItemsInput(BaseModel):
    model_config = {"extra": "forbid"}
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
        
        # 3. Analyze with Insight Engine (uses Gemini response_schema structured output)
        engine = get_insight_engine()
        # Pass the chat summary as a single distilled message to reduce token overhead
        summary_message = [{"role": "user", "content": f"Riepilogo conversazione progetto:\n{chat_summary}"}]
        try:
            analysis = await engine.analyze_project_for_quote(summary_message, media_urls)
        except InsightEngineError as exc:
            logger.error("[QuoteTool] InsightEngine failed.", extra={"error": str(exc)})
            return (
                "Non è stato possibile analizzare automaticamente il progetto in questo momento. "
                "Ti chiedo di descrivermi le lavorazioni previste e ti fornirò un preventivo manuale."
            )
        
        if not analysis.suggestions:
            if analysis.missing_info:
                questions = " ".join(analysis.missing_info[:2])
                return (
                    f"Ho capito il progetto: {analysis.summary}\n\n"
                    f"Prima di prepararti un preventivo accurato, ho bisogno di qualche informazione. "
                    f"{questions}"
                )
            return (
                f"Ho difficoltà a identificare le lavorazioni specifiche da quotare. "
                f"Puoi dirmi le dimensioni approssimative dell'ambiente "
                f"e quali lavori hai in mente? ({analysis.summary})"
            )

        # Validation Pattern: SKU existence check
        unknown_skus = validate_sku_suggestions(analysis.suggestions)
        valid_suggestions = [s for s in analysis.suggestions if s.sku not in unknown_skus]

        if not valid_suggestions:
            logger.warning(
                "[QuoteTool] All AI suggestions had unknown SKUs.",
                extra={"unknown_skus": unknown_skus},
            )
            return (
                f"Ho identificato alcune lavorazioni potenziali ({', '.join(unknown_skus)}) "
                "ma non corrispondono al listino prezzi attuale. "
                "Un nostro consulente ti contatterà per un preventivo personalizzato."
            )

        # Validation Pattern: quantity bounds check (pricing injection prevention)
        valid_suggestions, qty_warnings = _validate_qty_bounds(valid_suggestions)
        if qty_warnings:
            logger.warning(f"[QuoteTool] Filtered {len(qty_warnings)} suggestion(s) with out-of-bounds qty")
        if not valid_suggestions:
            return "La generazione del preventivo non è riuscita: le quantità suggerite erano fuori dai limiti accettabili. Descrivi il progetto in modo più dettagliato."

        # ── Completeness Gate (Opzione C) ─────────────────────────────────────────
        # If the InsightEngine signals that data is insufficient (score < 0.7),
        # return the missing questions instead of an incomplete quote.
        COMPLETENESS_THRESHOLD = 0.70
        if analysis.completeness_score < COMPLETENESS_THRESHOLD and analysis.missing_info:
            logger.info(
                "[QuoteTool] Completeness gate triggered.",
                extra={"score": analysis.completeness_score, "missing": analysis.missing_info},
            )
            formatted_questions = " ".join(analysis.missing_info[:2])  # max 2 questions per turn
            return (
                f"Ho identificato le lavorazioni principali ({analysis.summary}), "
                f"ma ho bisogno di qualche dettaglio in più per un preventivo preciso.\n\n"
                f"{formatted_questions}"
            )

        # 4. Generate Pricing
        sku_list = [
            {
                "sku": s.sku,
                "qty": s.qty,
                "ai_reasoning": s.ai_reasoning,
                "phase": getattr(s, "phase", "Lavori"),
            }
            for s in valid_suggestions
        ]
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
        
        # 6. Return human-readable Italian summary, grouped by WBS phase
        response = f"**{analysis.summary}**\n\nHo preparato una bozza di preventivo sulla base della nostra conversazione:\n\n"

        # Group items by WBS phase for readability
        from collections import defaultdict
        by_phase: dict[str, list] = defaultdict(list)
        for item in quote.items:
            phase = item.category or "Lavori"
            by_phase[phase].append(item)

        for phase, items in by_phase.items():
            response += f"**{phase}**\n"
            for item in items:
                response += f"  • {item.description} ({item.qty} {item.unit}) — €{item.total:.2f}\n"
            response += "\n"

        response += f"**Subtotale: €{quote.financials.subtotal:.2f}**\n"
        response += f"**Totale (IVA inclusa): €{quote.financials.grand_total:.2f}**\n\n"

        # Add completeness note if score is moderate
        if 0.70 <= analysis.completeness_score < 0.85:
            response += (
                "_Nota: questo preventivo è basato su stime indicative. "
                "Il nostro geometra lo affinerà durante la revisione._ \n\n"
            )

        response += "Puoi revisionare e modificare questa bozza nella tua dashboard sotto 'Preventivo'."

        return response

    except InsightEngineError:
        raise  # Already handled above — should not reach here
    except Exception as exc:
        logger.error("[QuoteTool] Unexpected error during quote generation.", exc_info=True)
        return (
            "Si è verificato un errore imprevisto durante la generazione del preventivo. "
            "Il nostro team è stato notificato. Riprova tra qualche minuto."
        )

suggest_quote_items = suggest_quote_items_wrapper
