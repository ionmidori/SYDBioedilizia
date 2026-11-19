import asyncio
import io
import json
import logging

import httpx
from fastapi.concurrency import run_in_threadpool
from google.api_core import exceptions as gapi_exceptions
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from PIL import Image, ImageOps
from pydantic import BaseModel
from src.core.models import ModelRole, build_thinking_config, get_genai_client, get_model_id

logger = logging.getLogger(__name__)

_ARCHITECT_TIMEOUT_SECONDS = 12.0
_ARCHITECT_MAX_IMAGE_DIM = 1024


def _downscale_for_architect_sync(
    image_bytes: bytes,
    mime_type: str,
    max_dim: int = _ARCHITECT_MAX_IMAGE_DIM,
) -> tuple[bytes, str]:
    """Resize large uploads to <=1024px JPEG so Vision prompt-building stays fast."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as raw:
            if max(raw.size) <= max_dim and mime_type == "image/jpeg":
                return image_bytes, mime_type
            ImageOps.exif_transpose(raw, in_place=True)
            converted: Image.Image | None = None
            try:
                if raw.mode in ("RGBA", "LA") or (raw.mode == "P" and "transparency" in raw.info):
                    rgba = raw.convert("RGBA")
                    try:
                        bg = Image.new("RGB", rgba.size, (255, 255, 255))
                        bg.paste(rgba, mask=rgba.split()[-1])
                        converted = bg
                    finally:
                        rgba.close()
                    work = converted
                elif raw.mode != "RGB":
                    converted = raw.convert("RGB")
                    work = converted
                else:
                    work = raw

                if max(work.size) > max_dim:
                    work.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

                out = io.BytesIO()
                work.save(out, format="JPEG", quality=82, optimize=True)
                return out.getvalue(), "image/jpeg"
            finally:
                if converted is not None:
                    converted.close()
    except (OSError, ValueError, SyntaxError, EOFError, Image.DecompressionBombError):
        return image_bytes, mime_type

class ArchitectOutput(BaseModel):
    """
    Structured output from the Architect for narrative prompt generation.
    Uses the "Skeleton & Skin" methodology: neutral geometry + material overlay + furnishing.
    """
    model_config = {"extra": "ignore"}
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
    keep_elements: list[str] | None = None,
    mime_type: str = "image/jpeg",
    user_instructions: str = ""
) -> ArchitectOutput:
    """
    The Architect: Generates a narrative-based structural plan for image generation.
    """
    if keep_elements is None:
        keep_elements = []

    model_name = get_model_id(ModelRole.ARCHITECT)
    logger.info(f"[Architect] Building narrative plan (Style: {target_style}, Keep: {len(keep_elements)}, Model: {model_name})...")

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
        client = get_genai_client()
        prepared_bytes, prepared_mime = await run_in_threadpool(
            _downscale_for_architect_sync, image_bytes, mime_type
        )

        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=model_name,
                contents=[genai_types.Content(role="user", parts=[
                    genai_types.Part(text=system_prompt),
                    genai_types.Part(inline_data=genai_types.Blob(
                        mime_type=prepared_mime,
                        # genai Blob.data wants RAW bytes (the SDK base64-encodes it
                        # for the wire); a base64 str would double-encode.
                        data=prepared_bytes,
                    )),
                ])],
                config=genai_types.GenerateContentConfig(
                    temperature=0.4,
                    response_mime_type="application/json",
                    thinking_config=build_thinking_config(ModelRole.ARCHITECT),
                    http_options=genai_types.HttpOptions(timeout=int(_ARCHITECT_TIMEOUT_SECONDS * 1000)),
                ),
            ),
            timeout=_ARCHITECT_TIMEOUT_SECONDS,
        )

        raw_output = response.text or ""
        if not raw_output:
            logger.warning("[Architect] No output, using fallback")
            return _create_fallback_output(target_style, keep_elements, user_instructions)

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
            return _create_fallback_output(target_style, keep_elements, user_instructions)

    except (TimeoutError, httpx.TimeoutException, gapi_exceptions.DeadlineExceeded):
        logger.warning(f"[Architect] Timed out after {_ARCHITECT_TIMEOUT_SECONDS}s, using fallback")
        return _create_fallback_output(target_style, keep_elements, user_instructions)
    except genai_errors.ServerError as error:
        if error.code == 504 or "DEADLINE_EXCEEDED" in str(error):
            logger.warning(f"[Architect] Remote deadline exceeded ({error}), using fallback")
            return _create_fallback_output(target_style, keep_elements, user_instructions)
        logger.error(f"[Architect] Generation Error: {error}")
        raise Exception(f"Architect generation failed: {str(error)}") from error
    except Exception as error:
        logger.error(f"[Architect] Generation Error: {error}")
        raise Exception(f"Architect generation failed: {str(error)}") from error


def _create_fallback_output(
    target_style: str,
    keep_elements: list[str] | str | None = None,
    user_instructions: str = "",
) -> ArchitectOutput:
    if isinstance(keep_elements, list):
        kept = ", ".join(e.strip() for e in keep_elements if e and e.strip())
    else:
        kept = (keep_elements or "").strip()
        if kept.lower().startswith("none specified"):
            kept = ""

    skeleton = (
        f"The existing room preserving its original layout and {kept}"
        if kept
        else "The existing room preserving its exact architectural layout, walls, windows, and perspective"
    )
    extra = f" Specific client requests: {user_instructions.strip()}" if user_instructions.strip() else ""
    return ArchitectOutput(
        structural_skeleton=skeleton,
        material_plan=f"Walls and surfaces refinished in {target_style.lower()} style with complementary flooring",
        furnishing_strategy=f"{target_style} furniture and decor appropriate to the space.{extra}",
        technical_notes="24mm lens, f/8, photorealistic 8K, natural lighting",
    )
