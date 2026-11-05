"""Deterministic expansion of an intervention spec (Phase 140, step 1).

The model chooses packages, conditions and measures; the code computes every
line from the library formulas. Real bundled library and seed price book.
"""
from decimal import Decimal

import pytest
from pydantic import ValidationError
from src.schemas.assembly_library import FORMULA_VARIABLES, AssemblyLibrary, ElementAction
from src.schemas.room import RoomBrief
from src.services import assembly_library, price_book
from src.services.insight_engine import ElementChoice, InsightAnalysis, PackageChoice, SKUItemSuggestion, SpecMeasure
from src.services.intervention_expansion import (
    MEASURE_QUESTIONS,
    Expansion,
    ManualWork,
    MissingMeasure,
    evaluate_formula,
    expand,
    resolve_measures,
)


@pytest.fixture(scope="module")
def library() -> AssemblyLibrary:
    assembly_library.reset_library_cache()
    loaded = assembly_library.load_library()
    assert loaded is not None
    return loaded


@pytest.fixture(scope="module")
def units() -> dict[str, str]:
    return {str(i["sku"]): str(i["unit"]) for i in price_book.seed_items()}


def _analysis(
    *packages: tuple[str, list[str]],
    measures: list[SpecMeasure] | None = None,
    elements: dict[str, ElementAction] | None = None,
    extras: list[tuple[str, float]] | None = None,
    unmapped: list[str] | None = None,
) -> InsightAnalysis:
    return InsightAnalysis(
        summary="s",
        packages=[PackageChoice(assembly_id=a, conditions=c) for a, c in packages],
        measures=measures or [],
        element_choices=[ElementChoice(element=e, action=a) for e, a in (elements or {}).items()],
        suggestions=[SKUItemSuggestion(sku=s, qty=q, ai_reasoning=f"extra {s}") for s, q in (extras or [])],
        unmapped_work_requests=unmapped or [],
    )


def _kinds(expansion: Expansion) -> list[str]:
    return [w.kind for w in expansion.warnings]


def _manual(expansion: Expansion) -> list[tuple[str, str]]:
    return [(m.work, m.origin) for m in expansion.manual_work]


_BATH = ("ASM-BAGNO-FULL", [])
_REUSE_SANITARI = "Smontaggio con cura e rimontaggio dei sanitari esistenti"


def _qty(expansion: Expansion) -> dict[str, Decimal]:
    return {line.sku: line.qty for line in expansion.lines}


def _run(library: AssemblyLibrary, units: dict[str, str], analysis: InsightAnalysis, **measures: str) -> Expansion:
    return expand(analysis, library, units, {k: Decimal(v) for k, v in measures.items()})


def test_evaluate_formula_in_decimal() -> None:
    assert evaluate_formula("mq * 2.2 * 1.05", {"mq": Decimal("6")}) == Decimal("13.860")
    assert evaluate_formula("n_porte * 2 - 1", {"n_porte": Decimal(3)}) == Decimal(5)


def test_evaluate_formula_missing_measure() -> None:
    with pytest.raises(MissingMeasure) as exc:
        evaluate_formula("mq * 2", {})
    assert exc.value.variable == "mq"


def test_full_bathroom_expands_every_line(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(("ASM-BAGNO-FULL", [])), mq="6")
    assert _qty(result) == {
        "DEM-006": Decimal("1"), "DEM-003": Decimal("13.2"), "DEM-002": Decimal("6"),
        "IMP-ID-001": Decimal("4"), "IMP-EL-001": Decimal("3"), "MUR-004": Decimal("13.2"),
        "PAV-004": Decimal("6"), "PAV-001": Decimal("6.3"), "BAG-RIV-001": Decimal("13.86"),
        "BAG-SAN-001": Decimal("1"), "BAG-BOX-001": Decimal("1"), "SMAL-001": Decimal("0.69"),
    }
    assert result.manual_work == [ManualWork("Rubinetteria (fornitura)", "package")]
    assert result.missing_measures == []
    assert all(line.origin == "package" and line.assembly_id == "ASM-BAGNO-FULL" for line in result.lines)
    riv = next(line for line in result.lines if line.sku == "BAG-RIV-001")
    assert "mq * 2.2 * 1.05" in riv.reasoning and "mq=6" in riv.reasoning


def test_quantities_have_two_decimals(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(("ASM-BAGNO-FULL", [])), mq="5.333")
    assert all(-line.qty.as_tuple().exponent <= 2 for line in result.lines)


