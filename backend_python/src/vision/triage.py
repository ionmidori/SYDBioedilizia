import asyncio
import logging
from typing import Any

from google.genai import types
from src.core.models import ModelRole, build_thinking_config, get_genai_client, get_model_id
from src.utils.json_parser import extract_json_response

logger = logging.getLogger(__name__)

_TRIAGE_TIMEOUT_SECONDS = 20.0

TRIAGE_PROMPT = """You are an expert interior architect and structural engineer analyzing this image.

Classify the image (interior photo, floor plan, or render/sketch) and extract:
1. ROOM TYPE: e.g., kitchen, living room, bedroom, bathroom, floor_plan.
2. CURRENT STYLE: Design style or "technical_drawing" if applicable.
3. KEY FEATURES: 3-5 notable structural or design elements (be precise).
4. CONDITION: Overall condition (excellent/good/fair/poor).
5. RENOVATION NOTES: Concise assessment of what could be improved.

Return ONLY a valid JSON object matching this schema:
{
  "roomType": "...",
  "currentStyle": "...",
  "keyFeatures": ["...", "...", "..."],
  "condition": "...",
  "renovationNotes": "..."
}
"""

async def analyze_image_triage(image_data: bytes) -> dict[str, Any]:
    """
    Perform initial triage analysis on an interior space image.
    Uses google-genai SDK with Gemini 3 Flash.
    """
    try:
        client = get_genai_client()

        logger.info("Performing triage analysis on image...")

        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=get_model_id(ModelRole.VISION),
                contents=[
                    types.Content(role="user",
                        parts=[
                            types.Part(text=TRIAGE_PROMPT),
                            types.Part(inline_data=types.Blob(mime_type="image/jpeg", data=image_data)),
                        ]
                    )
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    thinking_config=build_thinking_config(ModelRole.VISION),
                    http_options=types.HttpOptions(timeout=int(_TRIAGE_TIMEOUT_SECONDS * 1000)),
                ),
            ),
            timeout=_TRIAGE_TIMEOUT_SECONDS,
        )

        if not response.text:
            raise Exception("No response from vision model")

        # Parse JSON response using robust extractor (handles CoT + Code)
        analysis = extract_json_response(response.text)

        if not analysis:
            raise Exception("Failed to extract valid JSON from model response")

        logger.info(f"Triage complete: {analysis.get('roomType', 'unknown')} room detected")

        return {
            "success": True,
            "roomType": analysis.get("roomType", "unknown"),
            "currentStyle": analysis.get("currentStyle", "contemporary"),
            "keyFeatures": analysis.get("keyFeatures", []),
            "condition": analysis.get("condition", "good"),
            "renovationNotes": analysis.get("renovationNotes", "")
        }

    except Exception as e:
        logger.error(f"Triage analysis failed: {str(e)}", exc_info=True)
        # Fallback: return basic analysis
        return {
            "success": False,
            "roomType": "living space",
            "currentStyle": "contemporary",
            "keyFeatures": ["existing layout"],
            "condition": "good",
            "renovationNotes": f"Unable to perform detailed analysis: {str(e)}"
        }


async def analyze_media_triage(media_data: bytes, mime_type: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Unified entry point for media triage analysis.

    Routes to appropriate handler based on MIME type:
    - image/* -> analyze_image_triage()
    - video/* -> analyze_video_triage()

    Args:
        media_data: Raw media file bytes
        mime_type: MIME type (e.g., 'image/jpeg', 'video/mp4')
        metadata: Optional metadata (e.g. trimRange)

    Returns:
        Dict with triage analysis results

    Raises:
        ValueError: If MIME type is not supported
    """
    logger.info(f"Media triage requested for type: {mime_type}")

    # Route based on MIME type
    if mime_type.startswith("image/"):
        return await analyze_image_triage(media_data)

    elif mime_type.startswith("video/"):
        # Import video module only when needed (avoid circular imports)
        from src.vision.video_triage import analyze_video_triage
        result = await analyze_video_triage(video_data=media_data, metadata=metadata)
        # Convert VideoTriageResult to dict for compatibility
        return result.model_dump()

    else:
        raise ValueError(f"Unsupported media type: {mime_type}. Only image/* and video/* are supported.")
