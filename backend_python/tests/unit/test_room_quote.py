"""One quote for the whole home (Phase 138, PR-3): every room analysed on its own
media and messages, in parallel, then merged into sections ("Generale" last)."""
import asyncio
from contextlib import contextmanager
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

from google.api_core.exceptions import GoogleAPICallError
from src.core.money import sum_amounts
from src.schemas.room import DEFAULT_ROOM_ID, RoomSchema
from src.services.insight_engine import InsightAnalysis, InsightEngineError, SKUItemSuggestion
from src.services.quote_drafts import DraftSaveOutcome, DraftSaveResult
from src.tools import quote_tools
from src.tools.quote_tools import _ROOM_ANALYSIS_CONCURRENCY, suggest_quote_items_wrapper
from src.utils.datetime_utils import utc_now

PID = "proj1"


def _room(room_id: str, label: str, room_type: str, reference_photo_id: str | None = None) -> RoomSchema:
    now = utc_now()
    return RoomSchema(
        room_id=room_id, label=label, room_type=room_type, created_at=now, updated_at=now,
        reference_photo_id=reference_photo_id,
    )


def _file(file_id: str, room_id: str | None, file_type: str = "image", **metadata: Any) -> dict[str, Any]:
    return {
        "id": file_id, "type": file_type, "roomId": room_id, "url": f"https://signed.example/{file_id}?token=x",
        "metadata": {"storage_path": f"projects/{PID}/uploads/{file_id}.jpg", **metadata},
    }


def _path(file_id: str) -> str:
    return f"projects/{PID}/uploads/{file_id}.jpg"


def _s(sku: str, qty: float) -> SKUItemSuggestion:
    return SKUItemSuggestion(sku=sku, qty=qty, ai_reasoning=f"serve {sku}", phase="Lavori")


ROOMS = [_room(DEFAULT_ROOM_ID, "Generale", "altro"), _room("bagno1", "Bagno", "bagno", "f_bagno_old"),
         _room("cucina1", "Cucina", "cucina")]
FILES = [
    _file("f_bagno", "bagno1"), _file("f_bagno_old", "bagno1"), _file("v_bagno", "bagno1", "video"),
    _file("f_cucina", "cucina1"), _file("r_cucina", "cucina1", "render", source_file_id="f_cucina"),
    _file("f_vecchia", DEFAULT_ROOM_ID),
]
HISTORY = [
    {"role": "user", "content": "Ristrutturo casa: bagno e cucina."},
    {"role": "user", "content": "Nel bagno voglio la doccia", "room_id": "bagno1"},
    {"role": "user", "content": "In cucina un top in quarzo", "room_id": "cucina1"},
]
ANALYSES = {
    "Bagno": InsightAnalysis(
        summary="Bagno nuovo con doccia", completeness_score=0.9,
        suggestions=[_s("BAG-SAN-001", 1), _s("IMP-EL-002", 1), _s("SMAL-001", 0.4), _s("SC-002", 1)],
    ),
    "Cucina": InsightAnalysis(
        summary="Cucina con top in quarzo", completeness_score=0.9,
        suggestions=[_s("CUC-TOP-002", 3), _s("IMP-EL-002", 1), _s("SMAL-001", 0.5), _s("SC-002", 1)],
    ),
    # The rest of the home: nothing outside the two rooms in this chat.
    "Generale": InsightAnalysis(summary="Nient'altro", completeness_score=0.9, suggestions=[]),
}
GENERAL_MARKER = "Sezione da quotare: Generale"


def _unit_label(context: str) -> str:
    if GENERAL_MARKER in context:
        return "Generale"
    return "Bagno" if "Stanza da quotare: Bagno" in context else "Cucina"


def _files_for_room(files: list[dict[str, Any]]):
    async def files_for_room(project_id, room_id, **_):
        assert project_id == PID
        return [f for f in files if f["roomId"] == room_id]
    return files_for_room


