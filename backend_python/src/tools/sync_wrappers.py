"""
Sync tool wrappers for LangGraph/LangChain integration.
LangChain tools don't support async directly, so we create sync wrappers.
"""

import asyncio
import logging
from typing import Optional
from src.db.leads import save_lead
from src.models.lead import LeadData
from src.api.perplexity import fetch_market_prices
from src.tools.generate_render import generate_render_wrapper
from src.tools.quota import check_quota, increment_quota, QuotaExceededError
from src.utils.context import get_current_user_id  # ✅ Context-based user tracking

logger = logging.getLogger(__name__)

def submit_lead_sync(
    name: str,
    email: str,
    phone: str,
    project_details: str,
    session_id: str
) -> str:
    """Sync wrapper for submit_lead tool."""
    try:
        lead_data = LeadData(
            name=name,
            email=email,
            phone=phone,
            project_details=project_details
        )
        
        # Run async function in sync context
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(save_lead(session_id, lead_data))
            return f"✅ Lead salvato con successo! ID: {result['id']}"
        finally:
            loop.close()
    except Exception as e:
        return f"❌ Errore nel salvare il lead: {str(e)}"

def get_market_prices_sync(query: str, user_id: str = "default") -> str:
    """
    Sync wrapper for get_market_prices tool with quota enforcement.
    
    Args:
        query: Search query for market prices
        user_id: Optional user ID (falls back to context if "default")
    
    Returns:
        Formatted price information or error message
    """
    # ✅ FIX: Get user_id from context if not explicitly provided
    effective_user_id = user_id if user_id != "default" else get_current_user_id()
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 🛡️ QUOTA CHECK: Prevent abuse of Perplexity API
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try:
        allowed, remaining, reset_at = check_quota(effective_user_id, "get_market_prices")
        if not allowed:
            reset_time = reset_at.strftime("%H:%M")
            return (
                f"⏳ Hai raggiunto il limite giornaliero di ricerche di prezzo. "
                f"Potrai cercare di nuovo alle {reset_time}."
            )
    except Exception as e:
        logger.error(f"[Quota] Error checking quota: {e}")
        # Fail open: Allow if quota check fails
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 🔧 EXECUTE: Fetch market prices
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(fetch_market_prices(query))
            content = result.get("content", "Informazione non disponibile")
            
            # ✅ SUCCESS: Increment quota
            try:
                increment_quota(effective_user_id, "get_market_prices")
            except Exception as e:
                logger.error(f"[Quota] Error incrementing quota: {e}")
            
            return content
        finally:
            loop.close()
    except Exception as e:
        logger.error(f"[Tool] Error fetching market prices: {e}")
        return f"❌ Errore nel recuperare i prezzi: {str(e)}"

def generate_render_sync(
    prompt: str,
    room_type: str,
    style: str,
    session_id: str,
    mode: str = "creation",
    source_image_url: Optional[str] = None,
    keep_elements: Optional[list] = None,
    user_id: str = "default"
) -> str:
    """
    Sync wrapper for generate_render tool with quota enforcement.
    
    Args:
        prompt: Generation prompt
        room_type: Type of room (e.g., "living room")
        style: Design style (e.g., "modern")
        session_id: Conversation session ID
        mode: "creation" or "modification"
        source_image_url: URL of source image (required for modification mode)
        keep_elements: Elements to preserve from source image
        user_id: User identifier for quota tracking
    
    Returns:
        Success message with image URL or error message
    """
    # ✅ FIX: Get user_id from context if not explicitly provided
    effective_user_id = user_id if user_id != "default" else get_current_user_id()
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 🛡️ QUOTA CHECK: Prevent abuse of Imagen API (expensive!)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try:
        allowed, remaining, reset_at = check_quota(effective_user_id, "generate_render")
        if not allowed:
            reset_time = reset_at.strftime("%H:%M")
            return (
                f"⏳ Hai raggiunto il limite giornaliero di rendering (2 al giorno). "
                f"Potrai generare nuovi render alle {reset_time}."
            )
        
        logger.info(f"[Quota] User {effective_user_id} has {remaining} renders remaining")
    except Exception as e:
        logger.error(f"[Quota] Error checking quota: {e}")
        # Fail open: Allow if quota check fails
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 🔧 EXECUTE: Generate render
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                generate_render_wrapper(
                    prompt=prompt,
                    room_type=room_type,
                    style=style,
                    session_id=session_id,
                    mode=mode,
                    source_image_url=source_image_url,
                    keep_elements=keep_elements or []
                )
            )
            
            # ✅ SUCCESS: Increment quota
            try:
                increment_quota(effective_user_id, "generate_render")
            except Exception as e:
                logger.error(f"[Quota] Error incrementing quota: {e}")
            
            return result
        finally:
            loop.close()
    except Exception as e:
        logger.error(f"[Tool] Error generating render: {e}")
        return f"❌ Errore nella generazione del render: {str(e)}"
