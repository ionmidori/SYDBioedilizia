import logging
import json
from typing import List, Optional, Dict, Any
from langchain_core.tools import tool

# Logic Imports
from src.tools.generate_render import generate_render_wrapper
from src.tools.quota import check_quota, increment_quota
from src.utils.context import get_current_user_id, get_current_media_metadata
from src.utils.auth_guard import require_auth
from src.utils.download import download_image_smart
from src.db.leads import save_lead
from src.models.lead import LeadData
from src.api.perplexity import fetch_market_prices
from src.db.quotes import save_quote_draft
# from src.vision.analyze import analyze_room_structure (Unused after triage fix)
from src.vision.triage import analyze_media_triage
from src.vision.cad_engine import analyze_floorplan_vector, generate_dxf_bytes
from src.storage.upload import upload_file_bytes

from src.tools.project_files import list_project_files
from src.tools.gallery import show_project_gallery

logger = logging.getLogger(__name__)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🛠️ TOOL DEFINITIONS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@tool
async def submit_lead(name: str, email: str, phone: str, project_details: str, session_id: str = "default") -> str:
    """Save lead contact info and project details to database."""
    logger.info(f"[Tool] 🚀 submit_lead called for session {session_id}")
    try:
        current_uid = get_current_user_id()
        
        lead_data = LeadData(
            name=name,
            email=email,
            phone=phone,
            project_details=project_details
        )
        
        result = await save_lead(lead_data, current_uid, session_id)
        logger.info(f"[Tool] ✅ submit_lead success: {result.get('lead_id')}")
        return f"✅ Lead salvato con successo! ID: {result.get('lead_id')}"
        
    except Exception as e:
        logger.error(f"[Tool] ❌ submit_lead failed: {e}")
        return f"❌ Errore nel salvare il lead: {str(e)}"

@tool
@require_auth
async def get_market_prices(query: str, user_id: str = "default") -> str:
    """Get current market prices for renovation materials or services."""
    logger.info(f"[Tool] 🔎 get_market_prices called: {query}")
    effective_user_id = user_id if user_id != "default" else get_current_user_id()
    
    try:
        allowed, remaining, reset_at = await check_quota(effective_user_id, "get_market_prices")
        if not allowed:
            reset_time = reset_at.strftime("%H:%M")
            return f"⏳ Hai raggiunto il limite giornaliero. Riprova alle {reset_time}."
            
        result = await fetch_market_prices(query)
        content = result.get("content", "Informazione non disponibile")
        
        try:
            await increment_quota(effective_user_id, "get_market_prices")
        except Exception as e:
            logger.error(f"[Quota] Error incrementing quota: {e}")
        
        return content
        
    except Exception as e:
        logger.error(f"[Tool] ❌ get_market_prices failed: {e}")
        return f"❌ Errore: {str(e)}"

@tool
@require_auth
async def generate_render(
    prompt: str, 
    room_type: str, 
    style: str,
    session_id: str = "default",
    mode: str = "creation",
    source_image_url: Optional[str] = None,
    keep_elements: Optional[List[str]] = None,
    user_id: str = "default"
) -> Dict[str, Any]:
    """Generate photorealistic interior design rendering (T2I or I2I mode)."""
    logger.info(f"[Tool] 🎨 generate_render called (ASYNC):")
    logger.info(f"  - mode: {mode}")
    
    # 1. Quota Check
    effective_user_id = user_id if user_id != "default" else get_current_user_id()
    try:
        allowed, remaining, reset_at = await check_quota(effective_user_id, "generate_render")
        if not allowed:
            reset_time = reset_at.strftime("%H:%M")
            if effective_user_id.startswith("guest_") or len(effective_user_id) < 10:
                 return f"⏳ Hai raggiunto il limite gratuito. 🔐 Accedi per ottenerne di più! Riprova alle {reset_time}."
            return f"⏳ Hai raggiunto il limite giornaliero. Riprova alle {reset_time}."
    except Exception as e:
        if "Quota" in str(e) or "Firestore" in str(e) or "Network" in str(e):
             logger.error(f"[Quota] Service Check failed: {e}")
             pass 
        else:
             logger.error(f"[Quota] 🛑 LOGIC ERROR: {e}", exc_info=True)
             pass

    # 2. Execute Async Core Logic
    result = await generate_render_wrapper(
        prompt, room_type, style, session_id, mode, source_image_url, keep_elements
    )
    
    # 3. Increment Quota (if successful)
    if "✅" in result:
        try:
            await increment_quota(effective_user_id, "generate_render")
            logger.info(f"[Quota] Incremented for {effective_user_id}")
        except Exception as e:
            logger.error(f"[Quota] Increment failed: {e}")
            
    return result

@tool
@require_auth
async def save_quote(
    user_id: str,
    ai_data: Dict[str, Any],
    image_url: Optional[str] = None
) -> str:
    """
    Save a structured quote draft to the database.
    Use this when the user completes the 'Technical Surveyor' interview.
    """
    logger.info(f"[Tool] 📝 save_quote called for user {user_id}")
    try:
        quote_id = await save_quote_draft(user_id, image_url, ai_data)
        return f"✅ Preventivo salvato in bozza! ID: {quote_id}"
    except Exception as e:
        logger.error(f"[Tool] ❌ save_quote failed: {e}")
        return f"❌ Errore nel salvare il preventivo: {str(e)}"

