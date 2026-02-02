from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from src.api.gemini_imagen import generate_image_t2i, generate_image_i2i
from src.storage.upload import upload_base64_image
from src.vision.triage import analyze_image_triage
from src.utils.download import download_image_smart
import logging


from src.db.messages import save_file_metadata
from src.models.project import ProjectUpdate, ProjectStatus

logger = logging.getLogger(__name__)

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
) -> Dict[str, Any]:
    """
    Generate a photorealistic interior design rendering.
    Supports both creation (T2I) and modification (I2I) modes.
    """
    try:
        negative_prompt = "low quality, blurry, distorted, cartoon"
        
        # MODE: MODIFICATION (I2I)
        if mode == "modification" and source_image_url:
            # Download source image (Smart Download)
            source_bytes, source_mime_type = await download_image_smart(source_image_url)
            
            # VALIDATION: Check if we got an actual image (not error XML/HTML)
            if not source_mime_type.startswith("image/"):
                logger.error(f"[Render] ❌ Downloaded content is NOT an image! MIME: {source_mime_type}")
                logger.error(f"[Render] ❌ First 200 bytes: {source_bytes[:200]}")
                return f"Errore: L'immagine non è accessibile. Il server ha restituito: {source_mime_type}"
            
            logger.info(f"[Render] ✅ Image downloaded: {len(source_bytes)} bytes, MIME: {source_mime_type}")
            
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
                    mime_type=source_mime_type,
                    user_instructions=prompt
                )
                
                # Combine structured fields into final prompt
                full_prompt = f"{arch_output.structural_skeleton} {arch_output.material_plan} {arch_output.furnishing_strategy} {arch_output.technical_notes}"
                
                # ✍️ DEBUG LOG: Log full prompt for verification
                logger.info(f"[Render] 📝 FULL PROMPT (I2I):\n{'-'*40}\n{full_prompt}\n{'-'*40}")
                
            except Exception as arch_error:
                # Fallback to simple prompt if Architect fails
                logger.warning(f"[Render] Architect failed, using fallback: {arch_error}")
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
        
        # 🚀 AUTOMATIC SLIDER UPDATE
        # 🚀 REGISTER FILE & SYNC COVER
        # Instead of manually updating, we save the file metadata. 
        # The hook in save_file_metadata will trigger sync_project_cover automatically.
        try:
            file_meta = {
                "url": image_url,
                "type": "render",
                "name": f"Render {mode_label}",
                "mimeType": f"image/{result.get('mime_type', 'png')}",
                "uploadedBy": "assistant",
                "metadata": {
                    "source_image_id": source_image_url if mode == "modification" else None,
                    "prompt": prompt,
                    "style": style
                }
            }
            
            await save_file_metadata(session_id, file_meta)
            logger.info(f"[Render] 📂 Registered render file in project {session_id}")
            
        except Exception as file_error:
             logger.warning(f"[Render] Failed to register file metadata: {file_error}")

        # Return structured object for Frontend (ToolStatus.tsx)
        return {
            "imageUrl": image_url,
            "description": f"Rendering {mode_label} successfully!",
            "status": "success",
            "mode": mode_label,
            "sourceImageId": source_image_url, # Using URL as ID mapping for now
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "status": "error"
        }

# Tool definition
generate_render = StructuredTool.from_function(
    func=generate_render_wrapper,
    name="generate_render",
    description="Generate photorealistic interior design renderings (creation or modification).",
    args_schema=GenerateRenderInput,
    parse_docstring=True
)
