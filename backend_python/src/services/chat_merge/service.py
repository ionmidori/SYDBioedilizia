"""Copy a chat into another chat of the same user (Phase 139: one chat per user).

Used by the guest claim: a guest who signs in to an account that already has
its chat brings the guest chat into it. The source is COPIED, never moved:
1. its media objects to the destination's prefixes;
2. its rooms the destination lacks (same name = same room, rooms.py);
3. its `files` documents, as `copied_file_id(...)`;
4. its messages, as `m_<source>_<id>`, with their original timestamps;
5. last, in one batch: the destination's message count and history revision
   (the ADK sessions held in memory rebuild from Firestore) and the source's
   `merged_into` / `archived_at`.
Every reference to a copied object is rewritten (refs.py); every room id and
file id is mapped, in the fields that hold one and wherever a message names one
(tool results and calls the model reads back); copies carry `merged_from`. Ids are deterministic and the
source is marked last, so a run interrupted anywhere is finished by running it
again, and a finished one is a no-op. The source keeps all its data.

The source must have no quote (a guest never has one): there is one quote per
chat and copying it would need a decision on which one wins.
"""
import asyncio
import hashlib
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from google.cloud.firestore_v1 import Increment

from src.db.batching import BatchWriter
from src.db.ownership import real_owners
from src.db.projects.constants import (
    ARCHIVED_AT,
    FILE_ROOM_FIELD,
    FILES_PARENT_COLLECTION,
    HISTORY_REVISION,
    MERGED_INTO,
    PROJECTS_COLLECTION,
)
from src.db.session_retention import EXPIRE_AT, is_soft_deleted
from src.repositories.room_repository import FILES, MAX_ROOMS_PER_PROJECT, ROOMS
from src.services.chat_merge.media import MediaStore
from src.services.chat_merge.refs import media_prefixes, moved_path, rewrite_refs
from src.services.chat_merge.rooms import RoomMap, map_rooms
from src.services.quote_drafts import quote_doc_ref
from src.services.quote_state import QuoteStatus
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

MERGED_FROM = "merged_from"


class ChatMergeError(Exception):
    """The two chats cannot be merged; nothing was written."""


@dataclass(frozen=True)
class MergeReport:
    blobs: int = 0
    rooms_created: int = 0
    files: int = 0
    messages: int = 0
    already_merged: bool = False


def copied_file_id(source_id: str, file_id: str) -> str:
    """Id of the copy of a source file. Short: the model reads file ids
    (`[Foto <id> · Bagno]`) and repeats them in tool calls."""
    return "f_" + hashlib.sha256(f"{source_id}/{file_id}".encode()).hexdigest()[:16]


def _copied_message_id(source_id: str, message_id: str) -> str:
    return f"m_{source_id}_{message_id}"


def _id_pattern(ids: dict[str, str]) -> re.Pattern[str] | None:
    """Whole-token ids that change. Not inside a path or a file name
    (`.../<id>.jpg`): those are storage references, rewritten apart."""
    changed = sorted((old for old, new in ids.items() if old != new), key=len, reverse=True)
    if not changed:
        return None
    return re.compile(r"(?<![\\w/.-])(?:" + "|".join(map(re.escape, changed)) + r")(?![\\w/.-])")


def _remap_ids(value: Any, pattern: re.Pattern[str] | None, ids: dict[str, str]) -> Any:
    if pattern is None:
        return value
    if isinstance(value, str):
        return pattern.sub(lambda m: ids[m.group(0)], value)
    if isinstance(value, dict):
        return {key: _remap_ids(item, pattern, ids) for key, item in value.items()}
    if isinstance(value, list):
        return [_remap_ids(item, pattern, ids) for item in value]
    return value


def _memoized(sign: Callable[[str], str]) -> Callable[[str], str]:
    """One signature per object: messages repeat the same media many times."""
    signed: dict[str, str] = {}

    def memo(path: str) -> str:
        if path not in signed:
            signed[path] = sign(path)
        return signed[path]

    return memo


