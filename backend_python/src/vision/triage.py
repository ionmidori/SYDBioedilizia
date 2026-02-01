import os
import logging
import base64
import json
from typing import Dict, Any
from google import genai
from google.genai import types
from src.utils.json_parser import extract_json_response

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

TRIAGE_PROMPT = """You are an expert interior architect and structural engineer analyzing this image.

**CRITICAL: Execute the following Chain of Thought (CoT) process before answering:**

1.  **VISUAL IDENTIFICATION**:
    *   Is this a PHOTO of a room?
    *   Is this a FLOOR PLAN (technical drawing)?
    *   Is this a RENDER or SKETCH?

2.  **TECHNICAL EXTRACTION (Use Python Code)**:
    *   **If Floor Plan**: Use Python to detect contour lines, identifying room labels (OCR) and verifying scale if a scale bar is visible.
    *   **If Photo**: Use Python to detect high-contrast technical labels or overlaid measurements if present.
    *   **Logic Check**: Verify if the detected elements are physically consistent (e.g., a "bedroom" label on a 2m² space is likely an error).

3.  **CONDITIONAL ANALYSIS**:
    *   If simple photo: Focus on style, lighting, materials.
    *   If technical drawing: Focus on dimensions, layout flow, load-bearing walls.

4.  **FINAL OUTPUT GENERATION**:
    *   Synthesize your findings into the JSON structure below.

Provide your analysis:

1. ROOM TYPE: What type of room is this? (e.g., kitchen, living room, bedroom, floor_plan)
2. CURRENT STYLE: Design style or "technical_drawing" if applicable.
3. KEY FEATURES: List 3-5 notable structural or design elements (BE PRECISE).
4. CONDITION: Rate the overall condition (excellent/good/fair/poor).
5. RENOVATION POTENTIAL: Assessment of what could be improved.

**IMPORTANT**: After your reasoning/verification, output the final answer ONLY inside a ```json code block:

```json
{
  "roomType": "...",
  "currentStyle": "...",
  "keyFeatures": ["...", "...", "..."],
  "condition": "...",
  "renovationNotes": "..."
}
```
"""

async def analyze_image_triage(image_data: bytes) -> Dict[str, Any]:
    """
    Perform initial triage analysis on an interior space image.
    Uses google-genai SDK with Gemini 3 Flash.
    """
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY not configured")
    
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        logger.info("Performing triage analysis on image (Gemini 3 Flash)...")
        
        try:
            response = await client.aio.models.generate_content(
                model="gemini-3-flash-preview",
                contents=[
                    types.Content(
                        parts=[
                            types.Part(text=TRIAGE_PROMPT),
                            types.Part(inline_data=types.Blob(mime_type="image/jpeg", data=image_data)),
                        ]
                    )
                ],
                config=types.GenerateContentConfig(
                    tools=[{"code_execution": {}}]
                )
            )
        finally:
             client.close()
        
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


async def analyze_media_triage(media_data: bytes, mime_type: str, metadata: Dict[str, Any] = None) -> Dict[str, Any]:
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