def test_conditional_line_only_when_chosen(library: AssemblyLibrary, units: dict[str, str]) -> None:
    without = _run(library, units, _analysis(("ASM-CUCINA-FULL", [])), mq="10", ml_pensili="4")
    assert "CUC-GAS-001" not in _qty(without)
    with_gas = _run(library, units, _analysis(("ASM-CUCINA-FULL", ["if_cottura_gas"])), mq="10", ml_pensili="4")
    assert _qty(with_gas)["CUC-GAS-001"] == Decimal("1")


def test_conditional_phase(library: AssemblyLibrary, units: dict[str, str]) -> None:
    plain = _run(library, units, _analysis(("ASM-PARETI-BIANCHE", [])), mq_pareti="30")
    assert "DEM-003" not in _qty(plain)
    tiles = _run(library, units, _analysis(("ASM-PARETI-BIANCHE", ["if_piastrelle"])), mq_pareti="30")
    assert _qty(tiles)["DEM-003"] == Decimal("30")


def test_default_alternative_is_used_and_flagged(library: AssemblyLibrary, units: dict[str, str]) -> None:
    unset = _run(library, units, _analysis(("ASM-INFISSI", [])), n_finestre="3")
    assert _qty(unset)["INF-FIN-001"] == Decimal("3")
    assert "INF-FIN-002" not in _qty(unset)
    assert [w.kind for w in unset.warnings] == ["choice_defaulted"]
    chosen = _run(library, units, _analysis(("ASM-INFISSI", ["if_alluminio"])), n_finestre="3")
    assert _qty(chosen)["INF-FIN-002"] == Decimal("3")
    assert "INF-FIN-001" not in _qty(chosen)
    assert chosen.warnings == []


def test_unknown_condition_is_ignored_and_flagged(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(("ASM-SOFFITTO", ["if_pvc"])), mq="12")
    assert "CS-001" not in _qty(result)
    assert [w.kind for w in result.warnings] == ["unknown_condition"]


def test_missing_measure_skips_the_line_and_asks(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(("ASM-BAGNO-FULL", [])))
    assert set(_qty(result)) == {"DEM-006", "IMP-ID-001", "IMP-EL-001", "BAG-SAN-001", "BAG-BOX-001"}
    assert result.missing_measures == ["mq"]
    assert result.questions == [MEASURE_QUESTIONS["mq"]]


def test_every_formula_variable_has_a_question() -> None:
    assert set(MEASURE_QUESTIONS) == FORMULA_VARIABLES


def test_resolve_measures_prefers_spec_then_brief() -> None:
    analysis = InsightAnalysis(summary="s", measures=[
        SpecMeasure(name="mq", value=6, source="declared"),
        SpecMeasure(name="n_porte", value=0, source="estimated"),
    ])
    brief = RoomBrief(floor_mq=9, walls_mq=25)
    measures = resolve_measures(analysis, brief)
    assert measures == {"mq": Decimal("6"), "mq_pareti": Decimal("25")}
    assert resolve_measures(analysis, None) == {"mq": Decimal("6")}


def test_unknown_measure_name_is_ignored() -> None:
    analysis = InsightAnalysis.model_validate({
        "summary": "s",
        "measures": [{"name": "mq_bagno", "value": 6, "source": "declared"},
                     {"name": "mq", "value": 6, "source": "declared"}],
    })
    assert [m.name for m in analysis.measures] == ["mq"]


def test_quantity_over_bound_is_dropped(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(("ASM-BAGNO-FULL", [])), mq="9000")
    assert "BAG-RIV-001" not in _qty(result)
    assert any(w.kind == "qty_out_of_bounds" and w.skus == ("BAG-RIV-001",) for w in result.warnings)


def _one_line_library(formula: str) -> AssemblyLibrary:
    return AssemblyLibrary.model_validate({
        "version": "t", "description": "t", "dependency_rules": [],
        "assemblies": [{
            "id": "ASM-T", "name": "Prova", "description": "t", "triggers": ["t"], "questions_required": [],
            "phases": [{"phase": "Lavori", "skus": [{"sku": "PIT-001", "unit": "mq", "qty_formula": formula, "note": "n"}]}],
        }],
    })


def test_unknown_package_is_skipped_and_flagged(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(("ASM-INVENTATO", [])), mq="6")
    assert result.lines == []
    assert [w.kind for w in result.warnings] == ["unknown_package"]


def test_package_chosen_twice_is_expanded_once_with_both_conditions(
    library: AssemblyLibrary, units: dict[str, str]
) -> None:
    analysis = _analysis(("ASM-CUCINA-FULL", []), ("ASM-CUCINA-FULL", ["if_cottura_gas"]))
    result = _run(library, units, analysis, mq="10", ml_pensili="4")
    skus = [line.sku for line in result.lines]
    assert len(skus) == len(set(skus))
    assert "CUC-GAS-001" in skus