def _session_ref(db: Any, chat_id: str) -> Any:
    return db.collection(PROJECTS_COLLECTION).document(chat_id)


def _project_ref(db: Any, chat_id: str) -> Any:
    return db.collection(FILES_PARENT_COLLECTION).document(chat_id)


async def _session(db: Any, chat_id: str) -> dict[str, Any] | None:
    snap = await _session_ref(db, chat_id).get()
    return (snap.to_dict() or {}) if snap.exists else None


async def _check(db: Any, source_id: str, dest_id: str) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """Both chats if they can be merged; None if the source is already merged
    into the destination. ChatMergeError otherwise."""
    if source_id == dest_id:
        raise ChatMergeError("A chat cannot be merged into itself")
    source, dest = await _session(db, source_id), await _session(db, dest_id)
    if source is None or dest is None:
        raise ChatMergeError("Both chats must exist")
    owner = real_owners(source)[:1]
    if not owner or owner != real_owners(dest)[:1]:
        raise ChatMergeError("Both chats must belong to the same registered user")
    if is_soft_deleted(source) or is_soft_deleted(dest):
        raise ChatMergeError("A deleted chat cannot be merged")
    if dest.get(MERGED_INTO):
        raise ChatMergeError("The destination was merged into another chat")
    if source.get(MERGED_INTO) == dest_id:
        return None
    if source.get(MERGED_INTO):
        raise ChatMergeError("The source was merged into another chat")
    quote = await quote_doc_ref(db, source_id).get()
    if quote.exists and (quote.to_dict() or {}).get("status") != QuoteStatus.DELETED:
        raise ChatMergeError("The source chat has a quote")
    return source, dest


async def _docs(collection: Any) -> list[tuple[str, dict[str, Any]]]:
    return [(snap.id, snap.to_dict() or {}) async for snap in collection.stream()]


async def _copy_blobs(media: MediaStore, source_id: str, dest_id: str) -> int:
    paths = await media.list_paths(media_prefixes(source_id))
    pairs = [(path, target) for path in paths if (target := moved_path(path, source_id, dest_id)) is not None]
    await media.copy_all(pairs)
    return len(paths)


def _file_copy(
    data: dict[str, Any], source_id: str, dest_id: str, rooms: RoomMap, file_ids: dict[str, str],
    sign: Callable[[str], str],
) -> dict[str, Any]:
    copy: dict[str, Any] = rewrite_refs(data, source_id, dest_id, sign)
    metadata = dict(copy.get("metadata") or {})
    if metadata.get("source_file_id") in file_ids:
        metadata["source_file_id"] = file_ids[metadata["source_file_id"]]
    metadata[MERGED_FROM] = source_id
    copy["metadata"] = metadata
    if copy.get(FILE_ROOM_FIELD) in rooms.ids:
        copy[FILE_ROOM_FIELD] = rooms.ids[copy[FILE_ROOM_FIELD]]
    if copy.get("projectId") == source_id:
        copy["projectId"] = dest_id
    return copy


def _message_copy(
    data: dict[str, Any], source_id: str, dest_id: str, ids: dict[str, str], pattern: re.Pattern[str] | None,
    dest_expiry: Any, sign: Callable[[str], str],
) -> dict[str, Any]:
    copy: dict[str, Any] = _remap_ids(rewrite_refs(data, source_id, dest_id, sign), pattern, ids)
    metadata = dict(copy.get("metadata") or {})
    metadata[MERGED_FROM] = source_id
    copy["metadata"] = metadata
    # Retention follows the destination: a registered chat never expires.
    copy.pop(EXPIRE_AT, None)
    if dest_expiry is not None:
        copy[EXPIRE_AT] = dest_expiry
    return copy


async def _copy_rooms(
    db: Any, dest_id: str, rooms: RoomMap, file_ids: dict[str, str]
) -> None:
    room_ref = _project_ref(db, dest_id).collection(ROOMS)
    async with BatchWriter(db) as writer:
        for room in rooms.new_rooms:
            reference = room.get("reference_photo_id")
            await writer.set(room_ref.document(room["room_id"]), {
                **room, "reference_photo_id": file_ids.get(reference) if reference else None,
            })


