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
    logger.info(f"[Tool] 🚀 submit_lead called for session {session_id}")
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
            logger.info(f"[Tool] ✅ submit_lead success: {result['id']}")
            return f"✅ Lead salvato con successo! ID: {result['id']}"
        finally:
            loop.close()
    except Exception as e:
        logger.error(f"[Tool] ❌ submit_lead failed: {e}")
        return f"❌ Errore nel salvare il lead: {str(e)}"

def get_market_prices_sync(query: str, user_id: str = "default") -> str:
    """Sync wrapper for get_market_prices tool."""
    logger.info(f"[Tool] 🔎 get_market_prices called: {query}")
    effective_user_id = user_id if user_id != "default" else get_current_user_id()
    
    try:
        allowed, remaining, reset_at = check_quota(effective_user_id, "get_market_prices")
        if not allowed:
            logger.warning(f"[Tool] Quota exceeded for user {effective_user_id}")
            reset_time = reset_at.strftime("%H:%M")
            return f"⏳ Hai raggiunto il limite giornaliero. Riprova alle {reset_time}."
    except Exception as e:
        logger.error(f"[Quota] Error checking quota: {e}")

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(fetch_market_prices(query))
            content = result.get("content", "Informazione non disponibile")
            
            try:
                increment_quota(effective_user_id, "get_market_prices")
            except Exception as e:
                logger.error(f"[Quota] Error incrementing quota: {e}")
            
            logger.info("[Tool] ✅ get_market_prices success")
            return content
        finally:
            loop.close()
    except Exception as e:
        logger.error(f"[Tool] ❌ get_market_prices failed: {e}")
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
    """Sync wrapper for generate_render tool."""
    logger.info(f"[Tool] 🎨 generate_render called: mode={mode}, style={style}")
    effective_user_id = user_id if user_id != "default" else get_current_user_id()
    
    try:
        allowed, remaining, reset_at = check_quota(effective_user_id, "generate_render")
        if not allowed:
            logger.warning(f"[Tool] Quota exceeded for user {effective_user_id}")
            reset_time = reset_at.strftime("%H:%M")
            
            # Check if user is anonymous - suggest login for more renders
            from src.tools.quota import _is_authenticated_user
            if not _is_authenticated_user(effective_user_id):
                return (
                    f"⏳ Hai raggiunto il limite gratuito (1 render al giorno). "
                    f"🔐 **Accedi per ottenere 3 render al giorno!** "
                    f"Oppure riprova domani alle {reset_time}."
                )
            else:
                return f"⏳ Hai raggiunto il limite giornaliero (3 render). Riprova alle {reset_time}."
        
        logger.info(f"[Quota] User {effective_user_id} has {remaining} renders remaining")
    except Exception as e:
        logger.error(f"[Quota] Error checking quota: {e}")

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            logger.info("[Tool] Starting async generation...")
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
            
            try:
                increment_quota(effective_user_id, "generate_render")
            except Exception as e:
                logger.error(f"[Quota] Error incrementing quota: {e}")
            
            logger.info("[Tool] ✅ generate_render success")
            return result
        finally:
            loop.close()
    except Exception as e:
        logger.error(f"[Tool] ❌ generate_render failed: {e}")
        return f"❌ Errore nella generazione del render: {str(e)}"

# 🆕 New Tool Wrappers (Migration Complete)

def save_quote_sync(user_id: str, image_url: Optional[str], ai_data: dict) -> str:
    """Sync wrapper for save_quote tool."""
    logger.info(f"[Tool] 📝 save_quote called for user {user_id}")
    
    try:
        from src.db.quotes import save_quote_draft
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            quote_id = loop.run_until_complete(
                save_quote_draft(user_id, image_url, ai_data)
            )
            logger.info(f"[Tool] ✅ Quote saved: {quote_id}")
            return f"✅ Preventivo salvato in bozza! ID: {quote_id}"
        finally:
            loop.close()
            
    except Exception as e:
        logger.error(f"[Tool] ❌ save_quote failed: {e}")
        return f"❌ Errore nel salvare il preventivo: {str(e)}"


def analyze_room_sync(image_url: str) -> str:
    """Sync wrapper for analyze_room tool."""
    logger.info(f"[Tool] 📐 analyze_room called for {image_url}")
    
    try:
        from src.vision.analyze import analyze_room_structure
        import httpx
        
        # Download image bytes first
        # Note: In a real scenario, we might want to pass bytes directly if we have them,
        # but the tool interface usually passes URLs.
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            # 1. Download
            async def download_and_analyze():
                async with httpx.AsyncClient() as client:
                    resp = await client.get(image_url)
                    resp.raise_for_status()
                    image_bytes = resp.content
                
                # 2. Analyze
                return await analyze_room_structure(image_bytes)

            analysis = loop.run_until_complete(download_and_analyze())
            
            # Format output as string (or return dict if your agent handles it)
            logger.info(f"[Tool] ✅ analyze_room success: {analysis.room_type}")
            return analysis.model_dump_json(indent=2)
            
        finally:
            loop.close()
            
    except Exception as e:
        logger.error(f"[Tool] ❌ analyze_room failed: {e}")
        return f"❌ Errore nell'analisi della stanza: {str(e)}"

def plan_renovation_sync(image_url: str, style: str, keep_elements: list = None) -> str:
    """Sync wrapper for plan_renovation tool (Architect)."""
    logger.info(f"[Tool] 🏛️ plan_renovation called for style {style}")
    
    try:
        from src.vision.architect import generate_architectural_prompt
        import httpx
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            # 1. Download
            async def download_and_plan():
                async with httpx.AsyncClient() as client:
                    resp = await client.get(image_url)
                    resp.raise_for_status()
                    image_bytes = resp.content
                
                # 2. Plan
                return await generate_architectural_prompt(image_bytes, style, keep_elements)

            plan = loop.run_until_complete(download_and_plan())
            
            # Format output as friendly markdown
            return f"""
# 🏛️ Piano di Ristrutturazione ({style})

**Scheletro:** {plan.structural_skeleton[:100]}...
**Materiali:** {plan.material_plan[:100]}...
**Arredo:** {plan.furnishing_strategy[:100]}...

(Usa `generate_render` per visualizzarlo!)
"""
            
        finally:
            loop.close()
            
    except Exception as e:
        logger.error(f"[Tool] ❌ plan_renovation failed: {e}")
        return f"❌ Errore nel piano architettonico: {str(e)}"
