"""The room an untagged user message talks about (src/services/room_mentions.py)."""
import pytest
from src.schemas.room import DEFAULT_ROOM_ID, RoomSchema
from src.services.room_mentions import messages_naming_one_room
from src.utils.datetime_utils import utc_now


def _room(room_id: str, label: str, room_type: str) -> RoomSchema:
    now = utc_now()
    return RoomSchema(room_id=room_id, label=label, room_type=room_type, created_at=now, updated_at=now)


ROOMS = [
    _room(DEFAULT_ROOM_ID, "Generale", "altro"),
    _room("b1", "Bagno", "bagno"),
    _room("b2", "Bagno ospiti", "bagno"),
    _room("c1", "Cucina di Anna", "cucina"),
    _room("s1", "Studio", "altro"),
]


def _named(text: str, role: str = "user") -> dict[str, list]:
    return messages_naming_one_room([{"role": role, "content": text}], ROOMS)


@pytest.mark.parametrize(("text", "room_id"), [
    ("Il bagno ospiti è 4 mq", "b2"),
    ("In cucina il pavimento è 12 mq", "c1"),
    ("Lo studio va tinteggiato", "s1"),
])
def test_one_named_room(text, room_id):
    assert list(_named(text)) == [room_id]


@pytest.mark.parametrize("text", [
    "Ristrutturo bagno e cucina",           # a bathroom (which?) and the kitchen
    "Il bagno ospiti e lo studio",          # two rooms
    "Il corridoio è da rifare",             # no room of the project
    "Rifacciamo tutto in generale",         # "Generale" is not a room to name
])
def test_no_single_room(text):
    assert _named(text) == {}


def test_a_word_containing_a_room_name_is_not_the_room():
    assert list(_named("Bagnomaria in cucina")) == ["c1"]


def test_with_two_rooms_of_a_type_the_bare_type_names_neither():
    """Two bathrooms: "il secondo bagno" may be either, no guess."""
    assert _named("Il secondo bagno è piccolo") == {}


def test_with_one_room_of_a_type_the_type_names_it():
    rooms = [_room("b1", "Bagno padronale", "bagno"), _room("c1", "Cucina", "cucina")]
    assert list(messages_naming_one_room([{"role": "user", "content": "BAGNO: 8 metri quadri"}], rooms)) == ["b1"]


def test_only_the_client_s_messages_count():
    assert _named("Il bagno risulta di 5 mq", role="assistant") == {}


@pytest.mark.parametrize("text", ["Tutta la casa è 90 mq, bagno compreso", "L'appartamento ha il bagno cieco"])
def test_a_whole_home_message_stays_project_wide(text):
    rooms = [_room("b1", "Bagno", "bagno"), _room("c1", "Cucina", "cucina")]
    assert messages_naming_one_room([{"role": "user", "content": text}], rooms) == {}
