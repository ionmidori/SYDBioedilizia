import os
import json
import logging
from typing import List, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel
from src.core.config import settings

logger = logging.getLogger(__name__)

class ArchitectOutput(BaseModel):
    """
    Structured output from the Architect for narrative prompt generation.
    Uses the "Skeleton & Skin" methodology: neutral geometry + material overlay + furnishing.
    """
    structural_skeleton: str
    """Neutral description of fixed geometry (walls, ceiling, windows, doors, stairs)."""
    
    material_plan: str
    """Material palette mapped to structural elements based on requested style."""
    
    furnishing_strategy: str
    """Description of NEW furniture and decor to populate the space."""
    
    technical_notes: str
    """Technical metadata (lighting quality, camera perspective)."""


async def generate_architectural_prompt(
    image_bytes: bytes,
    target_style: str,
    keep_elements: Optional[List[str]] = None,
    mime_type: str = "image/jpeg",
    user_instructions: str = ""
) -> ArchitectOutput:
    """
    The Architect: Generates a narrative-based structural plan for image generation.
    Uses Gemini Flash to extract geometry and material planning.
    
    Args:
        image_bytes: The source image as bytes
        target_style: The desired renovation style (e.g., "Japandi", "Industrial")
        keep_elements: List of elements to explicitly preserve (from user chat)
        mime_type: MIME type of the source image (default: image/jpeg)
        user_instructions: Specific user requests to override defaults (e.g. "red sofa")
        
    Returns:
        ArchitectOutput object with skeleton, materials, and furnishing separated
    """
    if keep_elements is None:
        keep_elements = []
    
    if keep_elements is None:
        keep_elements = []
    
    model_name = "gemini-3-flash-preview"
    
    logger.info(f"[Architect] Building narrative plan (Style: {target_style}, Keep: {len(keep_elements)})...")
    logger.info(f"[Architect] User Instructions: {user_instructions[:50]}...")
    logger.info(f"[Architect] Model: {model_name}")
    
    preservation_list = ", ".join(keep_elements) if keep_elements else "None specified (renovate freely)"
    
    system_prompt = f"""
ROLE: You are an Architectural Surveyor and Interior Design Specialist.

GOAL: Analyze the input room image and generate a structured plan for renovation in the "{target_style}" style.

USER-SPECIFIED PRESERVATION: {preservation_list}

USER REQUEST ANALYSIS (INTERPRETATION LAYER):
1. Identify explicit constraints in: "{user_instructions}"
2. Categorize them into: structural, material, or furnishing updates.
3. CRITICAL: These specific user requests MUST OVERRIDE any default style rules.
   (e.g., If Style is 'Minimal' but user asks for 'Red Sofa', you MUST include 'Red Sofa' in furnishingStrategy).

YOUR TASK: Generate FOUR FIELDS for a narrative-based image generation prompt.

---

FIELD 1: structuralSkeleton (Neutral Geometry Description)

Describe the FIXED GEOMETRY of the room. Focus ONLY on structure:
- Wall configuration and angles
- Ceiling type (flat/vaulted/beamed) and height
- Architectural features (fireplaces, alcoves, archways)
- Window and door placements
- Permanent fixtures (stairs, columns, beams)
- Room shape and spatial layout
- Camera perspective

**RULES:**
- DO NOT mention condition (old/damaged/dirty)
- DO NOT use imperative language ("preserve", "keep")
- DESCRIBE what exists
- Be specific about positions

**Material Normalization:**
If preserving items: "{preservation_list}", use CLEAN names:
- "vecchio cotto" → "terracotta tile flooring"
- "scala legno rovinato" → "wooden staircase"

**Example:**
"The room features a high vaulted ceiling with exposed beams, a wooden staircase on the left with glass balustrade, a large rectangular window in a recessed alcove on the right, and a fireplace on the back wall. Terracotta tile flooring throughout."

---

FIELD 2: materialPlan (Style-Specific Material Mapping)

Based on "{target_style}", specify materials for structural elements.

CRITICAL INSTRUCTION FOR MATERIALS:
1. For NEW elements (furniture, decor, changed walls): Apply the requested style strictly (e.g., if 'Minimalist', use 'Light Oak', 'White Plaster').
2. For EXISTING STRUCTURAL elements (Stairs, Fireplace, Window Frames) that are kept:
   - DO NOT automatically change their material to fit the style unless explicitly asked.
   - Instead, DETECT the current material/color in the image (e.g., "Dark Mahogany", "Red Brick").
   - Describe it as "RESTORED" or "REFINISHED" to improve quality without changing the essence.
   - Use adjectives like: "polished", "varnished", "cleaned", "rich tone", "high-quality grain".

OUTPUT RULE:
In the 'materialPlan', for existing structures, write: "The existing [Structure Name] is preserved in its original [Color/Material] tone, refinished to a pristine condition."

Examples:
- Walls: "Walls finished in pure matte white plaster"
- Floor: "Restored terracotta tiles with polished surface catching warm daylight"
- Stairs (PRESERVED): "The staircase retains its original deep walnut hue but is refinished with a smooth satin varnish"
- Fireplace (PRESERVED): "The original stone fireplace is cleaned to reveal its natural grey texture"

**Example:**
"Walls finished in soft matte white, the staircase refinished in blonde oak wood catching ambient light, flooring featuring restored terracotta with polished finish, and fireplace clad in white marble."

---

FIELD 3: furnishingStrategy (New Furniture & Decor)

Describe furniture/decor for "{target_style}".

Be EXTREMELY specific:
- "Low-profile sectional sofa in textured beige bouclé"
- "Noguchi-style coffee table with walnut base and glass top"
- "Hand-woven jute area rug, linen throw pillows in terracotta"
- "Sculptural ceramic vases, potted fiddle-leaf fig, art books"

Include:
1. Seating, tables
2. Lighting fixtures
3. Textiles (rugs, pillows, curtains)
4. Decor (plants, art, ceramics)
5. Atmosphere

**Example:**
"Low-profile beige linen sofa, natural oak coffee table, hand-woven jute rug, sheer linen curtains, potted fiddle-leaf fig, ceramic vases, paper pendant lights casting soft glow."

---

FIELD 4: technicalNotes (Lighting & Camera)

Brief technical specs:

**Example:**
"24mm wide-angle lens, f/8, soft volumetric natural lighting (5500K), warm accents (2700K), 8K photorealistic, global illumination."

---

OUTPUT FORMAT

Respond with ONLY valid JSON. No markdown, no explanations:

{{
  "structuralSkeleton": "The room features...",
  "materialPlan": "Walls finished in...",
  "furnishingStrategy": "Low-profile sofa...",
  "technicalNotes": "24mm lens, f/8..."
}}
"""
    
    try:
        # Initialize Gemini LLM
        llm = ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=settings.api_key,
            temperature=0.4
        )
        
        # Convert image to base64
        import base64
        base64_image = base64.b64encode(image_bytes).decode('utf-8')
        
        # Create multimodal message
        from langchain_core.messages import HumanMessage
        
        message = HumanMessage(
            content=[
                {"type": "text", "text": system_prompt},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}
                }
            ]
        )
        
        # Generate response (Async)
        # 🔐 FIX: Tag as "reasoning_tier" to prevent AgentOrchestrator from streaming this internal JSON to the user.
        response = await llm.ainvoke([message], config={"tags": ["reasoning_tier"]})
        raw_output = response.content
        
        if not raw_output:
            logger.warning("[Architect] No output, using fallback")
            return _create_fallback_output(target_style, preservation_list)
        
        # 🧪 ROBUSTNESS: Handle list output from multimodal models
        if isinstance(raw_output, list):
            raw_output = "".join([p.get("text", "") if isinstance(p, dict) else str(p) for p in raw_output])
        
        # Clean and parse JSON
        cleaned_output = raw_output.replace("```json", "").replace("```", "").strip()
        
        try:
            parsed = json.loads(cleaned_output)
            
            # Validate required fields
            if not all(k in parsed for k in ["structuralSkeleton", "materialPlan", "furnishingStrategy"]):
                raise ValueError("Missing required fields")
            
            logger.info("[Architect] ✅ Structured Output Generated")
            logger.info(f"[Architect] Skeleton: {len(parsed['structuralSkeleton'])} chars")
            logger.info(f"[Architect] Materials: {len(parsed['materialPlan'])} chars")
            logger.info(f"[Architect] Furnishing: {len(parsed['furnishingStrategy'])} chars")
            
            return ArchitectOutput(
                structural_skeleton=parsed["structuralSkeleton"],
                material_plan=parsed["materialPlan"],
                furnishing_strategy=parsed["furnishingStrategy"],
                technical_notes=parsed.get("technicalNotes", "24mm lens, f/8, photorealistic 8K, natural lighting")
            )
            
        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"[Architect] JSON Parse Error: {e}")
            logger.error(f"[Architect] Raw output: {cleaned_output[:500]}")
            return _create_fallback_output(target_style, preservation_list)
    
    except Exception as error:
        logger.error(f"[Architect] Generation Error: {error}")
        raise Exception(f"Architect generation failed: {str(error)}")


def _create_fallback_output(target_style: str, preservation_list: str) -> ArchitectOutput:
    """Create a fallback output when LLM fails."""
    return ArchitectOutput(
        structural_skeleton=f"A standard living room with {preservation_list or 'typical architectural features'}",
        material_plan=f"Walls in {target_style.lower()} style finish, flooring in complementary material",
        furnishing_strategy=f"{target_style} furniture and decor appropriate to the space",
        technical_notes="24mm lens, f/8, photorealistic 8K, natural lighting"
    )
