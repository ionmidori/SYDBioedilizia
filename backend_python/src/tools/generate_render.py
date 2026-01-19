from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from typing import Optional
from src.api.gemini_imagen import generate_image_t2i, generate_image_i2i
from src.storage.upload import upload_base64_image
from src.vision.triage import analyze_image_triage
import httpx

class GenerateRenderInput(BaseModel):
    """Input schema for generate_render tool."""
    prompt: str = Field(
        ..., 
        description="Detailed description of the interior design to generate"
    )
    room_type: str = Field(
        ..., 
        description="Type of room (e.g., 'kitchen', 'living room')"
    )
    style: str = Field(
        ..., 
        description="Design style (e.g., 'modern', 'industrial')"
    )
    mode: str = Field(
        default="creation",
        description="creation (new design) or modification (transform existing photo)"
    )
    source_image_url: Optional[str] = Field(
        None,
        description="URL of user's room photo (required for modification mode)"
    )
    keep_elements: Optional[list[str]] = Field(
        default_factory=list,
        description="Elements to preserve in modification mode"
    )

async def generate_render_wrapper(
    prompt: str,
    room_type: str,
    style: str,
    session_id: str,
    mode: str = "creation",
    source_image_url: Optional[str] = None,
    keep_elements: Optional[list[str]] = None
) -> str:
    """
    Generate a photorealistic interior design rendering.
    Supports both creation (T2I) and modification (I2I) modes.
    """
    try:
        negative_prompt = "low quality, blurry, distorted, cartoon"
        
        # MODE: MODIFICATION (I2I)
        if mode == "modification" and source_image_url:
            # Download source image
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(source_image_url)
                source_bytes = response.content
                source_mime_type = response.headers.get("content-type", "image/jpeg")
            
            # VALIDATION: Check if we got an actual image (not error XML/HTML)
            if not source_mime_type.startswith("image/"):
                logging.error(f"[Render] ❌ Downloaded content is NOT an image! MIME: {source_mime_type}")
                logging.error(f"[Render] ❌ First 200 bytes: {source_bytes[:200]}")
                return f"Errore: L'immagine non è accessibile. Il server ha restituito: {source_mime_type}"
            
            logging.info(f"[Render] ✅ Image downloaded: {len(source_bytes)} bytes, MIME: {source_mime_type}")
            
            # Analyze source image (optional, for context)
            try:
                analysis = await analyze_image_triage(source_bytes)
                if analysis.get("success"):
                    room_type = analysis.get("roomType", room_type)
            except:
                pass  # Continue without analysis
            
            # 🎨 USE ARCHITECT FOR ENHANCED PROMPT GENERATION
            try:
                from src.vision.architect import generate_architectural_prompt
                
                arch_output = await generate_architectural_prompt(
                    image_bytes=source_bytes,
                    target_style=style,
                    keep_elements=keep_elements or [],
                    mime_type=source_mime_type
                )
                
                # Combine structured fields into final prompt
                full_prompt = f"{arch_output.structural_skeleton} {arch_output.material_plan} {arch_output.furnishing_strategy} {arch_output.technical_notes}"
                
            except Exception as arch_error:
                # Fallback to simple prompt if Architect fails
                import logging
                logging.warning(f"[Render] Architect failed, using fallback: {arch_error}")
                full_prompt = f"Transform this {room_type} to {style} style. {prompt}"
            
            # Generate I2I
            result = await generate_image_i2i(
                source_image_bytes=source_bytes,
                prompt=full_prompt,
                keep_elements=keep_elements or [],
                negative_prompt=negative_prompt,
                mime_type=source_mime_type
            )
        
        # MODE: CREATION (T2I)
        else:
            # Enhanced T2I prompt matching legacy quality
            full_prompt = (
                f"Photorealistic interior design rendering of a {room_type}, {style} style. "
                f"{prompt}. "
                "Professional architectural visualization quality with natural lighting, "
                "realistic materials and textures, proper perspective, modern high-end interior design, "
                "clean composition, 4K quality."
            )
            
            result = await generate_image_t2i(
                prompt=full_prompt,
                negative_prompt=negative_prompt
            )
        
        if not result["success"]:
            return "Failed to generate image. Please try again."
        
        # Upload to Firebase Storage
        image_url = upload_base64_image(
            base64_data=f"data:{result['mime_type']};base64,{result['image_base64']}",
            session_id=session_id,
            prefix="renders"
        )
        
        mode_label = "transformed" if mode == "modification" else "generated"
        return f"✅ Rendering {mode_label} successfully!\n\n![Design]({image_url})\n\nWhat do you think?"
        
    except Exception as e:
        return f"Error generating render: {str(e)}"

# Tool definition
GENERATE_RENDER_TOOL_DEF = {
    "name": "generate_render",
    "description": "Generate photorealistic interior design renderings (creation or modification).",
    "args_schema": GenerateRenderInput
}
