"""One quote for the whole home (Phase 138, PR-3): every room analysed on its own
media and messages, in parallel, then merged into sections ("Generale" last)."""
import asyncio
from contextlib import contextmanager
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

from google.api_core.exceptions import GoogleAPICallError, NotFound
from pydantic import ValidationError
from src.core.money import sum_amounts
from src.schemas.intervention_spec import StoredMeasure, StoredPackage
from src.schemas.quote import ManualWorkItem
from src.schemas.room import DEFAULT_ROOM_ID, RoomBrief, RoomSchema
from src.services.assembly_library import load_library
from src.services.insight_engine import (
    ElementChoice,
    InsightAnalysis,
    InsightEngineError,
    PackageChoice,
    SKUItemSuggestion,
    SpecMeasure,
)
from src.services.intervention_expansion import MEASURE_QUESTIONS
from src.services.pricing_service import PricingService
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
    repo.save_intervention_spec = AsyncMock()
    saved = AsyncMock(return_value=DraftSaveResult(DraftSaveOutcome.CREATED, "draft", "PRV-2026-0042", 1))
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
        yield {"analyze": analyze, "measure": measure, "delta": delta, "saved": saved, "repo": repo}


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


# ── Phase 140 step 1: the code expands the model's spec ──────────────────────


def _bathroom(**fields: Any) -> InsightAnalysis:
    """A full bathroom of 6 mq, as the model compiles it (package + declared measure)."""
    spec: dict[str, Any] = {
        "summary": "Bagno da rifare, 6 mq",
        "completeness_score": 0.9,
        "packages": [PackageChoice(assembly_id="ASM-BAGNO-FULL")],
        "measures": [SpecMeasure(name="mq", value=6, source="declared")],
    }
    return InsightAnalysis(**{**spec, **fields})


def _saved_specs(repo: MagicMock) -> dict[str, Any]:
    calls = repo.save_intervention_spec.await_args_list
    assert all(call.args[0] == PID for call in calls)
    return {call.args[1]: call.args[2] for call in calls}


async def test_package_choice_is_expanded_by_code():
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}) as mocks:
        await _quote()

    quote = mocks["saved"].await_args.args[2]
    bagno = {i.sku: i for i in quote.items if i.room_id == "bagno1"}
    # mq * 2.2 * 1.05 and mq * 2.2, computed by code from the declared 6 mq.
    assert bagno["BAG-RIV-001"].qty == 13.86 and bagno["MUR-004"].qty == 13.2
    assert "mq=6" in (bagno["BAG-RIV-001"].ai_reasoning or "")
    # The package's disposal is a container share (6 * 0.4 / 7 = 0.34 + 0.35 of the walls),
    # merged into "Generale" with the kitchen's 0.5: 1.19 → 2 containers (1 without the package).
    assert {i.room_id: i.qty for i in quote.items if i.sku == "SMAL-001"} == {DEFAULT_ROOM_ID: 2.0}


async def test_missing_measure_gates_the_room_with_a_measure_question():
    with _project(analyses={**ANALYSES, "Bagno": _bathroom(measures=[])}) as mocks:
        reply = await _quote()

    assert f"**Bagno**: {MEASURE_QUESTIONS['mq']}" in reply
    mocks["saved"].assert_not_awaited()


async def test_the_measure_question_comes_before_the_model_questions():
    """At most two questions per room: the measure that blocks a line is never crowded out."""
    analysis = _bathroom(measures=[], completeness_score=0.5, missing_info=["Doccia o vasca?", "Che piastrelle?"])
    with _project(analyses={**ANALYSES, "Bagno": analysis}):
        reply = await _quote()

    assert f"**Bagno**: {MEASURE_QUESTIONS['mq']} Doccia o vasca?" in reply
    assert "Che piastrelle?" not in reply


