import os
import logging
import base64
from typing import Dict, Any, Optional
import google.generativeai as genai

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

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
    
    Args:
        image_data: Raw image bytes (JPEG, PNG, etc.)
        
    Returns:
        Dictionary with room analysis:
        - roomType: Type of room detected
        - currentStyle: Current design style
        - keyFeatures: List of notable features
        - condition: Overall condition assessment
        - renovationNotes: Recommendations
        
    Raises:
        Exception: If analysis fails
    """
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY not configured")
    
    try:
        # Use Gemini 2.0 Flash for vision analysis
        model = genai.GenerativeModel("gemini-2.0-flash-exp")
        
        # Convert bytes to base64 for Gemini
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        logger.info("Performing triage analysis on image...")
        
        # Generate analysis
        response = model.generate_content([
            TRIAGE_PROMPT,
            {
                "mime_type": "image/jpeg",  # Gemini auto-detects, but specifying helps
                "data": image_base64
            }
        ])
        
        # Extract text response
        if not response.text:
            raise Exception("No response from vision model")
        
        # Parse JSON response
        import json
        analysis = json.loads(response.text.strip())
        
        logger.info(f"Triage complete: {analysis.get('roomType', 'unknown')} room detected")
        
        return {
            "success": True,
            "roomType": analysis.get("roomType", "unknown"),
            "currentStyle": analysis.get("currentStyle", "contemporary"),
            "keyFeatures": analysis.get("keyFeatures", []),
            "condition": analysis.get("condition", "good"),
            "renovationNotes": analysis.get("renovationNotes", "")
        }
        
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse triage response: {e}")
        # Fallback: return basic analysis
        return {
            "success": False,
            "roomType": "living space",
            "currentStyle": "contemporary",
            "keyFeatures": ["existing layout"],
            "condition": "good",
            "renovationNotes": "Unable to perform detailed analysis"
        }
    except Exception as e:
        logger.error(f"Triage analysis failed: {str(e)}", exc_info=True)
        raise Exception(f"Vision analysis failed: {str(e)}")
