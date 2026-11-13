"""Phase 140 step 3: one pipeline from the expanded lines to the draft, shared by the
quote tool (after the model's analysis) and the confirmation card (no model)."""
import logging
from decimal import Decimal

import pytest
from src.core.money import to_cents
from src.schemas.intervention_spec import RoomInterventionSpec, StoredMeasure, StoredMeasureSource
from src.schemas.quote import ManualWorkItem, QuoteAiWarning, RevisionRoomSpec
from src.schemas.room import DEFAULT_ROOM_ID, DEFAULT_ROOM_LABEL, RoomSchema
from src.services.intervention_expansion import ExpandedLine, Expansion, ExpansionWarning, LineOrigin, ManualWork
from src.services.quote_build import UnitBuild, build_draft
from src.utils.datetime_utils import utc_now

# A guest's project id is an access token: never in the logs.
PID = "guest-session-token-123"
UID = "uid-1"


def _room(room_id: str, label: str, room_type: str) -> RoomSchema:
    now = utc_now()
    return RoomSchema(room_id=room_id, label=label, room_type=room_type, created_at=now, updated_at=now)


ROOMS = [_room(DEFAULT_ROOM_ID, DEFAULT_ROOM_LABEL, "altro"), _room("bagno1", "Bagno", "bagno"),
         _room("cucina1", "Cucina", "cucina")]


def _line(sku: str, qty: str, *measures: str, origin: LineOrigin = "package") -> ExpandedLine:
    return ExpandedLine(sku=sku, qty=Decimal(qty), reasoning=f"serve {sku}", origin=origin, measures=measures)


def _spec(source: StoredMeasureSource) -> RoomInterventionSpec:
    return RoomInterventionSpec(
        measures=[StoredMeasure(name="mq", value=6, source=source)], library_version="2.1.0", generated_at=utc_now()
    )


def _unit(section_id: str | None, label: str | None, *lines: ExpandedLine,
          spec: RoomInterventionSpec | None = None, **expansion: object) -> UnitBuild:
    return UnitBuild(section_id=section_id, label=label, expansion=Expansion(lines=list(lines), **expansion), spec=spec)


def test_rooms_become_sections_and_project_wide_lines_go_to_generale() -> None:
    built = build_draft(PID, UID, [
        _unit("bagno1", "Bagno", _line("BAG-RIV-001", "13.86", "mq"), _line("SMAL-001", "0.4", origin="extra")),
        _unit("cucina1", "Cucina", _line("CUC-TOP-002", "3", origin="extra"), _line("SMAL-001", "0.5", origin="extra")),
    ], ROOMS, to_quote=True)

    quote = built.quote
    assert (quote.project_id, quote.user_id) == (PID, UID)
    assert [r.room_id for r in quote.rooms] == ["bagno1", "cucina1", DEFAULT_ROOM_ID]
    assert {i.room_id: i.qty for i in quote.items if i.sku == "SMAL-001"} == {DEFAULT_ROOM_ID: 1.0}
    assert quote.financials.subtotal == sum(i.total for i in quote.items)


def test_a_quote_without_rooms_has_no_sections() -> None:
    built = build_draft(PID, UID, [_unit(None, None, _line("BAG-RIV-001", "13.86", "mq"))], ROOMS, to_quote=False)
    assert built.quote.rooms == []
    assert [i.room_id for i in built.quote.items] == [None]


def test_the_range_is_centred_on_the_grand_total() -> None:
    built = build_draft(
        PID, UID, [_unit(None, None, _line("BAG-RIV-001", "13.86", "mq"), spec=_spec("confirmed"))], ROOMS,
        to_quote=False,
    )
    total = built.quote.financials.grand_total
    estimate = built.quote.estimate
    assert estimate is not None
    # Within a cent: the amounts are rounded before the VAT scaling.
    assert abs(estimate.low - to_cents(total * Decimal("0.95"))) <= Decimal("0.01")
    assert abs(estimate.high - to_cents(total * Decimal("1.05"))) <= Decimal("0.01")
    assert estimate.precision == 95


def test_each_room_ranges_on_its_own_measures() -> None:
    """The same line in two rooms: confirmed in one (±5 %), estimated in the other (±25 %)."""
    built = build_draft(PID, UID, [
        _unit("bagno1", "Bagno", _line("BAG-RIV-001", "10", "mq"), spec=_spec("confirmed")),
        _unit("cucina1", "Cucina", _line("BAG-RIV-001", "10", "mq"), spec=_spec("estimated")),
    ], ROOMS, to_quote=True)
    assert built.quote.estimate is not None
    assert built.quote.estimate.precision == 85


def test_manual_work_widens_the_range_and_names_the_room() -> None:
    work = ManualWork(work="Vespaio aerato", origin="client_request")
    warning = ExpansionWarning("admin_check", "Da verificare", ("BAG-RIV-001",))
    narrow = build_draft(PID, UID, [_unit("bagno1", "Bagno", _line("BAG-RIV-001", "10", "mq"))], ROOMS, to_quote=True)
    built = build_draft(PID, UID, [
        _unit("bagno1", "Bagno", _line("BAG-RIV-001", "10", "mq"), manual_work=[work], warnings=[warning]),
    ], ROOMS, to_quote=True)

    assert built.manual_work == [ManualWorkItem(work="Vespaio aerato", room_id="bagno1", room_label="Bagno",
                                                origin="client_request")]
    assert built.ai_warnings == [QuoteAiWarning(kind="admin_check", message="Da verificare", room_id="bagno1",
                                                room_label="Bagno", skus=["BAG-RIV-001"])]
    assert narrow.quote.estimate is not None and built.quote.estimate is not None
    assert built.quote.estimate.high > narrow.quote.estimate.high
    assert built.quote.estimate.low == narrow.quote.estimate.low


def test_the_specs_are_the_units_that_have_one() -> None:
    spec = _spec("declared")
    built = build_draft(PID, UID, [
        _unit("bagno1", "Bagno", _line("BAG-RIV-001", "10", "mq"), spec=spec),
        _unit(DEFAULT_ROOM_ID, DEFAULT_ROOM_LABEL, _line("SC-002", "1", origin="extra")),
    ], ROOMS, to_quote=True)
    assert built.specs == [RevisionRoomSpec(room_id="bagno1", spec=spec)]


def test_a_draft_without_priced_lines_has_no_range() -> None:
    built = build_draft(PID, UID, [_unit(None, None, _line("NOT-IN-BOOK", "1", origin="extra"))], ROOMS, to_quote=False)
    assert built.quote.items == [] and built.quote.estimate is None


def test_a_suspicious_total_is_logged_without_the_project_id(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING)
    build_draft(PID, UID, [_unit(None, None, _line("BAG-RIV-001", "0.01", "mq"), _line("MUR-004", "0.01", "mq"))],
                ROOMS, to_quote=False)
    assert "Suspicious grand total" in caplog.text
    assert PID not in caplog.text