def test_quantity_rounding_below_a_cent_is_skipped(units: dict[str, str]) -> None:
    result = _run(_one_line_library("mq * 0.001"), units, _analysis(("ASM-T", [])), mq="4")
    assert result.lines == [] and result.warnings == []
    negative = _run(_one_line_library("1 - mq"), units, _analysis(("ASM-T", [])), mq="4")
    assert negative.lines == []


def test_first_spec_measure_wins() -> None:
    analysis = InsightAnalysis(summary="s", measures=[
        SpecMeasure(name="mq", value=6, source="declared"), SpecMeasure(name="mq", value=9, source="estimated"),
    ])
    assert resolve_measures(analysis, None) == {"mq": Decimal("6")}


def test_absurd_measure_is_rejected_by_the_spec() -> None:
    with pytest.raises(ValidationError):
        SpecMeasure(name="mq", value=1e60, source="estimated")
    with pytest.raises(ValidationError):
        SpecMeasure(name="mq", value=float("inf"), source="estimated")


def test_huge_formula_result_is_out_of_bounds_not_a_crash(units: dict[str, str]) -> None:
    result = _run(_one_line_library("mq * 100000000000000000000000000000000000000000000000000000000000"),
                  units, _analysis(("ASM-T", [])), mq="10000")
    assert result.lines == []
    assert [w.kind for w in result.warnings] == ["qty_out_of_bounds"]


def test_formula_arithmetic_error_is_flagged_not_raised(units: dict[str, str]) -> None:
    result = _run(_one_line_library("mq / (mq_pareti - mq_pareti)"), units, _analysis(("ASM-T", [])),
                  mq="4", mq_pareti="10")
    assert result.lines == []
    assert [w.kind for w in result.warnings] == ["admin_check"]


def test_default_warning_only_when_the_default_line_is_there(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(("ASM-INFISSI", [])))
    assert "INF-FIN-001" not in _qty(result)
    assert "choice_defaulted" not in [w.kind for w in result.warnings]
    assert result.missing_measures == ["n_finestre"]


# ── Elements, extras, dependency rules, live price book (Task 3) ─────────────


def test_reuse_sanitari_keeps_removal_and_drops_supply(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(_BATH, elements={"sanitari": "reuse"}), mq="6")
    assert "DEM-006" in _qty(result)
    assert "BAG-SAN-001" not in _qty(result)
    assert (_REUSE_SANITARI, "reuse") in _manual(result)
    assert "element_kept_but_demolished" not in _kinds(result)


def test_keep_sanitari_while_demolishing_becomes_reuse_with_warning(
    library: AssemblyLibrary, units: dict[str, str]
) -> None:
    result = _run(library, units, _analysis(_BATH, elements={"sanitari": "keep"}), mq="6")
    assert "DEM-006" in _qty(result), "they must come off before floor and walls are demolished"
    assert "BAG-SAN-001" not in _qty(result)
    assert (_REUSE_SANITARI, "reuse") in _manual(result)
    warning = next(w for w in result.warnings if w.kind == "element_kept_but_demolished")
    assert "Sanitari" in warning.message and "DEM-002" in warning.message


def test_keep_sanitari_in_light_bathroom_drops_both(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(("ASM-BAGNO-LIGHT", []), elements={"sanitari": "keep"}))
    assert set(_qty(result)) == {"IMP-ID-001"}
    assert result.warnings == []
    assert _REUSE_SANITARI not in [work for work, _ in _manual(result)]


def test_keep_floor_drops_floor_lines(library: AssemblyLibrary, units: dict[str, str]) -> None:
    choices: dict[str, ElementAction] = {"pavimento": "keep", "rivestimento_pareti": "keep", "sanitari": "keep"}
    result = _run(library, units, _analysis(_BATH, elements=choices), mq="6")
    gone = {"DEM-002", "PAV-004", "PAV-001", "DEM-003", "MUR-004", "BAG-RIV-001", "DEM-006", "BAG-SAN-001"}
    assert not gone & set(_qty(result))
    assert "element_kept_but_demolished" not in _kinds(result)


def test_kept_rubinetteria_drops_its_supply_work(library: AssemblyLibrary, units: dict[str, str]) -> None:
    choices: dict[str, ElementAction] = {"rubinetteria": "keep", "rivestimento_pareti": "keep"}
    result = _run(library, units, _analysis(_BATH, elements=choices), mq="6")
    assert "Rubinetteria (fornitura)" not in [work for work, _ in _manual(result)]
    assert "element_kept_but_demolished" not in _kinds(result)