def _history(history: list[dict[str, Any]]):
    async def get_context(session_id, limit=10, room_id=None):
        return [m for m in history if room_id is None or m.get("room_id") == room_id]
    return get_context


def _engine(analyses: dict[str, InsightAnalysis]):
    async def analyze(chat_history, media_urls=None, *, session_id=None):
        label = _unit_label(chat_history[0]["content"])
        if label not in analyses:
            label = next(name for name in analyses if f"Stanza da quotare: {name}" in chat_history[0]["content"])
        return analyses[label]
    return AsyncMock(side_effect=analyze)


@contextmanager
def _project(rooms=ROOMS, files=FILES, history=HISTORY, analyses=None, engine=None):
    repo = MagicMock()
    repo.list_rooms = AsyncMock(return_value=rooms)
    repo.list_files = AsyncMock(return_value=files)
    repo.files_for_room = AsyncMock(side_effect=_files_for_room(files))
    saved = AsyncMock(return_value=DraftSaveResult(DraftSaveOutcome.CREATED, "draft", "PRV-2026-0042"))
    analyze = engine or _engine(analyses or ANALYSES)
    with patch.object(quote_tools, "get_room_repository", return_value=repo), \
         patch.object(quote_tools, "ConversationRepository") as conversations, \
         patch.object(quote_tools, "get_insight_engine") as get_engine, \
         patch.object(quote_tools, "_run_measurement_vision", AsyncMock(return_value="\n\n## Misure: 6 mq")) as measure, \
         patch.object(quote_tools, "_structural_delta", AsyncMock(return_value="\n\n## Delta")) as delta, \
         patch.object(quote_tools, "save_ai_draft", saved), \
         patch.object(quote_tools, "gather_dossier_inputs", AsyncMock(return_value=None)), \
         patch.object(quote_tools, "get_async_firestore_client"):
        conversations.return_value.get_context = AsyncMock(side_effect=_history(history))
        get_engine.return_value.analyze_project_for_quote = analyze
        yield {"analyze": analyze, "measure": measure, "delta": delta, "saved": saved}


async def _quote() -> str:
    return await suggest_quote_items_wrapper(session_id=PID, project_id=PID, user_id="u1")


def _calls_by_room(analyze: AsyncMock) -> dict[str, Any]:
    out = {}
    for call in analyze.await_args_list:
        context = call.args[0][0]["content"]
        out[_unit_label(context)] = (context, call.args[1])
    return out


async def test_each_room_is_analysed_on_its_own_messages_and_media():
    with _project() as mocks:
        reply = await _quote()

    calls = _calls_by_room(mocks["analyze"])
    assert set(calls) == {"Bagno", "Cucina", "Generale"}
    bagno_context, bagno_media = calls["Bagno"]
    cucina_context, cucina_media = calls["Cucina"]
    assert "Nel bagno voglio la doccia" in bagno_context and "top in quarzo" not in bagno_context
    assert "top in quarzo" in cucina_context and "doccia" not in cucina_context
    # The project-wide talk is background for every room; the other rooms are named as off-limits.
    assert "Ristrutturo casa" in bagno_context and "Ristrutturo casa" in cucina_context
    assert "altre stanze (Cucina)" in bagno_context
    # Only the room's own photos and videos, by Storage path (signed URLs expire), never a render.
    assert sorted(bagno_media) == sorted([_path("f_bagno"), _path("f_bagno_old"), _path("v_bagno")])
    assert cucina_media == [_path("f_cucina")]
    assert "PRV-2026-0042" in reply and "**Bagno** — Bagno nuovo con doccia" in reply


async def test_measures_start_from_the_room_reference_photo_and_the_delta_uses_the_room_render():
    with _project() as mocks:
        await _quote()

    measured = sorted(call.args[0] for call in mocks["measure"].await_args_list)
    assert [_path("f_bagno_old"), _path("f_bagno")] in measured  # reference photo first
    assert [_path("f_cucina")] in measured
    # Only the kitchen has a render: compared with the photo it was made from.
    assert [call.args[:2] for call in mocks["delta"].await_args_list] == [
        (_path("f_cucina"), f"projects/{PID}/uploads/r_cucina.jpg"),
    ]


