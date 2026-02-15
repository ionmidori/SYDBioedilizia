import os
import logging
import asyncio
import base64
from typing import Optional, Dict, Any, List
from google import genai
from google.genai import types
from google.api_core import exceptions as google_exceptions

from src.core.config import settings

logger = logging.getLogger(__name__)

# Configure Gemini API via Settings (Robust)
# GEMINI_API_KEY is now accessed via settings.api_key which handles fallback and validation

# Create client with API key (Lazy)
_client = None

def _get_client():
    """Lazy-load GenAI client."""
    global _client
    if _client is None:
        try:
            api_key = settings.api_key
            _client = genai.Client(api_key=api_key)
        except ValueError as e:
            raise Exception(f"Configuration Error: {e}")
    return _client

# Models for image generation
T2I_MODEL = "gemini-3-pro-image-preview"  # User requested: High Quality T2I
I2I_MODEL = "gemini-3-pro-image-preview"  # User requested: Gemini 3 Pro Image (Multimodal I2I)


async def generate_image_t2i(
    prompt: str,
    negative_prompt: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate an interior design image from text using Gemini 2.0 Flash.
    
    Args:
        prompt: Detailed description of the desired interior design
        negative_prompt: Optional constraints (what to avoid)
        
    Returns:
        Dictionary with base64 encoded image and metadata
        
    Raises:
        Exception: If API call fails or no API key configured
    """
    # Create fresh client for this request (avoids Event Loop conflicts in sync wrappers)
    # Create fresh client for this request (avoids Event Loop conflicts in sync wrappers)
    try:
        api_key = settings.api_key
        client = genai.Client(api_key=api_key)
    except ValueError as e:
        raise Exception(f"Configuration Error: {e}")
    
    try:
        # Build full prompt
        safety_instruction = (
            "Generate a photorealistic interior design image. "
            "Focus on architectural accuracy, lighting quality, and material realism."
        )
        
        full_prompt = f"{safety_instruction}\n\n{prompt}"
        if negative_prompt:
            full_prompt += f"\n\n[AVOID]: {negative_prompt}"
        
        logger.info(f"Generating T2I image with prompt length: {len(full_prompt)} chars")
        
        # Generate content with new SDK (Async)
        response = await client.aio.models.generate_content(
            model=T2I_MODEL,
            contents=full_prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
                temperature=0.4,
            )
        )
        
        # Extract image from response
        if not response.candidates or not response.candidates[0].content.parts:
            raise Exception("No content returned from Gemini API")
        
        image_part = None
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.mime_type.startswith('image/'):
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
                "model": T2I_MODEL,
                "mode": "text-to-image"
            }
        }
        
    except google_exceptions.InvalidArgument as e:
        logger.error(f"[Gemini] ❌ Invalid Argument (400): {e}")
        raise Exception("Errore nell'immagine o nel prompt. Riprova con parametri diversi.")
    except google_exceptions.ResourceExhausted as e:
        logger.error(f"[Gemini] ❌ Quota Exceeded (429): {e}")
        raise Exception("Il sistema è molto carico. Riprova tra qualcche minuto.")
    except Exception as e:
        logger.error(f"[Gemini] ❌ T2I generation failed: {str(e)}", exc_info=True)
        raise Exception(f"Errore di sistema nella generazione immagine: {str(e)}")
    finally:
        # Crucial: Close the client to release resources before loop closes
        client.close()


async def generate_image_i2i(
    source_image_bytes: bytes,
    prompt: str,
    keep_elements: List[str] = None,
    negative_prompt: Optional[str] = None,
    mime_type: str = "image/jpeg"
) -> Dict[str, Any]:
    """
    Generate an interior design image from an existing image using Gemini (I2I mode).
    
    Args:
        source_image_bytes: Original room image as bytes        
        prompt: Description of the desired renovation/transformation
        keep_elements: Optional list of elements to preserve
        negative_prompt: Optional constraints (what to avoid)
        mime_type: MIME type of the source image (default: image/jpeg)
        
    Returns:
        Dictionary with base64 encoded image and metadata
        
    Raises:
        Exception: If API call fails or no API key configured
    """
    # Create fresh client for this request
    # Create fresh client for this request
    try:
        api_key = settings.api_key
        client = genai.Client(api_key=api_key)
    except ValueError as e:
        raise Exception(f"Configuration Error: {e}")
    
    try:
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
        
        # Build multimodal content - Aligned with working triage.py
        contents = [
            types.Content(
                parts=[
                    types.Part(text=full_prompt),
                    types.Part(inline_data=types.Blob(mime_type=mime_type, data=source_image_bytes))
                ]
            )
        ]
        
        logger.info(f"[Gemini] ⏳ Sending I2I request line... model={I2I_MODEL}")
        
        # Call API Async with explicit configuration and timeout
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=I2I_MODEL,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE", "TEXT"],
                        temperature=0.4,
                    )
                ),
                timeout=90.0  # Generative tasks can be slow, 90s is safe
            )
        except asyncio.TimeoutError:
            logger.error("[Gemini] ❌ I2I Request timed out after 90s")
            raise Exception("La generazione dell'immagine ha impiegato troppo tempo. Riprova.")
        
        logger.info("[Gemini] ✅ API Response received!")
        
        if not response.candidates:
             raise Exception("No candidates returned from API")
             
        if not response.candidates[0].content.parts:
             raise Exception("Candidate has no parts")
        
        image_base64 = None
        returned_mime_type = mime_type
        
        for part in response.candidates[0].content.parts:
            if part.text:
                logger.info(f"[Gemini] Received text part: {part.text[:100]}...")
            
            if part.inline_data and part.inline_data.mime_type.startswith('image/'):
                 logger.info(f"[Gemini] Found IMAGE part ({part.inline_data.mime_type})")
                 # SDK returns bytes in part.inline_data.data
                 image_base64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                 returned_mime_type = part.inline_data.mime_type
                 break
        
        if not image_base64:
            raise Exception("No image found in API response parts")
        
        image_size_kb = len(image_base64) * 0.75 / 1024
        logger.info(f"I2I generation complete! Image size: ~{image_size_kb:.2f} KB")
        
        return {
            "success": True,
            "image_base64": image_base64,
            "mime_type": returned_mime_type,
            "metadata": {
                "model": I2I_MODEL,
                "mode": "image-to-image"
            }
        }
        
    except google_exceptions.InvalidArgument as e:
        logger.error(f"[Gemini] ❌ Invalid Argument (400): {e}")
        raise Exception("L'immagine caricata non è valida o il prompt è incorretto.")
    except google_exceptions.ResourceExhausted as e:
        logger.error(f"[Gemini] ❌ Quota Exceeded (429): {e}")
        raise Exception("Server sovraccarico. Riprova tra poco.")
    except Exception as e:
        logger.error(f"[Gemini] ❌ I2I generation failed: {str(e)}", exc_info=True)
        raise Exception(f"Errore imprevisto durante la generazione: {str(e)}")
    finally:
        # Crucial: Close the client to release resources
        client.close()
