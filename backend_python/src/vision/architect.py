import base64
import json
import logging
from typing import List, Optional
from google import genai
from google.genai import types as genai_types
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
    """
    if keep_elements is None:
        keep_elements = []

    model_name = "gemini-2.5-flash"
    logger.info(f"[Architect] Building narrative plan (Style: {target_style}, Keep: {len(keep_elements)})...")

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
1. For NEW elements (furniture, decor, changed walls): Apply the requested style strictly.
2. For EXISTING STRUCTURAL elements kept: DETECT current material/color, describe as "RESTORED" or "REFINISHED".

OUTPUT RULE:
In the 'materialPlan', for existing structures, write: "The existing [Structure Name] is preserved in its original [Color/Material] tone, refinished to a pristine condition."

---

FIELD 3: furnishingStrategy (New Furniture & Decor)

Describe furniture/decor for "{target_style}". Be EXTREMELY specific with materials and positioning.

---

FIELD 4: technicalNotes (Lighting & Camera)

Brief technical specs.

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
        client = genai.Client(api_key=settings.api_key)
        base64_image = base64.b64encode(image_bytes).decode('utf-8')

        response = await client.aio.models.generate_content(
            model=model_name,
            contents=[genai_types.Content(parts=[
                genai_types.Part(text=system_prompt),
                genai_types.Part(inline_data=genai_types.Blob(
                    mime_type=mime_type,
                    data=base64_image,
                )),
            ])],
            config=genai_types.GenerateContentConfig(temperature=0.4),
        )

        raw_output = response.text or ""
        if not raw_output:
            logger.warning("[Architect] No output, using fallback")
            return _create_fallback_output(target_style, preservation_list)

        cleaned_output = raw_output.replace("```json", "").replace("```", "").strip()

        try:
            parsed = json.loads(cleaned_output)
            if not all(k in parsed for k in ["structuralSkeleton", "materialPlan", "furnishingStrategy"]):
                raise ValueError("Missing required fields")

            logger.info("[Architect] Structured Output Generated")
            return ArchitectOutput(
                structural_skeleton=parsed["structuralSkeleton"],
                material_plan=parsed["materialPlan"],
                furnishing_strategy=parsed["furnishingStrategy"],
                technical_notes=parsed.get("technicalNotes", "24mm lens, f/8, photorealistic 8K, natural lighting")
            )

        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"[Architect] JSON Parse Error: {e}")
            return _create_fallback_output(target_style, preservation_list)

    except Exception as error:
        logger.error(f"[Architect] Generation Error: {error}")
        raise Exception(f"Architect generation failed: {str(error)}")


def _create_fallback_output(target_style: str, preservation_list: str) -> ArchitectOutput:
    return ArchitectOutput(
        structural_skeleton=f"A standard living room with {preservation_list or 'typical architectural features'}",
        material_plan=f"Walls in {target_style.lower()} style finish, flooring in complementary material",
        furnishing_strategy=f"{target_style} furniture and decor appropriate to the space",
        technical_notes="24mm lens, f/8, photorealistic 8K, natural lighting"
    )
