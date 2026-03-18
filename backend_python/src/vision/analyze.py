import base64
import json
import logging
import time
from typing import List
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, Field
from src.core.config import settings

logger = logging.getLogger(__name__)

class RoomWindow(BaseModel):
    model_config = {"extra": "forbid"}
    position: str
    size: str

class RoomDoor(BaseModel):
    model_config = {"extra": "forbid"}
    position: str

class RoomAnalysis(BaseModel):
    """
    Room structure analysis result from Gemini Vision.
    """
    model_config = {"extra": "forbid"}
    room_type: str = Field(..., description="living_room, bedroom, kitchen, etc.")
    approximate_size_sqm: int = Field(..., description="Estimated room size in square meters")
    architectural_features: List[str] = Field(..., description="List of visible fixed features")
    flooring_type: str = Field(..., description="Material of the floor")
    wall_color: str = Field(..., description="Dominant wall color")
    ceiling_type: str = Field(..., description="flat, sloped, vaulted, exposed_beams")
    windows: List[RoomWindow] = Field(default_factory=list, description="List of windows")
    doors: List[RoomDoor] = Field(default_factory=list, description="List of doors")
    special_features: List[str] = Field(default_factory=list, description="fireplace, staircase, etc.")


async def analyze_room_structure(image_bytes: bytes) -> RoomAnalysis:
    """
    Analyze room structure from uploaded photo using Gemini Vision.
    """
    model_name = "gemini-3.1-flash-lite-preview"

    logger.info(f"[Vision] Initializing Gemini Vision analysis with {model_name}...")

    system_prompt = """You are a professional interior designer and architect. Analyze this interior photo and extract precise structural and architectural information.

Return ONLY a valid JSON object with this EXACT structure (no markdown, no explanation):

{
    "room_type": "living_room|bedroom|kitchen|bathroom|dining_room|office",
    "approximate_size_sqm": 25,
    "architectural_features": [
        "wooden staircase on left wall corner",
        "stone-clad fireplace centered on back wall",
        "slanted ceiling with exposed beams"
    ],
    "flooring_type": "terracotta tiles|hardwood|marble|carpet|concrete|laminate",
    "wall_color": "white|beige|gray|cream|...",
    "ceiling_type": "flat|sloped|vaulted|exposed_beams",
    "windows": [
        {"position": "right wall center", "size": "large|medium|small"}
    ],
    "doors": [
        {"position": "back wall left"}
    ],
    "special_features": ["fireplace", "staircase", "built-in_shelving", "exposed_brick"]
}

CRITICAL RULES:
1. Be EXTREMELY precise about positions: use "left wall", "right wall", "center", "back wall", "corner"
2. Include ALL visible architectural elements
3. Be specific about materials (e.g., "terracotta tiles" not just "tiles")
4. Return ONLY the JSON object, nothing else
5. Ensure the JSON is valid and parseable"""

    try:
        client = genai.Client(api_key=settings.api_key)

        # Determine content part based on input type
        try:
            candidate_str = image_bytes.decode('utf-8')
            if candidate_str.startswith("https://generativelanguage.googleapis.com") or candidate_str.startswith("files/"):
                logger.info(f"[Vision] Using Native File API URI: {candidate_str}")
                image_part = genai_types.Part(file_data=genai_types.FileData(file_uri=candidate_str))
            else:
                raise ValueError("not a URI")
        except Exception:
            image_part = genai_types.Part(
                inline_data=genai_types.Blob(
                    mime_type="image/jpeg",
                    data=base64.b64encode(image_bytes).decode('utf-8'),
                )
            )

        start_time = time.time()
        response = await client.aio.models.generate_content(
            model=model_name,
            contents=[genai_types.Content(parts=[
                genai_types.Part(text=system_prompt),
                image_part,
            ])],
            config=genai_types.GenerateContentConfig(temperature=0.1),
        )
        elapsed = time.time() - start_time
        logger.info(f"[Vision] Analysis complete in {elapsed:.1f}s")

        raw_output = response.text or ""
        if not raw_output:
            raise ValueError("Empty response from Vision API")

        cleaned_output = raw_output.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned_output)
        analysis = RoomAnalysis(**parsed)
        logger.info(f"[Vision] Analyzed room: {analysis.room_type}, {analysis.approximate_size_sqm}mq")
        return analysis

    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"[Vision] JSON Parse Error: {e}")
        raise ValueError(f"Failed to parse analysis JSON: {e}")
    except Exception as error:
        logger.error(f"[Vision] Error during analysis: {error}")
        raise Exception(f"Room analysis failed: {str(error)}")