async def test_the_saved_quote_has_a_section_per_room_and_project_wide_lines_in_generale():
    with _project() as mocks:
        await _quote()

    quote = mocks["saved"].await_args.args[2]
    by_room: dict[str | None, list[str]] = {}
    for item in quote.items:
        by_room.setdefault(item.room_id, []).append(item.sku)
    assert by_room == {
        "bagno1": ["BAG-SAN-001"],
        "cucina1": ["CUC-TOP-002"],
        DEFAULT_ROOM_ID: ["IMP-EL-002", "SMAL-001", "SC-002"],
    }
    general = {i.sku: i.qty for i in quote.items if i.room_id == DEFAULT_ROOM_ID}
    assert general == {"IMP-EL-002": 1.0, "SMAL-001": 1.0, "SC-002": 1.0}  # 0.4 + 0.5 container → 1
    assert [(s.room_id, s.room_label) for s in quote.rooms] == [
        ("bagno1", "Bagno"), ("cucina1", "Cucina"), (DEFAULT_ROOM_ID, "Generale"),
    ]
    assert sum_amounts(s.room_subtotal for s in quote.rooms) == quote.financials.subtotal
    request = mocks["saved"].await_args.args[3]
    assert request.summary == "Bagno: Bagno nuovo con doccia\nCucina: Cucina con top in quarzo"


async def test_rooms_run_in_parallel_within_the_limit():
    rooms = [_room(f"r{n}", f"Stanza {n}", "camera") for n in range(6)]
    files = [_file(f"f{n}", f"r{n}") for n in range(6)]
    running = peak = 0

    async def analyze(chat_history, media_urls=None, *, session_id=None):
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.01)
        running -= 1
        return InsightAnalysis(summary="Pittura", completeness_score=0.9, suggestions=[_s("PIT-001", 10)])

    history = [{"role": "user", "content": f"pittura {n}", "room_id": f"r{n}"} for n in range(6)]
    with _project(rooms=rooms, files=files, history=history, engine=AsyncMock(side_effect=analyze)) as mocks:
        await _quote()

    assert mocks["analyze"].await_count == 6
    assert 1 < peak <= _ROOM_ANALYSIS_CONCURRENCY


async def test_a_room_short_of_data_asks_its_questions_instead_of_a_partial_quote():
    analyses = {
        **ANALYSES,
        "Cucina": InsightAnalysis(summary="Cucina", completeness_score=0.4, missing_info=["Quanti metri di top?"],
                                  suggestions=[_s("CUC-TOP-002", 1)]),
    }
    with _project(analyses=analyses) as mocks:
        reply = await _quote()

    assert "**Cucina**: Quanti metri di top?" in reply
    mocks["saved"].assert_not_awaited()


async def test_an_engine_failure_in_one_room_fails_the_quote():
    async def analyze(chat_history, media_urls=None, *, session_id=None):
        if "Stanza da quotare: Cucina" in chat_history[0]["content"]:
            raise InsightEngineError("boom")
        return ANALYSES["Bagno"]

    with _project(engine=AsyncMock(side_effect=analyze)) as mocks:
        reply = await _quote()

    assert reply.startswith("Non è stato possibile analizzare automaticamente il progetto")
    mocks["saved"].assert_not_awaited()


async def test_a_room_with_nothing_to_quote_gets_no_section():
    analyses = {**ANALYSES, "Cucina": InsightAnalysis(summary="Solo foto", completeness_score=0.9, suggestions=[])}
    with _project(analyses=analyses) as mocks:
        await _quote()

    quote = mocks["saved"].await_args.args[2]
    assert [s.room_id for s in quote.rooms] == ["bagno1", DEFAULT_ROOM_ID]


