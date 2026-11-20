"""One kind of room, as the prompts need to know it."""
from dataclasses import dataclass

from src.schemas.room import RoomType


@dataclass(frozen=True)
class RoomPlaybook:
    """What the agents know about a kind of room, apart from the static prompt.

    - `room_key`: the room type this playbook belongs to (the key of the registry).
    - `aliases`: names a client may give the room ("wc", "servizi"), matched as whole words.
    - `prompt_guidance`: the checklist the quote agent covers before the quote.
    - `vision_hints`: what the triage agent looks at in a photo of this room.
    """

    room_key: RoomType
    aliases: tuple[str, ...]
    prompt_guidance: str
    vision_hints: str
