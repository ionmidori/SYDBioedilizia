"""Room tools of the agents (Phase 138: one chat for the whole home).

Pick the room the conversation is about (found by name or created), file a
photo/video in its room, read a room's brief and media. The ADK tools in
`src/adk/tools.py` call these with the verified session as the project; results
are short dicts the model reads, failures are returned as `status: error`.
"""
import re
from typing import Any, cast

from google.api_core.exceptions import GoogleAPIError
from pydantic import ValidationError
from src.core.exceptions import ProjectFileNotFoundError, RoomLimitError, RoomNotFoundError
from src.core.logger import get_logger
from src.db.projects.constants import FILE_ROOM_FIELD
from src.repositories.room_repository import get_room_repository
from src.schemas.room import ROOM_ID_PATTERN, ROOM_TYPES, RoomCreate, RoomSchema, RoomType

logger = get_logger(__name__)

_ROOM_ID = re.compile(ROOM_ID_PATTERN)
# File ids are Firestore document ids chosen by the backend (upload asset ids):
# a slash would address another document path.
_FILE_ID = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")
# Leading article: "l'" may touch the word ("l'ingresso"), the others need a space
# (else "Ingresso" would lose its "I").
_ARTICLE = re.compile(r"^(?:l'\s*|(?:il|lo|la|i|gli|le)\s+)")
ROOM_MEDIA_LIMIT = 20

_MEDIA_KIND = {"image": "Foto", "video": "Video", "render": "Render"}
NO_ROOM = "senza stanza"


def media_label(file_type: str | None, file_id: str | None, room_label: str | None) -> str:
    """Text the model reads before (or instead of) a media: `[Foto f_123 · Bagno]`."""
    kind = _MEDIA_KIND.get(file_type or "", "File")
    head = f"{kind} {file_id}" if file_id else kind
    return f"[{head} · {room_label or NO_ROOM}]"


def brief_lines(room: RoomSchema, *, open_questions: bool = False) -> list[str]:
    """The room's brief (scheda stanza) as "- Label: value" lines, only what is
    known. Shared by the quote, the room brief updater and the session restore."""
    brief = room.brief
    fields: list[tuple[str, object]] = [
        ("Sintesi", room.summary),
        ("Pavimento (mq)", brief.floor_mq),
        ("Pareti (mq)", brief.walls_mq),
        ("Altezza (m)", brief.height_m),
        ("Superfici", brief.surfaces),
        ("Impianti", brief.systems),
        ("Elementi fissi", brief.fixtures),
        ("Criticità", "; ".join(brief.criticalities)),
        ("Decisioni prese", "; ".join(brief.decisions)),
    ]
    if open_questions:
        fields.append(("Domande aperte", "; ".join(brief.open_questions)))
    return [f"- {label}: {value}" for label, value in fields if value]


def _error(message: str) -> dict[str, Any]:
    return {"status": "error", "message": message}


def _normalize(text: str) -> str:
    return _ARTICLE.sub("", " ".join(text.casefold().split()))


def match_room(rooms: list[RoomSchema], name: str, room_type: str) -> RoomSchema | None:
    """The room the user means: same name, or the only room of that type when
    the name is just the type ("il bagno" with one bathroom)."""
    key = _normalize(name)
    for room in rooms:
        if _normalize(room.label) == key:
            return room
    same_type = [r for r in rooms if r.room_type == room_type]
    if len(same_type) == 1 and key in (room_type, ""):
        return same_type[0]
    return None


async def select_room(project_id: str, name: str, room_type: str) -> tuple[dict[str, Any], list[RoomSchema]]:
    """Find the room by name (or create it); returns the result and the project's rooms."""
    kind: RoomType = cast(RoomType, room_type) if room_type in ROOM_TYPES else "altro"
    try:
        request = RoomCreate(label=name, room_type=kind)
    except ValidationError:
        return _error("Nome stanza non valido: usa da 1 a 60 caratteri."), []
    repo = get_room_repository()
    try:
        rooms = await repo.list_rooms(project_id)
        room = match_room(rooms, name, kind)
        created = room is None
        if room is None:
            room = await repo.create_room(project_id, request)
            # Re-read: the first room of a project with files also brings "Generale".
            rooms = await repo.list_rooms(project_id)
    except RoomLimitError:
        return _error("Il progetto ha già il numero massimo di stanze: usa una stanza esistente."), []
    except (GoogleAPIError, ValidationError) as e:
        logger.error("[Rooms] select_room failed", extra={"error": type(e).__name__})
        return _error("Non riesco a leggere le stanze in questo momento. Riprova."), []
    return {
        "status": "success",
        "room_id": room.room_id,
        "label": room.label,
        "room_type": room.room_type,
        "created": created,
        "message": f"Stanza attiva: {room.label}" + (" (nuova)" if created else ""),
    }, rooms


async def assign_media(project_id: str, file_id: str, room_id: str) -> dict[str, Any]:
    """Move a project file (photo, video, render) to a room of the same project."""
    if not _FILE_ID.match(file_id) or not _ROOM_ID.match(room_id):
        return _error("Id del file o della stanza non valido.")
    try:
        await get_room_repository().assign_file_to_room(project_id, file_id, room_id)
    except RoomNotFoundError:
        return _error("Stanza non trovata in questo progetto: usa un id da STANZE DEL PROGETTO.")
    except ProjectFileNotFoundError:
        return _error("File non trovato in questo progetto: usa l'id dell'etichetta [Foto <id> · ...].")
    except (GoogleAPIError, ValidationError) as e:
        logger.error("[Rooms] assign_media failed", extra={"error": type(e).__name__})
        return _error("Non riesco ad assegnare il file in questo momento. Riprova.")
    return {"status": "success", "file_id": file_id, "room_id": room_id}


async def room_context(project_id: str, room_id: str) -> dict[str, Any]:
    """A room's brief and its media (newest first, with ids and labels)."""
    if not _ROOM_ID.match(room_id):
        return _error("Id stanza non valido.")
    repo = get_room_repository()
    try:
        room = await repo.get_room(project_id, room_id)
        if room is None:
            return _error("Stanza non trovata in questo progetto: usa un id da STANZE DEL PROGETTO.")
        files = await repo.files_for_room(project_id, room_id, limit=ROOM_MEDIA_LIMIT)
    except (GoogleAPIError, ValidationError) as e:
        logger.error("[Rooms] room_context failed", extra={"error": type(e).__name__})
        return _error("Non riesco a leggere la stanza in questo momento. Riprova.")
    return {
        "status": "success",
        "room_id": room.room_id,
        "label": room.label,
        "room_type": room.room_type,
        "summary": room.summary or "",
        "brief": room.brief.model_dump(exclude_none=True),
        "reference_photo_id": room.reference_photo_id,
        "media": [
            {
                "file_id": f["id"],
                "type": f.get("type", ""),
                "name": f.get("name", ""),
                "label": media_label(f.get("type"), f["id"], room.label),
            }
            for f in files
        ],
    }


def room_of(file_doc: dict[str, Any] | None) -> str | None:
    """Room id of a `files` document, if filed."""
    return (file_doc or {}).get(FILE_ROOM_FIELD)
