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
from src.repositories.spec_store import CHAT_SPEC_KEY
from src.schemas.intervention_spec import RoomInterventionSpec, StoredElementChoice, StoredMeasure, StoredPackage
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
from src.tools.quote_tools import (
    _CARD_DRAFT_NOTE,
    _CARD_MEASURES_NOTE,
    _ROOM_ANALYSIS_CONCURRENCY,
    MEASURES_TO_REPORT,
    suggest_quote_items_wrapper,
)
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
def _project(
    rooms=ROOMS, files=FILES, history=HISTORY, analyses=None, engine=None, specs=None, specs_at_save=None,
    specs_at_draft=None,
):
    """`specs`: what the tool reads before the analysis; `specs_at_save`: what is
    stored when it writes (a card confirmation made meanwhile), `specs` if None;
    `specs_at_draft`: what it reads again before the draft (a confirmation made after
    its write), else what is stored with what it wrote."""
    repo = MagicMock()
    repo.list_rooms = AsyncMock(return_value=rooms)
    repo.list_files = AsyncMock(return_value=files)
    repo.files_for_room = AsyncMock(side_effect=_files_for_room(files))
    store = MagicMock()
    store.written = {}
    current = specs if specs_at_save is None else specs_at_save
    first_read = iter([specs or {}])

    def load_all(project_id):
        assert project_id == PID
        later = specs_at_draft if specs_at_draft is not None else {**(current or {}), **store.written}
        return next(first_read, later)

    store.load_all = AsyncMock(side_effect=load_all)

    async def update(project_id, section_key, change):
        assert project_id == PID
        store.written[section_key] = change((current or {}).get(section_key))
        return store.written[section_key]

    store.update = AsyncMock(side_effect=update)
    saved = AsyncMock(return_value=DraftSaveResult(DraftSaveOutcome.CREATED, "draft", "PRV-2026-0042", 1))
    analyze = engine or _engine(analyses or ANALYSES)
    with patch.object(quote_tools, "get_room_repository", return_value=repo), \
         patch.object(quote_tools, "get_spec_store", return_value=store), \
       patch.object(quote_tools, "ConversationRepository") as conversations, \
         patch.object(quote_tools, "get_insight_engine") as get_engine, \
         patch.object(quote_tools, "_run_measurement_vision", AsyncMock(return_value="\n\n## Misure: 6 mq")) as measure, \
         patch.object(quote_tools, "_structural_delta", AsyncMock(return_value="\n\n## Delta")) as delta, \
         patch.object(quote_tools, "save_ai_draft", saved), \
         patch.object(quote_tools, "gather_dossier_inputs", AsyncMock(return_value=None)), \
         patch.object(quote_tools, "get_async_firestore_client"):
        conversations.return_value.get_context = AsyncMock(side_effect=_history(history))
        get_engine.return_value.analyze_project_for_quote = analyze
        yield {"analyze": analyze, "measure": measure, "delta": delta, "saved": saved, "repo": repo, "store": store}


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


def _saved_specs(store: MagicMock) -> dict[str, Any]:
    return store.written


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


async def test_missing_measures_reply_points_to_card():
    """The card asks for the measure: the reply no longer asks it in words."""
    with _project(analyses={**ANALYSES, "Bagno": _bathroom(measures=[])}) as mocks:
        reply = await _quote()

    assert _CARD_MEASURES_NOTE in reply and "scheda" in _CARD_MEASURES_NOTE
    assert MEASURE_QUESTIONS["mq"] not in reply
    assert "**Bagno**" not in reply  # a room with nothing else to ask has no line of questions
    mocks["saved"].assert_not_awaited()


async def test_the_model_questions_stay_in_words_next_to_the_card():
    analysis = _bathroom(measures=[], completeness_score=0.5, missing_info=["Doccia o vasca?", "Che piastrelle?"])
    with _project(analyses={**ANALYSES, "Bagno": analysis}):
        reply = await _quote()

    assert "**Bagno**: Doccia o vasca? Che piastrelle?" in reply
    assert reply.endswith(_CARD_MEASURES_NOTE)
    assert MEASURE_QUESTIONS["mq"] not in reply


async def test_the_card_note_comes_once_for_all_the_rooms_that_need_it():
    analyses = {**ANALYSES, "Bagno": _bathroom(measures=[]), "Cucina": _bathroom(measures=[])}
    with _project(analyses=analyses):
        reply = await _quote()

    assert reply.count(_CARD_MEASURES_NOTE) == 1


