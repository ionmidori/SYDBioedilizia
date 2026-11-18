"""The quote tool reads the client's message of this turn.

/chat/stream saves the user message in a BackgroundTask, after the stream: when
`suggest_quote_items` runs, the Firestore history does not hold it yet (18/11:
history read 20:03:12, message saved 20:03:37), so "il soggiorno non lo
includere" never reached the analysis. The tool now gets the turn's words from
ADK and adds them to the history it reads."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.genai import types
from src.adk import tools
from src.adk.session_context import TURN_MESSAGE_STATE_KEY, turn_message_entry
from src.services.insight_engine import InsightAnalysis
from src.tools.quote_tools import suggest_quote_items_wrapper, with_turn_message

SAVED = {"id": "m1", "role": "user", "content": "Bagno 8 mq"}
TURN = {"id": "m2", "role": "user", "content": "il soggiorno non lo includere", "room_id": "sogg1"}


def test_the_turn_message_missing_from_the_history_is_appended():
    assert with_turn_message([SAVED], TURN) == [SAVED, TURN]


def test_a_turn_message_already_saved_is_not_appended_twice():
    history = [SAVED, {**TURN}]
    assert with_turn_message(history, TURN) == history


def test_a_turn_message_without_id_is_always_appended():
    # Only an id proves it is saved: a "sì" like the last one is a new message.
    turn = {"id": None, "role": "user", "content": "Bagno 8 mq"}
    assert with_turn_message([SAVED], turn) == [SAVED, turn]


@pytest.mark.parametrize("turn", [None, {**TURN, "content": ""}])
def test_no_turn_text_appends_nothing(turn):
    assert with_turn_message([SAVED], turn) == [SAVED]


def test_the_turn_message_entry_is_written_every_turn():
    assert turn_message_entry("m2", None) == {"id": "m2", "room_id": None}


async def test_the_wrapper_analyses_the_turn_message():
    with patch("src.tools.quote_tools.ConversationRepository") as repo, \
         patch("src.tools.quote_tools.get_insight_engine") as get_engine, \
         patch("src.tools.quote_tools.get_async_firestore_client"):
        repo.return_value.get_context = AsyncMock(return_value=[SAVED])
        analyze = AsyncMock(return_value=InsightAnalysis(suggestions=[], summary="-"))
        get_engine.return_value.analyze_project_for_quote = analyze

        await suggest_quote_items_wrapper(session_id="s1", project_id="p1", user_id="u1", turn_message=TURN)

    sent = " ".join(m["content"] for m in analyze.await_args.args[0])
    assert "non lo includere" in sent


def _context(user_content: types.Content | None, state: dict) -> MagicMock:
    ctx = MagicMock()
    ctx.session.id = "s1"
    ctx.session.events = []
    ctx.invocation_id = "inv"
    ctx.user_id = "u1"
    ctx.user_content = user_content
    ctx.state = state
    return ctx


async def test_the_adk_tool_passes_the_turn_words_and_room():
    content = types.Content(role="user", parts=[types.Part(text="###\nil soggiorno non lo includere\n###")])
    ctx = _context(content, {TURN_MESSAGE_STATE_KEY: {"id": "m2", "room_id": "sogg1"}})
    with patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)), \
         patch("src.tools.quote_tools.suggest_quote_items_wrapper", new=AsyncMock(return_value="ok")) as w:
        await tools.suggest_quote_items(session_id="s1", tool_context=ctx)
    assert w.await_args.kwargs["turn_message"] == TURN


async def test_a_turn_without_words_passes_no_turn_message():
    ctx = _context(None, {TURN_MESSAGE_STATE_KEY: {"id": "m2", "room_id": None}})
    with patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)), \
         patch("src.tools.quote_tools.suggest_quote_items_wrapper", new=AsyncMock(return_value="ok")) as w:
        await tools.suggest_quote_items(session_id="s1", tool_context=ctx)
    assert w.await_args.kwargs["turn_message"] is None

async def test_the_media_labels_are_not_the_client_words():
    content = types.Content(role="user", parts=[
        types.Part(text="###\nil soggiorno non lo includere\n###"),
        types.Part(text="\n[Foto f_1 · Bagno]\n"),
        types.Part(text="[NOTA DI SISTEMA: video non inviato]"),
    ])
    ctx = _context(content, {TURN_MESSAGE_STATE_KEY: {"id": "m2", "room_id": "sogg1"}})
    with patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)), \
         patch("src.tools.quote_tools.suggest_quote_items_wrapper", new=AsyncMock(return_value="ok")) as w:
        await tools.suggest_quote_items(session_id="s1", tool_context=ctx)
    assert w.await_args.kwargs["turn_message"] == TURN


async def test_a_photo_without_words_passes_no_turn_message():
    content = types.Content(role="user", parts=[
        types.Part(text="###\n\n###"), types.Part(text="\n[Foto f_1 · Bagno]\n"),
    ])
    ctx = _context(content, {TURN_MESSAGE_STATE_KEY: {"id": "m2", "room_id": None}})
    with patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)), \
         patch("src.tools.quote_tools.suggest_quote_items_wrapper", new=AsyncMock(return_value="ok")) as w:
        await tools.suggest_quote_items(session_id="s1", tool_context=ctx)
    assert w.await_args.kwargs["turn_message"] is None
