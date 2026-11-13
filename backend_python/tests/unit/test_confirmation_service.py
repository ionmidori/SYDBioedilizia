"""Phase 140 step 3: the client confirms a section on the card and the code
recalculates the draft, without the model."""
import logging
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.api_core.exceptions import NotFound
from src.core.exceptions import AppException
from src.repositories.spec_store import CHAT_SPEC_KEY
from src.schemas.assembly_library import MEASURE_LABELS, ElementAction
from src.schemas.confirmation import ConfirmationUpdate, ElementChoiceState, ElementOption, MeasureState
from src.schemas.intervention_spec import RoomInterventionSpec, StoredElementChoice, StoredMeasure, StoredPackage
from src.schemas.quote import RevisionRoomSpec
from src.schemas.room import DEFAULT_ROOM_ID, DEFAULT_ROOM_LABEL, RoomSchema
from src.services import confirmation_service
from src.services.confirmation_service import confirm_section, confirmation_state
from src.services.intervention_expansion import ACTION_LABELS
from src.services.pricing_service import PricingService
from src.services.quote_drafts import DraftSaveOutcome, DraftSaveResult, QuoteStatusView
from src.utils.datetime_utils import utc_now

# A guest's project id is an access token: never in the logs.
PID = "session-token-abc"
UID = "uid-1"


def _room(room_id: str, label: str, room_type: str) -> RoomSchema:
    now = utc_now()
    return RoomSchema(room_id=room_id, label=label, room_type=room_type, created_at=now, updated_at=now)


ROOMS = [_room(DEFAULT_ROOM_ID, DEFAULT_ROOM_LABEL, "altro"), _room("bagno1", "Bagno", "bagno"),
         _room("cucina1", "Cucina", "cucina")]


def _spec(*measures: StoredMeasure, package: str = "ASM-BAGNO-FULL", choices: tuple[StoredElementChoice, ...] = (),
          missing: tuple[str, ...] = (), conflicts: dict[str, list[float]] | None = None) -> RoomInterventionSpec:
    return RoomInterventionSpec(
        measures=list(measures), packages=[StoredPackage(assembly_id=package)], element_choices=list(choices),
        missing_measures=list(missing), conflicts=conflicts or {}, library_version="2.1.0", generated_at=utc_now(),
    )


BAGNO = _spec(StoredMeasure(name="mq", value=6, source="declared"))
PENSILI = StoredMeasure(name="ml_pensili", value=4, source="declared")
CUCINA_MISSING = _spec(PENSILI, package="ASM-CUCINA-FULL", missing=("mq",), conflicts={"mq": [10.0, 14.0]})


def _draft(status: str = "draft", precision: int | None = None) -> QuoteStatusView:
    return QuoteStatusView(status=status, delivery_status=None, quote_number="PRV-2026-0042", version=1,
                           sent_before=False, precision=precision)


@contextmanager
def _project(specs: dict[str, RoomInterventionSpec], status: QuoteStatusView | None = None,
             outcome: DraftSaveOutcome = DraftSaveOutcome.UPDATED) -> Iterator[dict[str, Any]]:
    stored = dict(specs)
    store = MagicMock()
    store.load_all = AsyncMock(side_effect=lambda pid: dict(stored))

    async def update(project_id, section_key, change):
        assert project_id == PID
        stored[section_key] = change(stored.get(section_key))
        return stored[section_key]

    store.update = AsyncMock(side_effect=update)
    repo = MagicMock()
    repo.list_rooms = AsyncMock(return_value=ROOMS)
    saved = AsyncMock(return_value=DraftSaveResult(outcome, "draft", "PRV-2026-0042", 2))
    model = AssertionError("the model must not be called by a confirmation")
    with patch.object(confirmation_service, "get_spec_store", return_value=store), \
         patch.object(confirmation_service, "get_room_repository", return_value=repo), \
         patch.object(confirmation_service, "read_quote_status", AsyncMock(return_value=status)), \
         patch.object(confirmation_service, "save_ai_draft", saved), \
         patch.object(confirmation_service, "gather_dossier_inputs", AsyncMock(return_value=None)), \
         patch.object(confirmation_service, "get_async_firestore_client"), \
         patch.object(PricingService, "ensure_fresh", AsyncMock()), \
         patch("src.services.insight_engine.get_insight_engine", side_effect=model), \
         patch("src.core.models.get_genai_client", side_effect=model):
        yield {"store": store, "stored": stored, "saved": saved}


