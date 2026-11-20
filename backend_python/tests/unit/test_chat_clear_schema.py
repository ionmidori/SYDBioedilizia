import pytest
from pydantic import ValidationError
from src.schemas.chat_clear import ClearChatRequest, ClearChatResponse


def test_clear_chat_request_defaults_to_full_chat():
    req = ClearChatRequest()
    assert req.room_id is None


def test_clear_chat_request_accepts_valid_room_id_and_rejects_invalid():
    assert ClearChatRequest(room_id="bagno_1").room_id == "bagno_1"
    with pytest.raises(ValidationError):
        ClearChatRequest(room_id="../escape")
    with pytest.raises(ValidationError):
        ClearChatRequest(room_id="bagno", extra_field=True)  # type: ignore[call-arg]


def test_clear_chat_response_validates_modes_and_non_negative_counts():
    resp = ClearChatResponse(mode="soft_archive", room_id="bagno", affected_count=4, rooms_reset=1)
    assert resp.model_dump(mode="json") == {
        "mode": "soft_archive",
        "room_id": "bagno",
        "affected_count": 4,
        "rooms_reset": 1,
    }
    with pytest.raises(ValidationError):
        ClearChatResponse(mode="invalid", room_id=None, affected_count=0, rooms_reset=0)  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        ClearChatResponse(mode="hard_delete", room_id=None, affected_count=-1, rooms_reset=0)