def test_reuse_without_reuse_work_is_keep_with_warning(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(_BATH, elements={"pavimento": "reuse"}), mq="6")
    assert not {"DEM-002", "PAV-004", "PAV-001"} & set(_qty(result))
    assert "reuse_not_possible" in _kinds(result)


def test_choice_for_an_element_of_no_chosen_package_changes_nothing(
    library: AssemblyLibrary, units: dict[str, str]
) -> None:
    plain = _run(library, units, _analysis(("ASM-PAVIMENTO", [])), mq="20")
    chosen = _run(library, units, _analysis(("ASM-PAVIMENTO", []), elements={"sanitari": "keep"}), mq="20")
    assert _qty(chosen) == _qty(plain)


def test_extra_line_is_added_with_the_model_quantity(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(extras=[("PIT-001", 30.456)]))
    line = result.lines[0]
    assert (line.sku, line.qty, line.origin, line.reasoning) == ("PIT-001", Decimal("30.46"), "extra", "extra PIT-001")


def test_extra_duplicate_of_a_package_line_is_dropped(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(_BATH, extras=[("PAV-001", 40), ("PIT-001", 20)]), mq="6")
    pav = [line for line in result.lines if line.sku == "PAV-001"]
    assert [(line.qty, line.origin) for line in pav] == [(Decimal("6.3"), "package")]
    assert _qty(result)["PIT-001"] == Decimal("20")


def test_extra_out_of_bounds_or_unknown_is_dropped(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(extras=[("PIT-001", 9999), ("NON-ESISTE-1", 2)]))
    assert [line.sku for line in result.lines] == ["PIT-001"]
    for huge in (10001, 1e60):
        over = _run(library, units, _analysis(extras=[("PIT-001", huge)]))
        assert over.lines == []
        assert _kinds(over) == ["qty_out_of_bounds"]


def test_rule_adds_disposal_for_an_extra_floor_removal(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(extras=[("DEM-002", 20)]), mq="20")
    smal = next(line for line in result.lines if line.sku == "SMAL-001")
    assert (smal.qty, smal.origin) == (Decimal("1.14"), "rule")


def test_rule_disposal_without_the_measure_asks_for_it(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(extras=[("DEM-002", 20)]))
    assert "SMAL-001" not in _qty(result)
    assert result.missing_measures == ["mq"]


def test_rule_excludes_screed_with_underfloor_heating(library: AssemblyLibrary, units: dict[str, str]) -> None:
    analysis = _analysis(_BATH, ("ASM-RISCALDAMENTO", ["if_pavimento_radiante"]))
    result = _run(library, units, analysis, mq="6")
    assert "PAV-004" not in _qty(result)
    assert "TERM-PAV-001" in _qty(result)


def test_load_bearing_wall_flags_admin(library: AssemblyLibrary, units: dict[str, str]) -> None:
    result = _run(library, units, _analysis(("ASM-ABBATTIMENTO-PARETI", ["if_portante"])), mq_parete="8")
    assert _qty(result)["MUR-003"] == Decimal("1")
    assert _kinds(result) == ["admin_check"]
    assert _run(library, units, _analysis(("ASM-ABBATTIMENTO-PARETI", [])), mq_parete="8").warnings == []


def test_live_price_book_missing_or_unit_changed_becomes_manual_work(
    library: AssemblyLibrary, units: dict[str, str]
) -> None:
    live = {**units, "MUR-004": "cad"}
    del live["SMAL-001"]
    result = _run(library, live, _analysis(_BATH), mq="6")
    assert not {"MUR-004", "SMAL-001"} & set(_qty(result))
    assert "BAG-RIV-001" in _qty(result)
    mismatches = [w for w in result.warnings if w.kind == "price_book_mismatch"]
    assert sorted(w.skus for w in mismatches) == [("MUR-004",), ("SMAL-001",)]
    manual = [work for work, origin in _manual(result) if origin == "price_book"]
    assert len(manual) == 2
    assert any("MUR-004" in work for work in manual) and any("SMAL-001" in work for work in manual)


def test_unmapped_requests_become_manual_work(library: AssemblyLibrary, units: dict[str, str]) -> None:
    requests = ["Vespaio aerato sotto il pavimento", "  ", "Vespaio aerato sotto il pavimento"]
    result = _run(library, units, _analysis(unmapped=requests))
    assert _manual(result) == [("Vespaio aerato sotto il pavimento", "client_request")]