async def test_without_named_rooms_the_whole_chat_is_one_quote_without_sections():
    files = [_file("f_vecchia", DEFAULT_ROOM_ID)]
    history = [{"role": "user", "content": "Rifaccio il bagno", "attachments": {"images": [_path("f_vecchia")]}}]
    analysis = InsightAnalysis(summary="Bagno", completeness_score=0.9, suggestions=[_s("BAG-SAN-001", 1)])
    with _project(rooms=ROOMS[:1], files=files, history=history, engine=AsyncMock(return_value=analysis)) as mocks:
        await _quote()

    assert mocks["analyze"].await_count == 1
    assert mocks["analyze"].await_args.args[1] == [_path("f_vecchia")]
    quote = mocks["saved"].await_args.args[2]
    assert quote.rooms == [] and [i.room_id for i in quote.items] == [None]
    assert quote.financials.subtotal == Decimal("550.00")


async def test_a_room_whose_lines_were_all_discarded_stops_the_quote():
    analyses = {
        **ANALYSES,
        "Cucina": InsightAnalysis(summary="Cucina", completeness_score=0.9, suggestions=[_s("NON-ESISTE-1", 1)]),
    }
    with _project(analyses=analyses) as mocks:
        reply = await _quote()

    assert "Per Cucina non riesco a preparare le voci" in reply
    mocks["saved"].assert_not_awaited()


async def test_a_firestore_error_in_one_room_fails_the_quote_without_saving():
    with _project() as mocks, \
         patch.object(quote_tools, "get_room_repository") as get_repo:
        repo = MagicMock()
        repo.list_rooms = AsyncMock(return_value=ROOMS)
        repo.list_files = AsyncMock(return_value=FILES)
        repo.files_for_room = AsyncMock(side_effect=GoogleAPICallError("index missing"))
        get_repo.return_value = repo
        reply = await _quote()

    assert reply.startswith("Non è stato possibile analizzare automaticamente il progetto")
    mocks["analyze"].assert_not_awaited()
    mocks["saved"].assert_not_awaited()


async def test_a_chat_from_before_rooms_stays_one_quote_even_with_a_filed_photo():
    """No message tagged with a room: the talk is the whole project, not background."""
    history = [{"role": "user", "content": "Rifaccio bagno e cucina"}]
    analysis = InsightAnalysis(summary="Casa", completeness_score=0.9, suggestions=[_s("PIT-001", 10)])
    with _project(history=history, engine=AsyncMock(return_value=analysis)) as mocks:
        await _quote()

    assert mocks["analyze"].await_count == 1
    assert "Stanza da quotare" not in mocks["analyze"].await_args.args[0][0]["content"]
    assert mocks["saved"].await_args.args[2].rooms == []


# ── "Generale": the rest of the home (Phase 138 PR-6) ─────────────────────────

CORRIDOR = "Rifate anche il corridoio: parquet, circa 8 mq."
HISTORY_WITH_CORRIDOR = [*HISTORY, {"role": "user", "content": CORRIDOR}]
CORRIDOR_ANALYSES = {
    **ANALYSES,
    "Generale": InsightAnalysis(
        summary="Corridoio in parquet", completeness_score=0.9,
        suggestions=[_s("PAV-002", 8), _s("SC-002", 1)],
    ),
}


