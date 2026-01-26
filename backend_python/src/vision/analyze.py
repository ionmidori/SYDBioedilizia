import os
import json
import logging
from typing import List, Optional, Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

class RoomWindow(BaseModel):
    position: str
    size: str

class RoomDoor(BaseModel):
    position: str

class RoomAnalysis(BaseModel):
    """
    Room structure analysis result from Gemini Vision.
    """
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
    
    This function uses Gemini to extract detailed structural information,
    useful for technical quoting and precise renovation planning.
    
    Args:
        image_bytes: The source image as bytes
        
    Returns:
        RoomAnalysis object with detailed structural data
    """
    model_name = os.getenv("CHAT_MODEL_VERSION", "gemini-2.5-flash")
    
    logger.info(f"[Vision] Initializing Gemini Vision analysis...")
    logger.info(f"[Vision] Model: {model_name}")
    
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
        # Initialize Gemini LLM
        llm = ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=os.getenv("GEMINI_API_KEY"),
            temperature=0.1 # Low temperature for factual analysis
        )
        
        # Determine content block based on input type
        multimodal_block = {}
        
        # Check if it's a Native File API URI (passed as encoded bytes from download_image_smart)
        is_file_uri = False
        uri_string = ""
        
        try:
            # Attempt to decode as UTF-8 string to check for URI
            candidate_str = image_bytes.decode('utf-8')
            if candidate_str.startswith("https://generativelanguage.googleapis.com") or candidate_str.startswith("files/"):
                is_file_uri = True
                uri_string = candidate_str
        except Exception:
            # decoding failed, definitely binary image data
            pass

        if is_file_uri:
             logger.info(f"[Vision] 🎬 Using Native File API URI: {uri_string}")
             multimodal_block = {
                "type": "file_data",
                "file_data": {"file_uri": uri_string}
             }
        else:
             # Standard Image Bytes -> Base64
             import base64
             base64_image = base64.b64encode(image_bytes).decode('utf-8')
             multimodal_block = {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}
             }
        
        # Create multimodal message
        from langchain_core.messages import HumanMessage
        
        message = HumanMessage(
            content=[
                {"type": "text", "text": system_prompt},
                multimodal_block
            ]
        )
        
        # Monitor time
        import time
        start_time = time.time()
        
        # Generate response (Async)
        response = await llm.ainvoke([message])
        
        elapsed = time.time() - start_time
        logger.info(f"[Vision] ✅ Analysis complete in {elapsed:.1f}s")
        
        raw_output = response.content
        
        if not raw_output:
            raise ValueError("Empty response from Vision API")
            
        # Clean and parse JSON
        cleaned_output = raw_output.replace("```json", "").replace("```", "").strip()
        
        try:
            parsed = json.loads(cleaned_output)
            
            # Validate with Pydantic
            analysis = RoomAnalysis(**parsed)
            
            logger.info(f"[Vision] Analyzed room: {analysis.room_type}, {analysis.approximate_size_sqm}mq")
            return analysis
            
        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"[Vision] JSON Parse Error: {e}")
            logger.error(f"[Vision] Raw output: {cleaned_output[:500]}")
            raise ValueError(f"Failed to parse analysis JSON: {e}")
            
    except Exception as error:
        logger.error(f"[Vision] Error during analysis: {error}")
        raise Exception(f"Room analysis failed: {str(error)}")