async def test_a_measure_the_card_cannot_show_is_asked_in_words(caplog):
    """The spec could not be stored: no card for the room, so the question stays."""
    with _project(analyses={**ANALYSES, "Bagno": _bathroom(measures=[])}) as mocks:
        mocks["store"].update.side_effect = NotFound("room deleted")
        reply = await _quote()

    assert f"**Bagno**: {MEASURE_QUESTIONS['mq']}" in reply
    assert _CARD_MEASURES_NOTE not in reply


async def test_conflicting_values_ask_the_room_in_words_and_point_to_the_card():
    files = [_file("f_vecchia", DEFAULT_ROOM_ID)]
    history = [{"role": "user", "content": "Bagno da 6 mq e uno da 9"}]
    analysis = _bathroom(measures=[SpecMeasure(name="mq", value=6, source="declared"),
                                   SpecMeasure(name="mq", value=9, source="declared")])
    with _project(rooms=ROOMS[:1], files=files, history=history, engine=AsyncMock(return_value=analysis)):
        reply = await _quote()

    assert "a quale stanza" in reply and "6 e 9" in reply
    assert _CARD_MEASURES_NOTE in reply


async def test_a_missing_measure_is_taken_from_the_room_brief():
    bagno = ROOMS[1].model_copy(update={"brief": RoomBrief(floor_mq=6)})
    rooms = [ROOMS[0], bagno, ROOMS[2]]
    with _project(rooms=rooms, analyses={**ANALYSES, "Bagno": _bathroom(measures=[])}) as mocks:
        await _quote()

    quote = mocks["saved"].await_args.args[2]
    assert {i.sku: i.qty for i in quote.items if i.room_id == "bagno1"}["BAG-RIV-001"] == 13.86
    assert _saved_specs(mocks["store"])["bagno1"].measures == [StoredMeasure(name="mq", value=6.0, source="brief")]


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

    specs = _saved_specs(mocks["store"])
    assert set(specs) == {"bagno1", "cucina1", DEFAULT_ROOM_ID}  # "Generale" too: its document exists
    spec = specs["bagno1"]
    assert spec.packages == [StoredPackage(assembly_id="ASM-BAGNO-FULL")]
    assert spec.measures == [StoredMeasure(name="mq", value=6.0, source="declared")]
    assert [x.sku for x in spec.extra_items] == ["IMP-ID-003"]  # the unknown SKU is not stored
    library = load_library()
    assert library is not None and spec.library_version == library.version


async def test_a_spec_save_failure_does_not_block_the_quote(caplog):
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}) as mocks:
        mocks["store"].update.side_effect = NotFound("room deleted")
        reply = await _quote()

    mocks["saved"].assert_awaited_once()
    assert "PRV-2026-0042" in reply
    assert "Intervention spec not saved" in caplog.text


async def test_without_the_library_the_single_lines_still_make_the_quote():
    with _project() as mocks, patch.object(quote_tools, "load_library", return_value=None):
        await _quote()

    quote = mocks["saved"].await_args.args[2]
    assert [i.sku for i in quote.items if i.room_id == "bagno1"] == ["BAG-SAN-001"]
    mocks["store"].update.assert_not_awaited()


async def test_a_chat_without_rooms_points_to_the_card_for_the_missing_measure():
    files = [_file("f_vecchia", DEFAULT_ROOM_ID)]
    history = [{"role": "user", "content": "Rifaccio il bagno"}]
    engine = AsyncMock(return_value=_bathroom(measures=[]))
    with _project(rooms=ROOMS[:1], files=files, history=history, engine=engine) as mocks:
        reply = await _quote()

    assert _CARD_MEASURES_NOTE in reply and MEASURE_QUESTIONS["mq"] not in reply
    mocks["saved"].assert_not_awaited()
    # Saved before the gate, with what the card asks for.
    assert _saved_specs(mocks["store"])[CHAT_SPEC_KEY].missing_measures == ["mq"]


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
    mocks["store"].update.assert_not_awaited()
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


def _draft_specs(saved: AsyncMock) -> dict[str | None, Any]:
    return {s.room_id: s.spec for s in saved.await_args.kwargs["specs"]}


