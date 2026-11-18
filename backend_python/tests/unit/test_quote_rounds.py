"""What the last quote call left behind: the rooms its gate asked about and the
rooms the client talked about since."""
import json

from src.tools.quote_rounds import LastRound, gate_line, last_round


def _call(call_id: str, reply: str) -> list[dict]:
    """An earlier suggest_quote_items call as Firestore holds it: the tool result
    first, then the assistant message with the call."""
    return [
        {"id": f"t_{call_id}", "role": "tool", "content": reply, "tool_call_id": call_id},
        {"id": f"a_{call_id}", "role": "assistant", "content": "...",
         "tool_calls": [{"id": call_id, "name": "suggest_quote_items", "args": {}}]},
    ]


def _owner(history: list[dict], rooms: dict[str, str | None]) -> dict[int, str | None]:
    return {id(m): rooms.get(m.get("id", ""), m.get("room_id")) for m in history}


def test_gate_line_is_the_room_label_and_its_questions():
    assert gate_line("Soggiorno", "Quali lavori?") == "**Soggiorno**: Quali lavori?"


def test_no_earlier_call_has_no_round():
    history = [{"id": "u1", "role": "user", "content": "Rifaccio il bagno"}]
    assert last_round(history, _owner(history, {})) is None


def test_the_rooms_asked_by_the_last_call():
    history = _call("c1", "Prima...\n\n" + gate_line("Soggiorno", "Quali lavori?"))
    round_ = last_round(history, _owner(history, {}))
    assert round_ == LastRound(asked=frozenset({"Soggiorno"}), talked=frozenset())


def test_only_user_messages_after_the_last_call_count():
    history = [
        {"id": "u1", "role": "user", "content": "Bagno 8 mq"},
        *_call("c1", "ok"),
        {"id": "u2", "role": "user", "content": "il soggiorno non lo includere"},
        {"id": "a2", "role": "assistant", "content": "Va bene"},
    ]
    round_ = last_round(history, _owner(history, {"u1": "bagno1", "u2": "sogg1", "a2": "cucina1"}))
    assert round_ is not None and round_.talked == frozenset({"sogg1"})


def test_an_older_call_is_ignored():
    history = [
        *_call("c1", gate_line("Cucina", "Che top?")),
        {"id": "u1", "role": "user", "content": "quarzo"},
        *_call("c2", gate_line("Soggiorno", "Quali lavori?")),
    ]
    round_ = last_round(history, _owner(history, {"u1": "cucina1"}))
    assert round_ == LastRound(asked=frozenset({"Soggiorno"}), talked=frozenset())


def test_another_tool_is_not_a_quote_call():
    history = [
        {"id": "t1", "role": "tool", "content": gate_line("Bagno", "?"), "tool_call_id": "x1"},
        {"id": "a1", "role": "assistant", "content": "", "tool_calls": [{"id": "x1", "name": "get_room_context"}]},
    ]
    assert last_round(history, _owner(history, {})) is None


def test_the_reply_saved_as_adk_json_is_read():
    # The orchestrator saves a str tool result as ADK wraps it: {"result": "..."}.
    history = _call("c1", json.dumps({"result": "Prima...\n\n" + gate_line("Soggiorno", "Quali lavori?")}))
    round_ = last_round(history, _owner(history, {}))
    assert round_ is not None and round_.asked == frozenset({"Soggiorno"})