async def test_the_rest_of_the_home_is_one_more_unit_quoted_in_generale():
    with _project(history=HISTORY_WITH_CORRIDOR, analyses=CORRIDOR_ANALYSES) as mocks:
        reply = await _quote()

    context, media = _calls_by_room(mocks["analyze"])["Generale"]
    # Its own messages (untagged or "Generale"), never a room's; the quoted rooms named as excluded.
    assert CORRIDOR in context and "Ristrutturo casa" in context
    assert "doccia" not in context and "top in quarzo" not in context
    assert "stanze già quotate (Bagno, Cucina)" in context
    assert media == [_path("f_vecchia")]  # the photos filed in Generale
    # The other rooms are told that rooms never created belong to Generale.
    assert "sezione Generale" in _calls_by_room(mocks["analyze"])["Bagno"][0]

    quote = mocks["saved"].await_args.args[2]
    general = {i.sku: i.qty for i in quote.items if i.room_id == DEFAULT_ROOM_ID}
    assert general["PAV-002"] == 8.0 and general["SC-002"] == 1.0  # protection once for the home
    assert not [i for i in quote.items if i.room_id == DEFAULT_ROOM_ID and i.sku.startswith(("BAG-", "CUC-"))]
    assert sum_amounts(s.room_subtotal for s in quote.rooms) == quote.financials.subtotal
    assert "**Generale** — Corridoio in parquet" in reply


async def test_generale_with_nothing_to_quote_adds_no_section_and_stops_nothing():
    analyses = {**ANALYSES, "Generale": InsightAnalysis(
        summary="Niente", completeness_score=0.2, missing_info=["Altri ambienti?"], suggestions=[],
    )}
    with _project(analyses=analyses) as mocks:
        reply = await _quote()

    assert "Altri ambienti?" not in reply
    quote = mocks["saved"].await_args.args[2]
    assert {i.room_id for i in quote.items if i.sku == "PAV-002"} == set()
    assert "Generale" not in mocks["saved"].await_args.args[3].summary


async def test_generale_short_of_data_asks_its_questions_like_a_room():
    analyses = {**CORRIDOR_ANALYSES, "Generale": InsightAnalysis(
        summary="Corridoio", completeness_score=0.4, missing_info=["Quanti mq ha il corridoio?"],
        suggestions=[_s("PAV-002", 1)],
    )}
    with _project(history=HISTORY_WITH_CORRIDOR, analyses=analyses) as mocks:
        reply = await _quote()

    assert "**Generale**: Quanti mq ha il corridoio?" in reply
    mocks["saved"].assert_not_awaited()


async def test_generale_is_not_analysed_without_its_own_talk_or_brief():
    history = [m for m in HISTORY if m.get("room_id")]
    with _project(history=history) as mocks:
        await _quote()

    assert set(_calls_by_room(mocks["analyze"])) == {"Bagno", "Cucina"}


async def test_the_generale_brief_alone_is_worth_an_analysis():
    generale = ROOMS[0].model_copy(update={"summary": "Corridoio da rifare in parquet, 8 mq"})
    history = [m for m in HISTORY if m.get("room_id")]
    with _project(rooms=[generale, *ROOMS[1:]], history=history, analyses=CORRIDOR_ANALYSES) as mocks:
        await _quote()

    context, _ = _calls_by_room(mocks["analyze"])["Generale"]
    assert "Corridoio da rifare in parquet" in context


async def test_generale_with_only_home_wide_lines_does_not_stop_the_quote():
    """Protection or disposal for the whole home need no measure of the rest of
    the home: their questions never stop the quote (eval, 29 Oct: 2 runs in 3)."""
    analyses = {**ANALYSES, "Generale": InsightAnalysis(
        summary="Protezioni", completeness_score=0.5, missing_info=["Quanti mq ha il resto della casa?"],
        suggestions=[_s("SC-002", 1), _s("SMAL-001", 0.2)],
    )}
    with _project(analyses=analyses) as mocks:
        reply = await _quote()

    assert "Quanti mq" not in reply
    quote = mocks["saved"].await_args.args[2]
    general = {i.sku: i.qty for i in quote.items if i.room_id == DEFAULT_ROOM_ID}
    assert general["SC-002"] == 1.0 and general["SMAL-001"] == 2.0  # 0.4 + 0.5 + 0.2 → 2 containers
    context, _ = _calls_by_room(mocks["analyze"])["Generale"]
    assert "non fare domande" in context