async def test_the_draft_carries_the_spec_of_each_quoted_room():
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}) as mocks:
        await _quote()

    specs = _draft_specs(mocks["saved"])
    assert set(specs) == {"bagno1", "cucina1"}, "one spec per quoted room"
    assert specs["bagno1"] == _saved_specs(mocks["store"])["bagno1"], "the same spec as the room's"
    assert specs["bagno1"].packages == [StoredPackage(assembly_id="ASM-BAGNO-FULL")]


async def test_the_draft_of_a_chat_without_rooms_carries_its_spec_without_a_room():
    files = [_file("f_vecchia", DEFAULT_ROOM_ID)]
    history = [{"role": "user", "content": "Rifaccio il bagno di 6 mq"}]
    with _project(rooms=ROOMS[:1], files=files, history=history, engine=AsyncMock(return_value=_bathroom())) as mocks:
        await _quote()

    specs = _draft_specs(mocks["saved"])
    assert list(specs) == [None]
    assert specs[None].measures == [StoredMeasure(name="mq", value=6.0, source="declared")]
    assert set(_saved_specs(mocks["store"])) == {CHAT_SPEC_KEY}


async def test_without_the_library_the_draft_has_no_spec():
    with _project() as mocks, patch.object(quote_tools, "load_library", return_value=None):
        await _quote()

    assert mocks["saved"].await_args.kwargs["specs"] == []


# ── Phase 140 step 3: the client's confirmations survive a new analysis ──────


def _stored(**fields: Any) -> RoomInterventionSpec:
    return RoomInterventionSpec.model_validate({"library_version": "2.1.0", "generated_at": utc_now(), **fields})


async def test_confirmed_measure_used_in_expansion():
    """The client confirmed 8 mq on the card; the new analysis says 6: the lines use 8,
    the 6 is a proposal for the client and a check for the team."""
    stored = _stored(measures=[{"name": "mq", "value": 8, "source": "confirmed"}])
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}, specs={"bagno1": stored}) as mocks:
        await _quote()

    quote = mocks["saved"].await_args.args[2]
    bagno = {i.sku: i.qty for i in quote.items if i.room_id == "bagno1"}
    assert bagno["BAG-RIV-001"] == 18.48 and bagno["MUR-004"] == 17.6  # 8 * 2.2 * 1.05, 8 * 2.2
    assert _saved_specs(mocks["store"])["bagno1"].measures == [
        StoredMeasure(name="mq", value=8.0, source="confirmed", proposed=6.0)
    ]
    request = mocks["saved"].await_args.args[3]
    checks = [w for w in request.ai_warnings if w.kind == "admin_check" and "confermato 8" in w.message]
    assert len(checks) == 1 and checks[0].room_id == "bagno1"


async def test_confirmed_choice_used_in_expansion():
    stored = _stored(element_choices=[{"element": "sanitari", "action": "replace", "confirmed": True}])
    analysis = _bathroom(element_choices=[ElementChoice(element="sanitari", action="keep")])
    with _project(analyses={**ANALYSES, "Bagno": analysis}, specs={"bagno1": stored}) as mocks:
        await _quote()

    request = mocks["saved"].await_args.args[3]
    assert all(m.origin != "reuse" for m in request.manual_work)  # replaced, not taken off and put back
    assert _saved_specs(mocks["store"])["bagno1"].element_choices == [
        StoredElementChoice(element="sanitari", action="replace", confirmed=True)
    ]


async def test_spec_saved_for_chat_without_rooms():
    files = [_file("f_vecchia", DEFAULT_ROOM_ID)]
    history = [{"role": "user", "content": "Rifaccio il bagno"}]
    with _project(rooms=ROOMS[:1], files=files, history=history, engine=AsyncMock(return_value=_bathroom())) as mocks:
        await _quote()

    mocks["saved"].assert_awaited_once()
    spec = _saved_specs(mocks["store"])[CHAT_SPEC_KEY]
    assert spec.measures == [StoredMeasure(name="mq", value=6.0, source="declared")]
    assert spec.missing_measures == [] and spec.conflicts == {}


async def test_missing_measures_saved_before_gate():
    with _project(analyses={**ANALYSES, "Bagno": _bathroom(measures=[])}) as mocks:
        reply = await _quote()

    assert _CARD_MEASURES_NOTE in reply
    mocks["saved"].assert_not_awaited()
    assert _saved_specs(mocks["store"])["bagno1"].missing_measures == ["mq"]