async def _copy_files(
    db: Any, source_id: str, dest_id: str, files: list[tuple[str, dict[str, Any]]],
    rooms: RoomMap, file_ids: dict[str, str], sign: Callable[[str], str],
) -> None:
    copies = await asyncio.to_thread(
        lambda: [(file_ids[fid], _file_copy(data, source_id, dest_id, rooms, file_ids, sign)) for fid, data in files]
    )
    files_ref = _project_ref(db, dest_id).collection(FILES)
    async with BatchWriter(db) as writer:
        for file_id, data in copies:
            await writer.set(files_ref.document(file_id), data)


async def _copy_messages(
    db: Any, source_id: str, dest_id: str, ids: dict[str, str], dest_expiry: Any, sign: Callable[[str], str],
) -> int:
    messages = await _docs(_session_ref(db, source_id).collection("messages"))
    pattern = _id_pattern(ids)
    copies = await asyncio.to_thread(
        lambda: [
            (
                _copied_message_id(source_id, mid),
                _message_copy(data, source_id, dest_id, ids, pattern, dest_expiry, sign),
            )
            for mid, data in messages
        ]
    )
    messages_ref = _session_ref(db, dest_id).collection("messages")
    async with BatchWriter(db) as writer:
        for message_id, data in copies:
            await writer.set(messages_ref.document(message_id), data)
    return len(copies)


async def _finish(db: Any, source_id: str, dest_id: str, messages: int, now: datetime) -> None:
    """One batch: the destination's new history is visible, the source archived.
    Counted with an increment, like every turn: a concurrent turn keeps its own."""
    marker = {MERGED_INTO: dest_id, ARCHIVED_AT: now}
    batch = db.batch()
    batch.update(_session_ref(db, dest_id), {"messageCount": Increment(messages), HISTORY_REVISION: Increment(1)})
    batch.update(_session_ref(db, source_id), marker)
    if (await _project_ref(db, source_id).get()).exists:
        batch.update(_project_ref(db, source_id), marker)
    await batch.commit()


async def merge_chat(
    db: Any, media: MediaStore, source_id: str, dest_id: str, *, now: datetime | None = None
) -> MergeReport:
    """Copy `source_id` into `dest_id` (order and guarantees: module docstring)."""
    checked = await _check(db, source_id, dest_id)
    if checked is None:
        return MergeReport(already_merged=True)
    _, dest = checked

    source_rooms = [data for _, data in await _docs(_project_ref(db, source_id).collection(ROOMS))]
    dest_rooms = [data for _, data in await _docs(_project_ref(db, dest_id).collection(ROOMS))]
    rooms = map_rooms(source_id, source_rooms, dest_rooms)
    if len(dest_rooms) + len(rooms.new_rooms) > MAX_ROOMS_PER_PROJECT:
        raise ChatMergeError("Too many rooms for one chat")
    files = await _docs(_project_ref(db, source_id).collection(FILES))
    file_ids = {fid: copied_file_id(source_id, fid) for fid, _ in files}

    sign = _memoized(media.signed_url)
    blobs = await _copy_blobs(media, source_id, dest_id)
    await _copy_rooms(db, dest_id, rooms, file_ids)
    await _copy_files(db, source_id, dest_id, files, rooms, file_ids, sign)
    messages = await _copy_messages(db, source_id, dest_id, {**rooms.ids, **file_ids}, dest.get(EXPIRE_AT), sign)
    await _finish(db, source_id, dest_id, messages, now or utc_now())

    report = MergeReport(blobs=blobs, rooms_created=len(rooms.new_rooms), files=len(files), messages=messages)
    logger.info(
        "[ChatMerge] Chat merged",
        extra={"blobs": report.blobs, "rooms_created": report.rooms_created,
               "files": report.files, "merged_messages": report.messages},
    )
    return report
