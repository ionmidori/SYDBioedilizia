import os
import logging
import base64
from typing import Optional, Dict, Any
import google.generativeai as genai
from PIL import Image
import io

logger = logging.getLogger(__name__)

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

async def generate_image_t2i(
    prompt: str,
    negative_prompt: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate an interior design image from text using Gemini 2.0 Flash Experimental.
    
    Args:
        prompt: Detailed description of the desired interior design
        negative_prompt: Optional constraints (what to avoid)
        
    Returns:
        Dictionary with base64 encoded image and metadata
        
    Raises:
        Exception: If API call fails or no API key configured
    """
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY not configured in environment")
    
    try:
        # Use Gemini 2.0 Flash Experimental (imagen-3.0-generate-001 via Gemini)
        model = genai.GenerativeModel("gemini-2.0-flash-exp")
        
        # Build full prompt
        safety_instruction = (
            "Generate a photorealistic interior design image. "
            "Focus on architectural accuracy, lighting quality, and material realism."
        )
        
        full_prompt = f"{safety_instruction}\n\n{prompt}"
        if negative_prompt:
            full_prompt += f"\n\n[AVOID]: {negative_prompt}"
        
        logger.info(f"Generating T2I image with prompt length: {len(full_prompt)} chars")
        
        # Generate content
        response = model.generate_content(
            full_prompt,
            generation_config=genai.GenerationConfig(
                response_modalities=["image"],
                temperature=0.4,  # Lower for more predictable architectural results
            )
        )
        
        # Extract image from response
        if not response.parts:
            raise Exception("No content returned from Gemini API")
        
        image_part = None
        for part in response.parts:
            if hasattr(part, 'inline_data') and part.inline_data:
                if part.inline_data.mime_type.startswith('image/'):
                    image_part = part
                    break
        
        if not image_part:
            raise Exception("No image found in API response")
        
        # Get base64 image data
        image_base64 = base64.b64encode(image_part.inline_data.data).decode('utf-8')
        
        image_size_kb = len(image_base64) * 0.75 / 1024
        logger.info(f"T2I generation complete! Image size: ~{image_size_kb:.2f} KB")
        
        return {
            "success": True,
            "image_base64": image_base64,
            "mime_type": image_part.inline_data.mime_type,
            "metadata": {
                "model": "gemini-2.0-flash-exp",
                "mode": "text-to-image"
            }
        }
        
    except Exception as e:
        logger.error(f"T2I generation failed: {str(e)}", exc_info=True)
        raise Exception(f"Image generation failed: {str(e)}")


async def generate_image_i2i(
    source_image_bytes: bytes,
    prompt: str,
    keep_elements: list[str] = None,
    negative_prompt: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate an interior design image from an existing image using Gemini (I2I mode).
    
    Args:
        source_image_bytes: Original room image as bytes        
        prompt: Description of the desired renovation/transformation
        keep_elements: Optional list of elements to preserve
        negative_prompt: Optional constraints (what to avoid)
        
    Returns:
        Dictionary with base64 encoded image and metadata
        
    Raises:
        Exception: If API call fails or no API key configured
    """
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY not configured in environment")
    
    try:
        model = genai.GenerativeModel("gemini-2.0-flash-exp")
        
        # Build I2I prompt with geometry preservation instructions
        preservation_note = ""
        if keep_elements:
            preservation_note = f"\n\nIMPORTANT: Preserve these elements: {', '.join(keep_elements)}"
        
        geometric_instruction = (
            "[INSTRUCTION: Use the attached image as the strict geometric base. "
            "Maintain all structural lines, room layout, and spatial relationships exactly. "
            "Transform ONLY the surfaces, materials, colors, lighting, and furnishings "
            "according to the description below.]"
        )
        
        full_prompt = f"{geometric_instruction}\n\n{prompt}{preservation_note}"
        if negative_prompt:
            full_prompt += f"\n\n[AVOID]: {negative_prompt}"
        
        logger.info(f"Generating I2I image with prompt length: {len(full_prompt)} chars")
        
        # Convert source image to base64
        source_base64 = base64.b64encode(source_image_bytes).decode('utf-8')
        
        # Generate content with both prompt and source image
        response = model.generate_content(
            [
                full_prompt,
                {
                    "mime_type": "image/jpeg",
                    "data": source_base64
                }
            ],
            generation_config=genai.GenerationConfig(
                response_modalities=["image"],
                temperature=0.4,
            )
        )
        
        # Extract image from response
        if not response.parts:
            raise Exception("No content returned from Gemini API")
        
        image_part = None
        for part in response.parts:
            if hasattr(part, 'inline_data') and part.inline_data:
                if part.inline_data.mime_type.startswith('image/'):
                    image_part = part
                    break
        
        if not image_part:
            raise Exception("No image found in API response")
        
        image_base64 = base64.b64encode(image_part.inline_data.data).decode('utf-8')
        
        image_size_kb = len(image_base64) * 0.75 / 1024
        logger.info(f"I2I generation complete! Image size: ~{image_size_kb:.2f} KB")
        
        return {
            "success": True,
            "image_base64": image_base64,
            "mime_type": image_part.inline_data.mime_type,
            "metadata": {
                "model": "gemini-2.0-flash-exp",
                "mode": "image-to-image"
            }
        }
        
    except Exception as e:
        logger.error(f"I2I generation failed: {str(e)}", exc_info=True)
        raise Exception(f"Image to image generation failed: {str(e)}")
