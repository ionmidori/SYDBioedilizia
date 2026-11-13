"""The client's confirmation card (Phase 140, step 3): what it shows, and what a confirmation does.

A confirmed section is stored in its spec (`SpecStore.update`, transactional).
When no section misses a measure any more, the draft is recomputed by code from
the stored specs, read again after the write (the quote tool may have saved
another section meanwhile): no model call, the same pipeline as the quote tool
(`quote_build`), saved as an AI revision. Only a quote the client can still
change (none yet, or a draft): any other is the team's (409, nothing written).

Ownership is the route's job. Never logs the project id: for guests it is an
access token (section key and quote number instead).
"""
import asyncio
from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import get_args

from google.api_core.exceptions import NotFound

from src.core.exceptions import (
    ConfirmationInvalidError,
    ConfirmationSectionNotFoundError,
    QuoteNotEditableError,
    ServiceError,
)
from src.core.logger import get_logger
from src.db.firebase_client import get_async_firestore_client
from src.repositories.room_repository import get_room_repository
from src.repositories.spec_store import CHAT_SPEC_KEY, chat_on_card, get_spec_store
from src.schemas.assembly_library import MEASURE_LABELS, AssemblyElement, AssemblyLibrary, ElementAction
from src.schemas.confirmation import (
    ConfirmationResult,
    ConfirmationState,
    ConfirmationUpdate,
    ElementChoiceState,
    ElementOption,
    MeasureState,
    SectionState,
)
from src.schemas.intervention_spec import RoomInterventionSpec
from src.schemas.quote import QuoteRequest
from src.schemas.room import DEFAULT_ROOM_ID, DEFAULT_ROOM_LABEL, RoomSchema
from src.services.assembly_library import load_library
from src.services.intervention_expansion import ACTION_LABELS, Expansion, ExpansionWarning, expand
from src.services.pricing_service import PricingService
from src.services.quote_build import BuiltDraft, UnitBuild, build_draft, price_book_units
from src.services.quote_dossier import gather_dossier_inputs
from src.services.quote_drafts import DraftSaveOutcome, QuoteStatusView, read_quote_status, save_ai_draft
from src.services.quote_state import ai_draft_action
from src.services.spec_confirmation import analysis_from_spec, confirm, proposal_checks, spec_measures
from src.utils.datetime_utils import utc_now

logger = get_logger(__name__)

# What happens to an element nobody chose for: the package replaces it.
_DEFAULT_ACTION: ElementAction = "replace"
# The AI draft actions the card may take: create the first draft, or update it.
_EDITABLE_ACTIONS = frozenset({"create", "update"})


@dataclass(frozen=True)
class _Section:
    key: str
    label: str | None  # None: the whole chat of a project without rooms
    spec: RoomInterventionSpec


async def _sections(project_id: str) -> tuple[list[_Section], list[RoomSchema]]:
    """The quote units with a spec, in the project's room order ("Generale" last),
    and the rooms. The whole chat is a unit only while no room has a spec."""
    specs, rooms = await asyncio.gather(
        get_spec_store().load_all(project_id), get_room_repository().list_rooms(project_id)
    )
    if chat_on_card(specs):
        chat = specs.get(CHAT_SPEC_KEY)
        return ([_Section(CHAT_SPEC_KEY, None, chat)] if chat is not None else []), rooms
    sections = [
        _Section(room.room_id, room.label, specs[room.room_id])
        for room in rooms
        if room.room_id != DEFAULT_ROOM_ID and room.room_id in specs
    ]
    if DEFAULT_ROOM_ID in specs:
        sections.append(_Section(DEFAULT_ROOM_ID, DEFAULT_ROOM_LABEL, specs[DEFAULT_ROOM_ID]))
    return sections, rooms


def _library() -> AssemblyLibrary:
    library = load_library()
    if library is None:  # it ships with the code: a deploy error, logged by the loader
        raise ServiceError(message="The assembly library is not available.")
    return library


def _editable(status: QuoteStatusView | None) -> bool:
    if status is None:
        return True
    return ai_draft_action(status.status, status.delivery_status) in _EDITABLE_ACTIONS


