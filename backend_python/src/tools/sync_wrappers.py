"""
Sync tool wrappers for LangGraph/LangChain integration.
LangChain tools don't support async directly, so we create sync wrappers.
"""

import asyncio
from typing import Optional
from src.db.leads import save_lead
from src.models.lead import LeadData
from src.api.perplexity import fetch_market_prices
from src.tools.generate_render import generate_render_wrapper

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

def get_market_prices_sync(query: str) -> str:
    """Sync wrapper for get_market_prices tool."""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(fetch_market_prices(query))
            return result.get("content", "Informazione non disponibile")
        finally:
            loop.close()
    except Exception as e:
        return f"❌ Errore nel recuperare i prezzi: {str(e)}"

def generate_render_sync(
    prompt: str,
    room_type: str,
    style: str,
    session_id: str,
    mode: str = "creation",
    source_image_url: Optional[str] = None,
    keep_elements: Optional[list] = None
) -> str:
    """Sync wrapper for generate_render tool."""
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
            return result
        finally:
            loop.close()
    except Exception as e:
        return f"❌ Errore nella generazione del render: {str(e)}"