async def test_conflicting_measures_are_saved_for_the_card():
    files = [_file("f_vecchia", DEFAULT_ROOM_ID)]
    history = [{"role": "user", "content": "Bagno da 6 mq e uno da 9"}]
    analysis = _bathroom(measures=[SpecMeasure(name="mq", value=6, source="declared"),
                                   SpecMeasure(name="mq", value=9, source="declared")])
    with _project(rooms=ROOMS[:1], files=files, history=history, engine=AsyncMock(return_value=analysis)) as mocks:
        await _quote()

    spec = _saved_specs(mocks["store"])[CHAT_SPEC_KEY]
    assert spec.conflicts == {"mq": [6.0, 9.0]} and spec.missing_measures == ["mq"]


async def test_specs_not_readable_are_not_overwritten(caplog):
    """A confirmation the analysis could not read must not be replaced by the model's values."""
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}) as mocks:
        mocks["store"].load_all.side_effect = GoogleAPICallError("unavailable")
        reply = await _quote()

    assert "PRV-2026-0042" in reply
    mocks["store"].update.assert_not_awaited()
    assert "Intervention specs not readable" in caplog.text
    assert PID not in caplog.text


async def test_a_confirmation_made_during_the_analysis_is_kept():
    """The client confirms 9 mq on the card while the model analyses: the save re-reads it."""
    meanwhile = _stored(measures=[{"name": "mq", "value": 9, "source": "confirmed"}])
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}, specs_at_save={"bagno1": meanwhile}) as mocks:
        await _quote()

    assert _saved_specs(mocks["store"])["bagno1"].measures == [
        StoredMeasure(name="mq", value=9.0, source="confirmed", proposed=6.0)
    ]


async def test_a_confirmed_keep_against_a_model_replace_is_a_check():
    stored = _stored(element_choices=[{"element": "sanitari", "action": "keep", "confirmed": True}])
    analysis = _bathroom(element_choices=[ElementChoice(element="sanitari", action="replace")])
    with _project(analyses={**ANALYSES, "Bagno": analysis}, specs={"bagno1": stored}) as mocks:
        await _quote()

    request = mocks["saved"].await_args.args[3]
    checks = [w for w in request.ai_warnings if w.kind == "admin_check" and "sanitari" in w.message]
    assert len(checks) == 1 and checks[0].room_id == "bagno1"


# ── A chat without rooms that gains rooms keeps its confirmations ────────────

_CHAT_CONFIRMED = {"chat": _stored(measures=[{"name": "mq", "value": 8, "source": "confirmed"}])}


async def test_chat_confirmations_go_to_the_one_room_quoted():
    files = [_file("f_bagno", "bagno1")]
    history = [{"role": "user", "content": "Rifaccio il bagno", "room_id": "bagno1"}]
    with _project(files=files, history=history, analyses={**ANALYSES, "Bagno": _bathroom()},
                  specs=_CHAT_CONFIRMED) as mocks:
        await _quote()

    quote = mocks["saved"].await_args.args[2]
    assert {i.sku: i.qty for i in quote.items if i.room_id == "bagno1"}["BAG-RIV-001"] == 18.48  # 8 mq
    assert _saved_specs(mocks["store"])["bagno1"].measures == [
        StoredMeasure(name="mq", value=8.0, source="confirmed", proposed=6.0)
    ]


async def test_chat_confirmations_are_not_assigned_with_several_rooms():
    """Two rooms or more: whose were the 8 mq? No section takes them (a wrong measure
    would price a room and look confirmed); the team reads them, the card asks again."""
    with _project(specs=_CHAT_CONFIRMED) as mocks:
        await _quote()

    specs = _saved_specs(mocks["store"])
    assert all(m.source != "confirmed" for spec in specs.values() for m in spec.measures)
    request = mocks["saved"].await_args.args[3]
    notes = [w for w in request.ai_warnings if w.kind == "admin_check" and "non assegnate" in w.message]
    assert len(notes) == 1 and notes[0].room_id is None
    assert "pavimento della stanza (m²) 8" in notes[0].message


async def test_chat_confirmations_never_replace_a_room_spec():
    files = [_file("f_bagno", "bagno1")]
    history = [{"role": "user", "content": "Rifaccio il bagno", "room_id": "bagno1"}]
    own = _stored(measures=[{"name": "mq", "value": 5, "source": "confirmed"}])
    with _project(files=files, history=history, analyses={**ANALYSES, "Bagno": _bathroom()},
                  specs={**_CHAT_CONFIRMED, "bagno1": own}) as mocks:
        await _quote()

    assert _saved_specs(mocks["store"])["bagno1"].measures[0].value == 5.0