def _expansion(spec: RoomInterventionSpec, library: AssemblyLibrary, units: dict[str, str]) -> Expansion:
    """The section's lines, computed by code from its stored spec, with the team's
    checks on the proposals still open."""
    expansion = expand(analysis_from_spec(spec, ""), library, units, spec_measures(spec))
    checks = [ExpansionWarning("admin_check", note) for note in proposal_checks(spec)]
    return replace(expansion, warnings=[*expansion.warnings, *checks])


def _computed(
    sections: Sequence[_Section], library: AssemblyLibrary, units: dict[str, str]
) -> list[tuple[_Section, Expansion]]:
    return [(s, _expansion(s.spec, library, units)) for s in sections]


def _elements(spec: RoomInterventionSpec, library: AssemblyLibrary) -> dict[str, AssemblyElement]:
    """The elements of the section's packages the client can choose for, in library order."""
    by_id = {assembly.id: assembly for assembly in library.assemblies}
    elements: dict[str, AssemblyElement] = {}
    for package in spec.packages:
        assembly = by_id.get(package.assembly_id)
        for element in assembly.elements if assembly is not None else []:
            elements.setdefault(element.element, element)
    return elements


def _options(element: AssemblyElement) -> list[ElementAction]:
    """Reuse needs the rebuild work of the element (`reuse_work`)."""
    return [action for action in get_args(ElementAction) if action != "reuse" or element.reuse_work]


def _check_choices(section: _Section, update: ConfirmationUpdate, library: AssemblyLibrary) -> None:
    elements = _elements(section.spec, library)
    for choice in update.element_choices:
        element = elements.get(choice.element)
        if element is None or choice.action not in _options(element):
            raise ConfirmationInvalidError(section.key)


def _measure_states(spec: RoomInterventionSpec, missing: Sequence[str]) -> list[MeasureState]:
    """The stored measures, then the ones the lines need and nobody gave (`missing`,
    from the code: the stored list may be older than the last choices)."""
    given = {m.name for m in spec.measures}
    return [
        MeasureState(
            name=m.name, label=MEASURE_LABELS.get(m.name, m.name), value=m.value, source=m.source,
            proposed=m.proposed, candidates=list(spec.conflicts.get(m.name, [])),
        )
        for m in spec.measures
    ] + [
        MeasureState(
            name=name, label=MEASURE_LABELS.get(name, name), value=None, source=None,
            candidates=list(spec.conflicts.get(name, [])),
        )
        for name in missing
        if name not in given
    ]


def _choice_states(spec: RoomInterventionSpec, library: AssemblyLibrary) -> list[ElementChoiceState]:
    chosen = {c.element: c for c in spec.element_choices}
    return [
        ElementChoiceState(
            element=element.element,
            label=element.label,
            action=chosen[element.element].action if element.element in chosen else _DEFAULT_ACTION,
            confirmed=element.element in chosen and chosen[element.element].confirmed,
            options=[ElementOption(action=action, label=ACTION_LABELS[action]) for action in _options(element)],
        )
        for element in _elements(spec, library).values()
    ]


def _section_state(section: _Section, expansion: Expansion, library: AssemblyLibrary) -> SectionState:
    measures = _measure_states(section.spec, expansion.missing_measures)
    choices = _choice_states(section.spec, library)
    pending = any(m.source != "confirmed" or m.proposed is not None for m in measures) or any(
        not c.confirmed for c in choices
    )
    return SectionState(
        section_key=section.key, label=section.label, pending=pending, measures=measures, element_choices=choices
    )


def _state(
    computed: Sequence[tuple[_Section, Expansion]], library: AssemblyLibrary, *, editable: bool, precision: int | None
) -> ConfirmationState:
    return ConfirmationState(
        sections=[_section_state(s, expansion, library) for s, expansion in computed],
        editable=editable,
        precision=precision,
    )


async def confirmation_state(project_id: str) -> ConfirmationState:
    """What the card shows: every section, whether the client can still change the quote, its precision."""
    (sections, _), status = await asyncio.gather(
        _sections(project_id), read_quote_status(get_async_firestore_client(), project_id)
    )
    library = _library()
    return _state(
        _computed(sections, library, price_book_units()), library,
        editable=_editable(status), precision=status.precision if status else None,
    )


