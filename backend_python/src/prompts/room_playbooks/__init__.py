"""Room playbooks: what the quote and triage agents know about a kind of room.

A room's checklist rides on the dynamic instruction (`src/adk/session_context.py`),
only when the chat is about that room, instead of the static prompt every turn
pays for. One file per room and one line in `REGISTRY` to add a room.
"""
import re

from src.prompts.room_playbooks.bagno import BAGNO
from src.prompts.room_playbooks.schema import RoomPlaybook
from src.schemas.room import ROOM_TYPES, RoomType

# A playbook rides on every turn of its room: the cost is in tokens, not in code.
GUIDANCE_MAX_CHARS = 1200

REGISTRY: dict[RoomType, RoomPlaybook] = {BAGNO.room_key: BAGNO}

# Names of a room that is two kinds at once: its keys come before any playbook exists
# for them, so a playbook added later (kitchen, living room) is found without a change here.
_OPEN_SPACE_ALIASES = ("open space", "cucina-soggiorno", "soggiorno con angolo cottura")
_OPEN_SPACE_KEYS: tuple[RoomType, ...] = ("cucina", "soggiorno")


def _words(text: str | None) -> str:
    """Lowercase words of `text` joined by one space ("Cucina-Soggiorno" -> "cucina soggiorno")."""
    return " ".join(re.findall(r"\w+", (text or "").casefold()))


def room_keys(room_type: str | None, label: str | None) -> tuple[RoomType, ...]:
    """The kinds of room a room is: its type first ("altro" is none), then the kinds
    its name says ("WC ospiti" -> bagno, "Open space" -> cucina and soggiorno)."""
    keys: list[RoomType] = [key for key in ROOM_TYPES if key == room_type and key != "altro"]
    name = f" {_words(label)} "
    named: list[tuple[tuple[str, ...], tuple[RoomType, ...]]] = [
        (playbook.aliases, (playbook.room_key,)) for playbook in REGISTRY.values()
    ]
    named.append((_OPEN_SPACE_ALIASES, _OPEN_SPACE_KEYS))
    for aliases, found in named:
        if any(f" {_words(alias)} " in name for alias in aliases):
            keys.extend(key for key in found if key not in keys)
    return tuple(keys)


def playbooks_for(room_type: str | None, label: str | None) -> tuple[RoomPlaybook, ...]:
    """The playbooks of the kinds this room is (none for a kind without one)."""
    return tuple(REGISTRY[key] for key in room_keys(room_type, label) if key in REGISTRY)