async def test_a_missing_measure_is_taken_from_the_room_brief():
    bagno = ROOMS[1].model_copy(update={"brief": RoomBrief(floor_mq=6)})
    rooms = [ROOMS[0], bagno, ROOMS[2]]
    with _project(rooms=rooms, analyses={**ANALYSES, "Bagno": _bathroom(measures=[])}) as mocks:
        await _quote()

    quote = mocks["saved"].await_args.args[2]
    assert {i.sku: i.qty for i in quote.items if i.room_id == "bagno1"}["BAG-RIV-001"] == 13.86
    assert _saved_specs(mocks["repo"])["bagno1"].measures == [StoredMeasure(name="mq", value=6.0, source="brief")]


async def test_a_room_with_only_packages_is_not_stopped_by_minor_questions():
    """The gate reads the expanded lines: a room quoted by packages alone has lines."""
    analysis = _bathroom(missing_info=["Che piastrelle preferisci?"])
    with _project(analyses={**ANALYSES, "Bagno": analysis}) as mocks:
        reply = await _quote()

    assert "Che piastrelle" not in reply
    mocks["saved"].assert_awaited_once()


async def test_manual_work_and_warnings_reach_the_request():
    analysis = _bathroom(
        element_choices=[ElementChoice(element="sanitari", action="keep")],
        unmapped_work_requests=["Vespaio aerato sotto il pavimento"],
    )
    with _project(analyses={**ANALYSES, "Bagno": analysis}) as mocks:
        await _quote()

    request = mocks["saved"].await_args.args[3]
    bagno = {"room_id": "bagno1", "room_label": "Bagno"}
    assert ManualWorkItem(work="Rubinetteria (fornitura)", origin="package", **bagno) in request.manual_work
    assert ManualWorkItem(
        work="Smontaggio con cura e rimontaggio dei sanitari esistenti", origin="reuse", **bagno
    ) in request.manual_work
    assert ManualWorkItem(
        work="Vespaio aerato sotto il pavimento", origin="client_request", **bagno
    ) in request.manual_work
    kept = [w for w in request.ai_warnings if w.kind == "element_kept_but_demolished"]
    assert len(kept) == 1 and "DEM-002" in kept[0].skus
    # The label is stored with the item: a room with only manual work has no quote section to name it.
    assert (kept[0].room_id, kept[0].room_label) == ("bagno1", "Bagno")


async def test_client_reply_lists_the_work_quoted_by_hand():
    requests = [f"Lavoro speciale {n}" for n in range(1, 7)]
    analysis = InsightAnalysis(
        summary="Bagno", completeness_score=0.9, suggestions=[_s("BAG-SAN-001", 1)], unmapped_work_requests=requests,
    )
    with _project(analyses={**ANALYSES, "Bagno": analysis}):
        reply = await _quote()

    assert (
        "Alcune lavorazioni le quoterà a mano il nostro tecnico: Lavoro speciale 1, Lavoro speciale 2, "
        "Lavoro speciale 3, Lavoro speciale 4, Lavoro speciale 5 e altre."
    ) in reply


async def test_a_price_book_gap_reaches_the_admin_not_the_client():
    book = [item for item in PricingService.load_price_book() if item["sku"] != "MUR-004"]
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}) as mocks, \
         patch.object(PricingService, "load_price_book", return_value=book):
        reply = await _quote()

    request = mocks["saved"].await_args.args[3]
    gaps = [m for m in request.manual_work if m.origin == "price_book"]
    assert len(gaps) == 1 and "MUR-004" in gaps[0].work and gaps[0].room_id == "bagno1"
    assert any(w.kind == "price_book_mismatch" for w in request.ai_warnings)
    assert "MUR-004" not in reply and "Rubinetteria (fornitura)" in reply


