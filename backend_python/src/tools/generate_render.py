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
            async with httpx.AsyncClient() as client:
                response = await client.get(source_image_url)
                source_bytes = response.content
            
            # Analyze source image (optional, for context)
            try:
                analysis = await analyze_image_triage(source_bytes)
                if analysis.get("success"):
                    room_type = analysis.get("roomType", room_type)
            except:
                pass  # Continue without analysis
            
            # Build I2I prompt
            full_prompt = f"Transform this {room_type} to {style} style. {prompt}"
            
            # Generate I2I
            result = await generate_image_i2i(
                source_image_bytes=source_bytes,
                prompt=full_prompt,
                keep_elements=keep_elements or [],
                negative_prompt=negative_prompt
            )
        
        # MODE: CREATION (T2I)
        else:
            full_prompt = f"{style} style {room_type}. {prompt}"
            
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
