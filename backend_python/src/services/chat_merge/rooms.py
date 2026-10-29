"""Rooms of a merged chat: matched by name with the destination's, else added."""
import hashlib
from dataclasses import dataclass
from typing import Any

from src.schemas.room import DEFAULT_ROOM_ID, normalize_room_label


@dataclass(frozen=True)
class RoomMap:
    ids: dict[str, str]  # source room id → destination room id
    new_rooms: list[dict[str, Any]]  # source rooms to create, with their destination id


def map_rooms(source_id: str, source_rooms: list[dict[str, Any]], dest_rooms: list[dict[str, Any]]) -> RoomMap:
    """Same room = same normalized name ("il Bagno" is "Bagno"); "Generale" is
    always the destination's. A room the destination lacks keeps its id, unless
    another room took it. Deterministic: a second run maps the same way."""
    by_label = {normalize_room_label(room["label"]): room["room_id"] for room in dest_rooms}
    taken = {room["room_id"] for room in dest_rooms}
    ids: dict[str, str] = {}
    new_rooms: list[dict[str, Any]] = []
    for room in source_rooms:
        room_id, key = room["room_id"], normalize_room_label(room["label"])
        if room_id == DEFAULT_ROOM_ID and DEFAULT_ROOM_ID in taken:
            ids[room_id] = DEFAULT_ROOM_ID
        elif key in by_label:
            ids[room_id] = by_label[key]
        else:
            new_id = room_id
            if new_id in taken:
                new_id = "r_" + hashlib.sha256(f"{source_id}/{room_id}".encode()).hexdigest()[:12]
            taken.add(new_id)
            by_label[key] = ids[room_id] = new_id
            new_rooms.append({**room, "room_id": new_id})
    return RoomMap(ids=ids, new_rooms=new_rooms)
