"""What another photo of a room adds to its reference photo (one call per photo).

Used when the client picks a room (`services/room_photo_vision.py`): the
reference photo is measured, every other photo is compared with it, so the
measures come from one photo and the other photos only add what it misses.
"""
from google.genai import types
from src.core.models import ModelRole, get_genai_client, get_model_id
from src.prompts.components.photo_difference import NOTHING_NEW, PHOTO_DIFFERENCE_PROMPT
from src.vision.measure_room import response_text

# One note per photo, short enough for the room's estimate (`PhotoEstimate.notes`).
_NOTE_MAX_CHARS = 300


async def photo_difference(reference: bytes, reference_mime: str, other: bytes, other_mime: str) -> str:
    """What `other` shows of the room that `reference` does not ("" when nothing).
    Model errors are raised (google.genai errors, httpx errors)."""
    # The process-wide client (`get_genai_client` is cached): never closed here.
    response = await get_genai_client().aio.models.generate_content(
        model=get_model_id(ModelRole.VISION),
        contents=types.Content(role="user", parts=[
            types.Part(text=PHOTO_DIFFERENCE_PROMPT),
            types.Part(inline_data=types.Blob(mime_type=reference_mime, data=reference)),
            types.Part(inline_data=types.Blob(mime_type=other_mime, data=other)),
        ]),
        config=types.GenerateContentConfig(temperature=0.1),
    )
    text = " ".join(response_text(response).split())
    if not text or text.strip(" .").upper() == NOTHING_NEW:
        return ""
    return text[:_NOTE_MAX_CHARS]
