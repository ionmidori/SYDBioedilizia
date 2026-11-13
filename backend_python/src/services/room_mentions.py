"""
The room a message without a room chip talks about.

A client may correct a room with no chip active ("il bagno è 8 metri quadri"):
the message is saved without a room and the quote read it only as background,
so the analysis kept the old measure of the room's brief. A user message that
names exactly one room is that room's talk; one that names several rooms, or
none, stays project-wide.

A room is named by its label (without the article: "Il Bagno" = "bagno") and by
its type ("cucina") when no other room has that type; with two rooms of a type,
the bare type ("bagno") names neither.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from collections.abc import Mapping, Sequence

from src.schemas.room import DEFAULT_ROOM_ID, RoomSchema, normalize_room_label

# Types that do not name one place: "altro" is whatever the client called it.
_GENERIC_TYPES = frozenset({"altro"})
# A message about the whole home ("tutta la casa è 90 mq, bagno compreso") is no one room's talk.
_WHOLE_HOME = re.compile(
    r"(?<!\w)(?:tutta la casa|casa intera|intera casa|tutto l'appartamento|intero appartamento"
    r"|appartamento intero|tutta l'abitazione|intera abitazione)(?!\w)"
)


def _pattern(names: set[str]) -> re.Pattern[str]:
    words = "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True))
    return re.compile(rf"(?<!\w)(?:{words})(?!\w)")


def _room_patterns(rooms: Sequence[RoomSchema]) -> tuple[dict[str, re.Pattern[str]], re.Pattern[str] | None]:
    """(names of each room, the types shared by several rooms)."""
    named = [r for r in rooms if r.room_id != DEFAULT_ROOM_ID]
    types = Counter(r.room_type for r in named)
    shared = {t for t, n in types.items() if n > 1} - _GENERIC_TYPES
    patterns = {}
    for room in named:
        label = normalize_room_label(room.label)
        # Two bathrooms: "il bagno" is either of them, "bagno ospiti" only one.
        names = {label} - shared if room.room_type in shared else {label} | ({room.room_type} - _GENERIC_TYPES)
        if names:
            patterns[room.room_id] = _pattern(names)
    return patterns, _pattern(shared) if shared else None


def messages_naming_one_room(
    messages: Sequence[Mapping[str, object]], rooms: Sequence[RoomSchema]
) -> dict[str, list[Mapping[str, object]]]:
    """The user messages that name exactly one room, by room id, in their order.
    A shared type left after the room names ("bagno e cucina" with two
    bathrooms) is one more room: the message stays project-wide."""
    patterns, shared = _room_patterns(rooms)
    found: defaultdict[str, list[Mapping[str, object]]] = defaultdict(list)
    for message in messages:
        content = message.get("content")
        if message.get("role") != "user" or not isinstance(content, str):
            continue
        text = " ".join(content.casefold().split())
        if _WHOLE_HOME.search(text):
            continue
        hits = [room_id for room_id, pattern in patterns.items() if pattern.search(text)]
        if len(hits) != 1:
            continue
        rest = patterns[hits[0]].sub(" ", text)
        if shared is None or not shared.search(rest):
            found[hits[0]].append(message)
    return dict(found)
