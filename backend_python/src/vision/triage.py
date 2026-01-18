import os
import logging
import base64
import json
from typing import Dict, Any
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

TRIAGE_PROMPT = """Analyze this interior space image and provide:

1. ROOM TYPE: What type of room is this? (e.g., kitchen, living room, bedroom)
2. CURRENT STYLE: What is the current design style? (e.g., modern, traditional, industrial)
3. KEY FEATURES: List 3-5 notable structural or design elements
4. CONDITION: Rate the overall condition (excellent/good/fair/poor)
5. RENOVATION POTENTIAL: Brief assessment of what could be improved

Format your response as JSON:
{
  "roomType": "...",
  "currentStyle": "...",
  "keyFeatures": ["...", "...", "..."],
  "condition": "...",
  "renovationNotes": "..."
}
"""

async def analyze_image_triage(image_data: bytes) -> Dict[str, Any]:
    """
    Perform initial triage analysis on an interior space image.
    Uses google-genai SDK with Gemini 2.5 Flash.
    """
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY not configured")
    
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        logger.info("Performing triage analysis on image (Gemini 2.5 Flash)...")
        
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Content(
                    parts=[
                        types.Part(text=TRIAGE_PROMPT),
                        types.Part(inline_data=types.Blob(mime_type="image/jpeg", data=image_data)),
                    ]
                )
            ]
        )
        
        if not response.text:
            raise Exception("No response from vision model")
            
        # Parse JSON response - clean markdown code blocks if present
        text = response.text.replace("```json", "").replace("```", "").strip()
        analysis = json.loads(text)
        
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
