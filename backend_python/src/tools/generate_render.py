import asyncio
import logging
from typing import Any

from pydantic import BaseModel, Field
from src.api.gemini_imagen import generate_image_i2i, generate_image_t2i
from src.db.projects.constants import FILE_ROOM_FIELD
from src.repositories.conversation_repository import get_conversation_repository
from src.repositories.room_repository import get_room_repository
from src.storage.upload import upload_base64_image as _upload_base64_image_sync
from src.utils.download import download_image_smart, session_media_path, storage_path_from_url
from src.vision.triage import analyze_image_triage

logger = logging.getLogger(__name__)

class GenerateRenderInput(BaseModel):
    """Input schema for generate_render tool."""
    model_config = {"extra": "forbid"}
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
    source_image_url: str | None = Field(
        None,
        description="URL of user's room photo (required for modification mode)"
    )
    keep_elements: list[str] | None = Field(
        default_factory=list,
        description="Elements to preserve in modification mode"
    )

async def generate_render_wrapper(
    prompt: str,
    room_type: str,
    style: str,
    session_id: str,
    mode: str = "creation",
    source_image_url: str | None = None,
    keep_elements: list[str] | None = None
) -> dict[str, Any]:
    """
    Generate a photorealistic interior design rendering.
    Supports both creation (T2I) and modification (I2I) modes.
    """
    try:
        negative_prompt = "low quality, blurry, distorted, cartoon"

        # MODE: MODIFICATION (I2I)
        if mode == "modification" and source_image_url:
            # Download source image (Smart Download)
            source_bytes, source_mime_type = await download_image_smart(
                source_image_url, owner_session_id=session_id
            )

            # VALIDATION: Check if we got an actual image (not error XML/HTML)
            if not source_mime_type.startswith("image/"):
                logger.error(f"[Render] ❌ Downloaded content is NOT an image! MIME: {source_mime_type}")
                logger.error(f"[Render] ❌ First 200 bytes: {source_bytes[:200]}")
                # Return an error dict (not a bare str): the ADK tool wrapper reads
                # result.get(...) / result["imageUrl"], so a str would crash it.
                return {
                    "status": "error",
                    "message": f"Errore: L'immagine non è accessibile. Il server ha restituito: {source_mime_type}",
                }

            logger.info(f"[Render] ✅ Image downloaded: {len(source_bytes)} bytes, MIME: {source_mime_type}")

            # Analyze source image (optional, for context)
            try:
                analysis = await analyze_image_triage(source_bytes)
                if analysis.get("success"):
                    room_type = analysis.get("roomType", room_type)
            except Exception:  # noqa: BLE001
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

            except Exception as arch_error:  # noqa: BLE001
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
            return {"status": "error", "message": "Failed to generate image. Please try again."}

        # Upload to Firebase Storage (sync SDK — offload to thread to avoid blocking event loop)
        image_url = await asyncio.to_thread(
            _upload_base64_image_sync,
            base64_data=f"data:{result['mime_type']};base64,{result['image_base64']}",
            session_id=session_id,
            prefix="renders",
        )

        mode_label = "transformed" if mode == "modification" else "generated"

        # 🚀 AUTOMATIC SLIDER UPDATE
        # 🚀 REGISTER FILE & SYNC COVER
        # Instead of manually updating, we save the file metadata.
        # The repository's save_file_metadata triggers sync_project_cover.
        try:
            # The render points at the photo's `files` document (a stable id, not
            # its expiring signed URL) and belongs to the same room.
            source_file = None
            source_path = session_media_path(source_image_url, session_id) if mode == "modification" else None
            if source_path:
                source_file = await get_room_repository().find_file_by_storage_path(session_id, source_path)
            file_meta = {
                "url": image_url,
                "type": "render",
                "name": f"Render {mode_label}",
                "mimeType": f"image/{result.get('mime_type', 'png')}",
                "uploadedBy": "assistant",
                "metadata": {
                    "source_file_id": source_file["id"] if source_file else None,
                    # Photo with no `files` document (older uploads): keep the
                    # legacy link, read by the cover sync and the admin dossier.
                    "source_image_id": source_image_url if mode == "modification" and not source_file else None,
                    "prompt": prompt,
                    "style": style,
                    # The signed URL above expires in 7 days; the path lets the
                    # gallery and the admin dossier mint fresh URLs forever.
                    "storage_path": storage_path_from_url(image_url),
                }
            }

            await get_conversation_repository().save_file_metadata(
                session_id, file_meta, room_id=(source_file or {}).get(FILE_ROOM_FIELD)
            )
            logger.info(f"[Render] 📂 Registered render file in project {session_id}")

        except Exception as file_error:  # noqa: BLE001
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
        logger.error(f"[Render] ❌ generate_render_wrapper EXCEPTION: {e}", exc_info=True)
        # The exception text reaches the user through the tool result: keep it in the logs only.
        return {
            "error": "Non sono riuscito a generare il render. Riprova tra poco.",
            "status": "error"
        }

generate_render = generate_render_wrapper