# ── Phase 140 step 3: the tool's draft goes through the shared pipeline ──────


async def test_lines_follow_a_confirmation_made_during_the_analysis():
    """The client confirms 9 mq on the card while the model analyses (6 mq): the draft uses 9."""
    meanwhile = _stored(measures=[{"name": "mq", "value": 9, "source": "confirmed"}])
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}, specs_at_save={"bagno1": meanwhile}) as mocks:
        await _quote()

    quote = mocks["saved"].await_args.args[2]
    assert {i.sku: i.qty for i in quote.items if i.room_id == "bagno1"}["MUR-004"] == 19.8  # 9 * 2.2
    assert _draft_specs(mocks["saved"])["bagno1"] == _saved_specs(mocks["store"])["bagno1"]
    request = mocks["saved"].await_args.args[3]
    assert any(w.kind == "admin_check" and "confermato 9" in w.message for w in request.ai_warnings)


async def test_lines_follow_a_confirmation_made_after_the_spec_was_saved():
    """The client confirms 9 mq on the card after the tool saved the spec (6 mq), while
    other rooms are still analysed: the draft the tool saves uses 9, it never
    replaces the card's draft with the old value."""
    later = _stored(measures=[{"name": "mq", "value": 9, "source": "confirmed"}])
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}, specs_at_draft={"bagno1": later}) as mocks:
        await _quote()

    quote = mocks["saved"].await_args.args[2]
    assert {i.sku: i.qty for i in quote.items if i.room_id == "bagno1"}["MUR-004"] == 19.8  # 9 * 2.2
    assert _draft_specs(mocks["saved"])["bagno1"] == later


async def test_conflicting_new_values_for_a_confirmed_measure_reach_the_team():
    stored = _stored(measures=[{"name": "mq", "value": 8, "source": "confirmed"}])
    analysis = _bathroom(measures=[SpecMeasure(name="mq", value=6, source="declared"),
                                   SpecMeasure(name="mq", value=9, source="declared")])
    with _project(analyses={**ANALYSES, "Bagno": analysis}, specs={"bagno1": stored}) as mocks:
        await _quote()

    request = mocks["saved"].await_args.args[3]
    assert any(w.kind == "admin_check" and "più valori (6, 9)" in w.message for w in request.ai_warnings)


async def test_a_whole_chat_unit_is_not_on_the_card_once_rooms_have_specs():
    """The tool falls back to the whole chat while rooms have specs: the card shows
    the rooms, not the chat, so the measure is asked in words."""
    files = [_file("f_vecchia", DEFAULT_ROOM_ID)]
    history = [{"role": "user", "content": "Rifaccio il bagno"}]
    engine = AsyncMock(return_value=_bathroom(measures=[]))
    room_spec = {"bagno1": _stored(measures=[{"name": "mq", "value": 5, "source": "declared"}])}
    with _project(rooms=ROOMS[:1], files=files, history=history, engine=engine, specs=room_spec):
        reply = await _quote()

    assert _CARD_MEASURES_NOTE not in reply and MEASURE_QUESTIONS["mq"] in reply


async def test_the_tool_draft_has_a_price_range():
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}) as mocks:
        await _quote()

    estimate = mocks["saved"].await_args.args[2].estimate
    assert estimate is not None and estimate.low < estimate.high


# ── Phase 140 step 3: the reply invites to the card, with no amount ──────────


async def test_draft_reply_invites_confirmation():
    """The draft was made from measures the model took (declared): the client may confirm them."""
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}):
        reply = await _quote()

    assert _CARD_DRAFT_NOTE in reply and "scheda" in _CARD_DRAFT_NOTE
    assert reply.index(_CARD_DRAFT_NOTE) < reply.index("Vuoi che invii ora la richiesta al team?")


async def test_draft_reply_does_not_invite_when_everything_is_confirmed():
    confirmed = _stored(measures=[{"name": "mq", "value": 6, "source": "confirmed"}])
    analyses = {**ANALYSES, "Bagno": _bathroom(), "Cucina": InsightAnalysis(summary="Cucina", completeness_score=0.9)}
    with _project(analyses=analyses, specs={"bagno1": confirmed}):
        reply = await _quote()

    assert _CARD_DRAFT_NOTE not in reply