async def test_the_spec_is_saved_on_each_room_with_the_extras_kept():
    analysis = _bathroom(suggestions=[_s("IMP-ID-003", 1), _s("NON-ESISTE-1", 2)])
    with _project(analyses={**ANALYSES, "Bagno": analysis}) as mocks:
        await _quote()

    specs = _saved_specs(mocks["repo"])
    assert set(specs) == {"bagno1", "cucina1", DEFAULT_ROOM_ID}  # "Generale" too: its document exists
    spec = specs["bagno1"]
    assert spec.packages == [StoredPackage(assembly_id="ASM-BAGNO-FULL")]
    assert spec.measures == [StoredMeasure(name="mq", value=6.0, source="declared")]
    assert [x.sku for x in spec.extra_items] == ["IMP-ID-003"]  # the unknown SKU is not stored
    library = load_library()
    assert library is not None and spec.library_version == library.version


async def test_a_spec_save_failure_does_not_block_the_quote(caplog):
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}) as mocks:
        mocks["repo"].save_intervention_spec.side_effect = NotFound("room deleted")
        reply = await _quote()

    mocks["saved"].assert_awaited_once()
    assert "PRV-2026-0042" in reply
    assert "Intervention spec not saved" in caplog.text


async def test_without_the_library_the_single_lines_still_make_the_quote():
    with _project() as mocks, patch.object(quote_tools, "load_library", return_value=None):
        await _quote()

    quote = mocks["saved"].await_args.args[2]
    assert [i.sku for i in quote.items if i.room_id == "bagno1"] == ["BAG-SAN-001"]
    mocks["repo"].save_intervention_spec.assert_not_awaited()


async def test_a_chat_without_rooms_asks_for_the_missing_measure():
    files = [_file("f_vecchia", DEFAULT_ROOM_ID)]
    history = [{"role": "user", "content": "Rifaccio il bagno"}]
    engine = AsyncMock(return_value=_bathroom(measures=[]))
    with _project(rooms=ROOMS[:1], files=files, history=history, engine=engine) as mocks:
        reply = await _quote()

    assert MEASURE_QUESTIONS["mq"] in reply
    mocks["saved"].assert_not_awaited()
    mocks["repo"].save_intervention_spec.assert_not_awaited()  # no room holds a whole-chat spec


async def test_the_disposal_share_is_asked_only_outside_the_chosen_packages():
    with _project() as mocks:
        await _quote()

    calls = _calls_by_room(mocks["analyze"])
    for label in ("Bagno", "Generale"):
        assert "solo se nessun pacchetto scelto lo comprende" in calls[label][0]


async def test_a_spec_that_cannot_be_built_does_not_block_the_quote(caplog):
    invalid = ValidationError.from_exception_data("RoomInterventionSpec", [])
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}) as mocks, \
         patch.object(quote_tools, "spec_from_analysis", side_effect=invalid):
        await _quote()

    mocks["saved"].assert_awaited_once()
    mocks["repo"].save_intervention_spec.assert_not_awaited()
    assert "Intervention spec not saved" in caplog.text


async def test_an_infinite_quantity_is_rejected_not_fatal():
    """JSON `Infinity` passes the model's ge=0.01: the bounds check drops the line."""
    analysis = InsightAnalysis(
        summary="Bagno", completeness_score=0.9, suggestions=[_s("BAG-SAN-001", 1), _s("PIT-001", float("inf"))],
    )
    with _project(analyses={**ANALYSES, "Bagno": analysis}) as mocks:
        await _quote()

    quote = mocks["saved"].await_args.args[2]
    assert [i.sku for i in quote.items if i.room_id == "bagno1"] == ["BAG-SAN-001"]


async def test_a_quote_without_rooms_names_no_room_on_the_manual_work():
    files = [_file("f_vecchia", DEFAULT_ROOM_ID)]
    history = [{"role": "user", "content": "Rifaccio il bagno"}]
    analysis = InsightAnalysis(
        summary="Bagno", completeness_score=0.9, suggestions=[_s("BAG-SAN-001", 1)],
        unmapped_work_requests=["Vespaio aerato"],
    )
    with _project(rooms=ROOMS[:1], files=files, history=history, engine=AsyncMock(return_value=analysis)) as mocks:
        await _quote()

    request = mocks["saved"].await_args.args[3]
    assert request.manual_work == [ManualWorkItem(work="Vespaio aerato", origin="client_request")]
