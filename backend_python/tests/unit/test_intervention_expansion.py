"""Deterministic expansion of an intervention spec (Phase 140, step 1).

The model chooses packages, conditions and measures; the code computes every
line from the library formulas. Real bundled library and seed price book.
"""
from decimal import Decimal

import pytest
from src.schemas.assembly_library import FORMULA_VARIABLES, AssemblyLibrary
from src.schemas.room import RoomBrief
from src.services import assembly_library, price_book
from src.services.insight_engine import InsightAnalysis, PackageChoice, SpecMeasure
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


def _analysis(*packages: tuple[str, list[str]], measures: list[SpecMeasure] | None = None) -> InsightAnalysis:
    return InsightAnalysis(
        summary="s",
        packages=[PackageChoice(assembly_id=a, conditions=c) for a, c in packages],
        measures=measures or [],
    )


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