async def test_draft_reply_does_not_invite_when_the_card_cannot_show_the_spec():
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}) as mocks:
        mocks["store"].update.side_effect = NotFound("room deleted")
        reply = await _quote()

    assert _CARD_DRAFT_NOTE not in reply


async def test_a_revision_does_not_invite_to_the_card():
    """The quote was already sent: the card is read-only, the team decides the revision."""
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}) as mocks:
        mocks["saved"].return_value = DraftSaveResult(DraftSaveOutcome.REVISED, "draft", "PRV-2026-0042", 2, True)
        reply = await _quote()

    assert "nuova revisione" in reply and _CARD_DRAFT_NOTE not in reply


async def test_no_amount_in_reply():
    """Neither the questions to the client nor the draft's reply tell an amount or a range."""
    with _project(analyses={**ANALYSES, "Bagno": _bathroom(measures=[])}):
        gated = await _quote()
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}):
        drafted = await _quote()

    for reply in (gated, drafted):
        assert not any(sign in reply for sign in ("€", "euro", "%"))


def _room_talk(context: str, label: str) -> str:
    """The room's own conversation block of an analysis context."""
    return context.split(f"## Conversazione della stanza {label}\n")[1].split("## Contesto generale")[0]


async def test_a_message_without_a_room_that_names_one_room_is_that_room_s_talk():
    """A correction typed with no room chip ("il bagno è 8 mq") is the room's
    fact, not background: the analysis must weigh it against the brief."""
    history = [
        {"id": "m1", "role": "user", "content": "Il bagno è 5 metri quadri"},
        *({**m, "id": f"m{i}"} for i, m in enumerate(HISTORY, start=2)),
        {"id": "m5", "role": "assistant", "content": "Ho registrato la richiesta."},
        {"id": "m6", "role": "user", "content": "Correggo: il bagno è 8 metri quadri"},
    ]
    with _project(history=history) as mocks:
        await _quote()

    calls = _calls_by_room(mocks["analyze"])
    bagno = _room_talk(calls["Bagno"][0], "Bagno")
    # In chat order: the old measure, the room's own message, then the correction.
    assert bagno.index("5 metri quadri") < bagno.index("Nel bagno voglio la doccia") < bagno.index("8 metri quadri")
    assert "8 metri quadri" not in _room_talk(calls["Cucina"][0], "Cucina")
    # A message naming several rooms stays project-wide background.
    assert "Ristrutturo casa" not in bagno and "Ristrutturo casa" in calls["Bagno"][0]


async def test_a_room_is_also_named_by_its_type_when_it_is_the_only_one():
    rooms = [*ROOMS[:2], _room("cucina1", "Cucina di Anna", "cucina")]
    history = [*HISTORY, {"role": "user", "content": "In cucina il pavimento è 12 mq"}]
    with _project(rooms=rooms, history=history) as mocks:
        await _quote()

    assert "12 mq" in _room_talk(_calls_by_room(mocks["analyze"])["Cucina"][0], "Cucina di Anna")


async def test_the_reply_says_which_value_was_used_and_where_the_new_one_waits():
    """The agent once told the client "recepisco 8 mq" while the lines used the
    confirmed 6: the tool states the value it used and the one waiting on the card."""
    stored = _stored(measures=[{"name": "mq", "value": 8, "source": "confirmed"}])
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}, specs={"bagno1": stored}):
        reply = await _quote()

    assert (
        "**Bagno** — pavimento della stanza: calcolato su 8 m², il valore confermato da te. "
        "Il nuovo valore 6 m² è nella scheda qui sotto: confermalo lì per usarlo."
    ) in reply
    assert "€" not in reply
    # First, under its own heading: flash-lite skipped it in the middle of the reply (eval room_correction).
    assert reply.startswith(f"{MEASURES_TO_REPORT}\n**Bagno** — pavimento della stanza: calcolato su 8 m²")


async def test_no_value_note_without_a_proposal():
    stored = _stored(measures=[{"name": "mq", "value": 6, "source": "confirmed"}])
    with _project(analyses={**ANALYSES, "Bagno": _bathroom()}, specs={"bagno1": stored}):
        reply = await _quote()

    assert "calcolato su" not in reply