@tool
@require_auth
async def analyze_room(image_url: str) -> str:
    """
    CRITICAL: You MUST call this tool IMMEDIATELY when the user uploads an image, even if they say nothing.
    Analyze room structure, dimensions, and features from an image.
    """
    logger.info(f"[Tool] analyze_room called for {image_url}")
    try:
        # 1. Download
        media_bytes, content_type = await download_image_smart(image_url)
        logger.info(f"[Tool] Detected MIME type: {content_type}")
        
        # 2. Retrieve Metadata (Trim Range / Context)
        all_metadata = get_current_media_metadata()
        media_meta = None
        if all_metadata:
                media_meta = all_metadata.get(image_url)
                if not media_meta:
                    # Fuzzy match fallback
                    for k, v in all_metadata.items():
                        if k in image_url or image_url in k:
                            media_meta = v
                            break
        
        # 3. Unified Triage Analysis (Images & Videos)
        # This returns the correct Triage JSON (Room Type, Style, Condition, Renovation Potential)
        # instead of the purely structural engineering JSON.
        result = await analyze_media_triage(media_bytes, content_type, metadata=media_meta)
        return json.dumps(result, indent=2)
            
    except Exception as e:
        logger.error(f"[Tool] ❌ analyze_room failed: {e}")
        return f"❌ Errore nell'analisi della stanza: {str(e)}"

@tool
@require_auth
async def plan_renovation(image_url: str, style: str, keep_elements: Optional[List[str]] = None) -> str:
    """
    Generate a text-only architectural plan using the 'Skeleton & Skin' methodology.
    Use this to PROPOSE a design before generating the render, or if the user asks for design advice without an image.
    """
    logger.info(f"[Tool] 🏛️ plan_renovation called")
    try:
        image_bytes, mime_type = await download_image_smart(image_url)
        
        plan = await generate_architectural_prompt(image_bytes, style, keep_elements)
        
        return f"""
# 🏛️ Piano di Ristrutturazione ({style})

**Scheletro:** {plan.structural_skeleton[:100]}...
**Materiali:** {plan.material_plan[:100]}...
**Arredo:** {plan.furnishing_strategy[:100]}...

(Usa `generate_render` per visualizzarlo!)
"""
    except Exception as e:
        logger.error(f"[Tool] ❌ plan_renovation failed: {e}")
        return f"❌ Errore nel piano architettonico: {str(e)}"

@tool
@require_auth
async def generate_cad(image_url: str, session_id: str) -> str:
    """
    Generate a technical CAD measurement plan (DXF) from an image.
    Extracts structural geometry, area estimates, and dimensions.
    Returns a technical summary and a download link for the .dxf file.
    
    Args:
        image_url: The image to analyze.
        session_id: The current project/session ID to save the file.
    """
    logger.info(f"[Tool] 📏 generate_cad V2 called for {image_url}")
    try:
        # 1. Download
        image_bytes, mime_type = await download_image_smart(image_url)
        
        # 2. Extract Vector Data (Gemini Pro)
        vector_data = await analyze_floorplan_vector(image_bytes)
        
        # 3. Generate DXF
        dxf_bytes = generate_dxf_bytes(vector_data)
        
        # 4. Upload DXF to Storage
        file_name = f"rilievo-cad-{int(datetime.now().timestamp())}.dxf"
        download_url = upload_file_bytes(
            file_bytes=dxf_bytes,
            session_id=session_id,
            file_name=file_name,
            mime_type="application/dxf",
            prefix="projects"
        )
        
        # 5. Format Summary
        muri_count = len(vector_data.walls)
        aperture_count = len(vector_data.openings)
        
        # Estimate area if scale exists (simplified)
        area_info = ""
        if vector_data.scale_reference:
            area_info = f"\n**Riferimento Scala:** {vector_data.scale_reference.description} ({vector_data.scale_reference.real_width_cm}cm)"

        return f"""
# 📐 Rilievo Tecnico CAD (V2)
Analisi vettoriale completata con successo.

### 📊 Riepilogo Strutturale:
- **Muri Rilevati:** {muri_count}
- **Aperture (Porte/Finestre):** {aperture_count}
{area_info}

### 📥 Download
Ho generato il file professionale in formato DXF (compatibile con AutoCAD, SketchUp, Revit).

[🔗 Scarica il file DXF (Rilievo Tecnico)]({download_url})

*(Nota: Il link scadrà tra 7 giorni. Verificare sempre le misure in cantiere prima di procedere con gli ordini dei materiali)*
"""
    except Exception as e:
        logger.error(f"[Tool] ❌ generate_cad failed: {e}")
        return f"❌ Errore nella generazione del CAD: {str(e)}"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 📦 REGISTRY EXPORT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALL_TOOLS = [
    submit_lead, 
    get_market_prices, 
    generate_render, 
    save_quote, 
    analyze_room, 
    plan_renovation,
    list_project_files,
    show_project_gallery,
    generate_cad
]