def _request(built: BuiltDraft, status: QuoteStatusView | None, project_id: str) -> QuoteRequest:
    """An update keeps the summary, channel and session of the draft (dotted paths);
    a first draft is the chat's (the chat session id is the project id)."""
    if status is None:
        return QuoteRequest(
            channel="chat", session_id=project_id, manual_work=built.manual_work, ai_warnings=built.ai_warnings
        )
    return QuoteRequest(manual_work=built.manual_work, ai_warnings=built.ai_warnings)


async def _recalculate(
    project_id: str,
    user_id: str,
    computed: Sequence[tuple[_Section, Expansion]],
    rooms: Sequence[RoomSchema],
    status: QuoteStatusView | None,
) -> int | None:
    """Save the draft computed from the sections; its precision. 409 when the team
    took the quote since the status was read (the spec stays confirmed)."""
    units = [
        UnitBuild(
            section_id=None if section.key == CHAT_SPEC_KEY else section.key,
            label=section.label, expansion=expansion, spec=section.spec,
        )
        for section, expansion in computed
    ]
    built = build_draft(project_id, user_id, units, rooms, to_quote=units[0].section_id is not None)
    db = get_async_firestore_client()
    now = utc_now()
    dossier = await gather_dossier_inputs(db, project_id, user_id, now)
    saved = await save_ai_draft(
        db, project_id, built.quote, _request(built, status, project_id),
        now=now, dossier=dossier, specs=built.specs, editable_only=True,
    )
    if saved.outcome is DraftSaveOutcome.NOT_EDITABLE:
        raise QuoteNotEditableError()
    logger.info(
        "[Confirmation] Draft recomputed without the model.",
        extra={"quote_number": saved.quote_number, "outcome": saved.outcome.value},
    )
    return built.quote.estimate.precision if built.quote.estimate is not None else None


async def confirm_section(
    project_id: str, user_id: str, section_key: str, update: ConfirmationUpdate
) -> ConfirmationResult:
    """Store what the client confirmed for one section; recompute the draft when
    no section misses a measure any more (`blocked_sections` otherwise)."""
    (sections, _), status = await asyncio.gather(
        _sections(project_id), read_quote_status(get_async_firestore_client(), project_id)
    )
    target = next((s for s in sections if s.key == section_key), None)
    if target is None:
        raise ConfirmationSectionNotFoundError(section_key)
    library = _library()
    _check_choices(target, update, library)
    if not _editable(status):
        raise QuoteNotEditableError()
    await PricingService.ensure_fresh()  # prices edited in the admin console
    units = price_book_units()

    def change(current: RoomInterventionSpec | None) -> RoomInterventionSpec:
        if current is None:  # "Generale" or the chat lost its spec meanwhile
            raise ConfirmationSectionNotFoundError(section_key)
        confirmed = confirm(current, update)
        # A choice may bring lines whose measure nobody gave: the card asks for it.
        return confirmed.model_copy(update={"missing_measures": _expansion(confirmed, library, units).missing_measures})

    try:
        written = await get_spec_store().update(project_id, section_key, change)
    except NotFound as exc:  # the room was deleted meanwhile
        raise ConfirmationSectionNotFoundError(section_key) from exc
    if written is None:  # the stored spec stopped reading (a newer format): never overwritten
        raise ConfirmationSectionNotFoundError(section_key)
    # Read again: the quote tool may have saved another section since the first read.
    sections, rooms = await _sections(project_id)
    computed = _computed(sections, library, units)
    blocked = [s.key for s, expansion in computed if expansion.missing_measures]
    precision = status.precision if status is not None else None
    recalculated = not blocked and any(expansion.lines for _, expansion in computed)
    if recalculated:
        precision = await _recalculate(project_id, user_id, computed, rooms, status)
    logger.info(
        "[Confirmation] Section confirmed.",
        extra={"section_key": section_key, "recalculated": recalculated, "blocked": len(blocked)},
    )
    return ConfirmationResult(
        recalculated=recalculated,
        blocked_sections=blocked,
        state=_state(computed, library, editable=True, precision=precision),
    )