def _measure(name: str, value: float) -> ConfirmationUpdate:
    return ConfirmationUpdate.model_validate({"measures": [{"name": name, "value": value}]})


def _saved_quote(saved: AsyncMock) -> Any:
    return saved.await_args.args[2]


async def test_confirm_recalculates_without_model(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    with _project({"bagno1": BAGNO}, _draft()) as mocks:
        result = await confirm_section(PID, UID, "bagno1", _measure("mq", 8))

    assert result.recalculated and result.blocked_sections == []
    assert mocks["stored"]["bagno1"].measures == [StoredMeasure(name="mq", value=8, source="confirmed")]
    quote = _saved_quote(mocks["saved"])
    bagno = {i.sku: i.qty for i in quote.items if i.room_id == "bagno1"}
    assert bagno["BAG-RIV-001"] == 18.48 and bagno["MUR-004"] == 17.6  # 8 * 2.2 * 1.05, 8 * 2.2
    assert mocks["saved"].await_args.kwargs["editable_only"] is True
    assert any(getattr(r, "quote_number", None) == "PRV-2026-0042" for r in caplog.records)
    assert all(PID not in str(r.__dict__) for r in caplog.records)


async def test_confirm_with_other_section_missing_saves_only() -> None:
    with _project({"bagno1": BAGNO, "cucina1": CUCINA_MISSING}, _draft()) as mocks:
        first = await confirm_section(PID, UID, "bagno1", _measure("mq", 8))
        assert not first.recalculated and first.blocked_sections == ["cucina1"]
        assert mocks["stored"]["bagno1"].measures[0].source == "confirmed"
        mocks["saved"].assert_not_awaited()

        second = await confirm_section(PID, UID, "cucina1", _measure("mq", 12))

    assert second.recalculated and second.blocked_sections == []
    cucina = mocks["stored"]["cucina1"]
    assert cucina.missing_measures == [] and cucina.conflicts == {}
    assert {i.room_id for i in _saved_quote(mocks["saved"]).items} >= {"bagno1", "cucina1"}


@pytest.mark.parametrize("status", ["pending_review", "in_review", "sent", "approved"])
async def test_confirm_not_editable_409_nothing_written(status: str) -> None:
    with _project({"bagno1": BAGNO}, _draft(status)) as mocks, pytest.raises(AppException) as error:
        await confirm_section(PID, UID, "bagno1", _measure("mq", 8))

    assert (error.value.status_code, error.value.error_code) == (409, "QUOTE_NOT_EDITABLE")
    mocks["store"].update.assert_not_awaited()
    mocks["saved"].assert_not_awaited()


async def test_a_quote_taken_by_the_team_meanwhile_is_409() -> None:
    with _project({"bagno1": BAGNO}, _draft(), outcome=DraftSaveOutcome.NOT_EDITABLE), \
         pytest.raises(AppException) as error:
        await confirm_section(PID, UID, "bagno1", _measure("mq", 8))
    assert error.value.error_code == "QUOTE_NOT_EDITABLE"


async def test_confirm_before_first_draft_creates_draft() -> None:
    chat = _spec(missing=("mq",))
    with _project({CHAT_SPEC_KEY: chat}, None, outcome=DraftSaveOutcome.CREATED) as mocks:
        result = await confirm_section(PID, UID, CHAT_SPEC_KEY, _measure("mq", 6))

    assert result.recalculated
    quote, request = mocks["saved"].await_args.args[2:4]
    assert quote.rooms == [] and {i.room_id for i in quote.items} == {None}
    assert (request.channel, request.session_id) == ("chat", PID)


async def test_recalculated_revision_is_ai_and_has_specs_and_estimate() -> None:
    with _project({"bagno1": BAGNO}, _draft()) as mocks:
        result = await confirm_section(PID, UID, "bagno1", _measure("mq", 8))

    kwargs = mocks["saved"].await_args.kwargs
    assert kwargs["specs"] == [RevisionRoomSpec(room_id="bagno1", spec=mocks["stored"]["bagno1"])]
    estimate = _saved_quote(mocks["saved"]).estimate
    assert estimate is not None and estimate.precision is not None
    assert result.state.precision == estimate.precision
    # Recomputed without the model: the save is the AI draft's, the revision stays "ai".
    assert mocks["saved"].await_args.args[1] == PID


@pytest.mark.parametrize("section_key", ["soggiorno1", CHAT_SPEC_KEY])
async def test_unknown_section_404(section_key: str) -> None:
    """A chat spec once the project has rooms is no section any more."""
    with _project({"bagno1": BAGNO, CHAT_SPEC_KEY: BAGNO}, _draft()), pytest.raises(AppException) as error:
        await confirm_section(PID, UID, section_key, _measure("mq", 8))
    assert (error.value.status_code, error.value.error_code) == (404, "CONFIRMATION_SECTION_NOT_FOUND")


@pytest.mark.parametrize("choice", [
    pytest.param({"element": "lavatrice", "action": "keep"}, id="not-an-element-of-the-section"),
    pytest.param({"element": "pavimento", "action": "reuse"}, id="reuse-without-reuse-work"),
])
async def test_a_choice_the_library_does_not_offer_is_422(choice: dict[str, str]) -> None:
    update = ConfirmationUpdate.model_validate({"element_choices": [choice]})
    with _project({"bagno1": BAGNO}, _draft()) as mocks, pytest.raises(AppException) as error:
        await confirm_section(PID, UID, "bagno1", update)
    assert (error.value.status_code, error.value.error_code) == (422, "CONFIRMATION_INVALID")
    mocks["store"].update.assert_not_awaited()


async def test_state_lists_pending_and_conflict_candidates() -> None:
    bagno = _spec(StoredMeasure(name="mq", value=8, source="confirmed", proposed=6),
                  choices=(StoredElementChoice(element="sanitari", action="keep", confirmed=True),))
    with _project({"bagno1": bagno, "cucina1": CUCINA_MISSING, CHAT_SPEC_KEY: BAGNO}, _draft(precision=80)):
        state = await confirmation_state(PID)

    assert (state.editable, state.precision) == (True, 80)
    assert [s.section_key for s in state.sections] == ["bagno1", "cucina1"]
    bagno_state, cucina_state = state.sections
    assert bagno_state.label == "Bagno" and bagno_state.pending  # a proposal to answer, elements to confirm
    assert bagno_state.measures == [MeasureState(name="mq", label=MEASURE_LABELS["mq"], value=8, source="confirmed",
                                                 proposed=6)]
    assert bagno_state.element_choices[0] == ElementChoiceState(
        element="sanitari", label="Sanitari", action="keep", confirmed=True, options=_options("replace", "reuse", "keep")
    )
    assert cucina_state.measures == [
        MeasureState(name="ml_pensili", label=MEASURE_LABELS["ml_pensili"], value=4, source="declared"),
        MeasureState(name="mq", label=MEASURE_LABELS["mq"], value=None, source=None, candidates=[10.0, 14.0]),
    ]
    assert cucina_state.element_choices == [ElementChoiceState(
        element="pavimento", label="Pavimento", action="replace", confirmed=False, options=_options("replace", "keep")
    )]


def _options(*actions: ElementAction) -> list[ElementOption]:
    """The client reads the actions with the words the team reads in its checks."""
    return [ElementOption(action=action, label=ACTION_LABELS[action]) for action in actions]


async def test_a_fully_confirmed_section_is_not_pending() -> None:
    update = ConfirmationUpdate.model_validate({
        "measures": [{"name": "mq", "value": 12}, {"name": "ml_pensili", "value": 4}],
        "element_choices": [{"element": "pavimento", "action": "keep"}],
    })
    with _project({"cucina1": CUCINA_MISSING}, _draft()):
        result = await confirm_section(PID, UID, "cucina1", update)
    assert [s.pending for s in result.state.sections] == [False]


async def test_state_of_a_quote_with_the_team_is_read_only() -> None:
    with _project({"bagno1": BAGNO}, _draft("pending_review")):
        assert not (await confirmation_state(PID)).editable
    with _project({}, None):
        state = await confirmation_state(PID)
    assert (state.sections, state.editable, state.precision) == ([], True, None)


async def test_generale_is_the_last_section() -> None:
    with _project({DEFAULT_ROOM_ID: BAGNO, "cucina1": CUCINA_MISSING}, _draft()):
        state = await confirmation_state(PID)
    assert [(s.section_key, s.label) for s in state.sections] == [("cucina1", "Cucina"),
                                                                    (DEFAULT_ROOM_ID, DEFAULT_ROOM_LABEL)]


# ── Review fixes: what the other writer (the quote tool) did meanwhile ───────


async def test_other_sections_are_read_again_after_the_write() -> None:
    """The tool saved the kitchen with its measure while the card confirmed the bathroom."""
    kitchen_done = _spec(PENSILI, StoredMeasure(name="mq", value=12, source="declared"), package="ASM-CUCINA-FULL")
    with _project({"bagno1": BAGNO, "cucina1": CUCINA_MISSING}, _draft()) as mocks:
        write = mocks["store"].update.side_effect

        async def tool_wrote_meanwhile(project_id, section_key, change):
            mocks["stored"]["cucina1"] = kitchen_done
            return await write(project_id, section_key, change)

        mocks["store"].update.side_effect = tool_wrote_meanwhile
        result = await confirm_section(PID, UID, "bagno1", _measure("mq", 8))

    assert result.recalculated and result.blocked_sections == []
    assert RevisionRoomSpec(room_id="cucina1", spec=kitchen_done) in mocks["saved"].await_args.kwargs["specs"]


async def test_the_team_keeps_its_checks_on_the_open_proposals() -> None:
    kitchen = _spec(PENSILI, StoredMeasure(name="mq", value=12, source="confirmed", proposed=10),
                    package="ASM-CUCINA-FULL")
    with _project({"bagno1": BAGNO, "cucina1": kitchen}, _draft()) as mocks:
        await confirm_section(PID, UID, "bagno1", _measure("mq", 8))

    request = mocks["saved"].await_args.args[3]
    checks = [w for w in request.ai_warnings if w.kind == "admin_check" and "confermato 12" in w.message]
    assert len(checks) == 1 and checks[0].room_id == "cucina1"


async def test_a_room_deleted_meanwhile_is_404() -> None:
    with _project({"bagno1": BAGNO}, _draft()) as mocks, pytest.raises(AppException) as error:
        mocks["store"].update.side_effect = NotFound("room bagno1")
        await confirm_section(PID, UID, "bagno1", _measure("mq", 8))
    assert error.value.error_code == "CONFIRMATION_SECTION_NOT_FOUND"


async def test_the_state_asks_for_every_measure_the_lines_need() -> None:
    """The stored list may be stale (a choice made during an analysis): the card reads the code's."""
    kitchen = _spec(PENSILI, package="ASM-CUCINA-FULL")  # no mq, and no missing measure stored
    with _project({"cucina1": kitchen}, _draft()):
        state = await confirmation_state(PID)
    assert [(m.name, m.value) for m in state.sections[0].measures] == [("ml_pensili", 4), ("mq", None)]


async def test_an_update_keeps_the_draft_request() -> None:
    """Summary, channel and session of the draft stay (dotted paths): the request carries none."""
    with _project({"bagno1": BAGNO}, _draft()) as mocks:
        await confirm_section(PID, UID, "bagno1", _measure("mq", 8))
    request = mocks["saved"].await_args.args[3]
    assert (request.summary, request.channel, request.session_id) == (None, None, None)
