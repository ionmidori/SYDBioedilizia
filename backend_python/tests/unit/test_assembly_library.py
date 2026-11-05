"""The assembly library (renovation_assemblies.json): schema, formulas and
consistency with the price book (Phase 140, step 0)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError
from src.schemas.assembly_library import (
    Assembly,
    AssemblyLibrary,
    AssemblyProblem,
    AssemblySku,
    DependencyRule,
    formula_variables,
)
from src.services import assembly_library, price_book


@pytest.fixture(autouse=True)
def _fresh_library_cache():
    assembly_library.reset_library_cache()
    yield
    assembly_library.reset_library_cache()


def _library(rule_skus: list[str]) -> AssemblyLibrary:
    return AssemblyLibrary.model_validate({
        "version": "test",
        "description": "test",
        "assemblies": [{
            "id": "ASM-TEST",
            "name": "Test",
            "description": "Test",
            "triggers": ["test"],
            "questions_required": [],
            "phases": [{"phase": "Lavori", "skus": [
                {"sku": "X-1", "unit": "mq", "qty_formula": "mq", "note": "voce"},
            ]}],
        }],
        "dependency_rules": [{"rule": "regola", "triggers_sku": ["X-1"], "requires_sku": rule_skus,
                             "requires_qty_formula": "mq" if rule_skus else None}],
    })


@pytest.mark.parametrize("formula", ["1", "mq * 2.2 * 1.05", "mq * 0.8 / 7", "n_porte * 2", "(mq - 1) * 2"])
def test_formula_accepts_allowed_arithmetic(formula: str) -> None:
    assert AssemblySku(sku="X-1", unit="mq", qty_formula=formula, note="n").qty_formula == formula


@pytest.mark.parametrize(
    "formula",
    ["mq_bagno * 2", "__import__('os')", "mq ** 2", "mq if 1 else 2", "", "mq.real", "-", "mq / 0", "mq / 0.0", "1e309"],
)
def test_formula_rejects_unknown_or_unsafe(formula: str) -> None:
    with pytest.raises(ValidationError):
        AssemblySku(sku="X-1", unit="mq", qty_formula=formula, note="n")


def test_check_reports_missing_and_unit_changed() -> None:
    problems = assembly_library.check_against_price_book(_library(["X-2"]), [{"sku": "X-1", "unit": "cad"}])
    assert problems == [
        AssemblyProblem(sku="X-1", kind="unit_changed", assemblies=["ASM-TEST", "dependency_rules"],
                        expected_unit="mq", actual_unit="cad"),
        AssemblyProblem(sku="X-2", kind="missing", assemblies=["dependency_rules"], expected_unit=""),
    ]


def test_rule_only_sku_is_checked_for_existence_only() -> None:
    items = [{"sku": "X-1", "unit": "mq"}, {"sku": "X-2", "unit": "qualsiasi"}]
    assert assembly_library.check_against_price_book(_library(["X-2"]), items) == []


def test_referenced_skus_cover_phases_and_rules() -> None:
    assert assembly_library.referenced_skus(_library(["X-2"])) == {
        "X-1": ("mq", {"ASM-TEST", "dependency_rules"}),
        "X-2": ("", {"dependency_rules"}),
    }


def test_unreadable_library_returns_none(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    broken = tmp_path / "renovation_assemblies.json"
    broken.write_text("{not json", encoding="utf-8")
    monkeypatch.setattr(assembly_library, "LIBRARY_PATH", broken)
    assert assembly_library.load_library() is None


# ── The bundled library ───────────────────────────────────────────────────────


def test_bundled_library_loads() -> None:
    assert assembly_library.load_library() is not None


def test_bundled_library_matches_seed_price_book() -> None:
    library = assembly_library.load_library()
    assert library is not None
    assert assembly_library.check_against_price_book(library, price_book.seed_items()) == []


def test_admin_flag_rule_points_to_structural_item() -> None:
    library = assembly_library.load_library()
    assert library is not None
    flagged = [r for r in library.dependency_rules if r.requires_admin_flag]
    assert [r.triggers_sku for r in flagged] == [["MUR-003"]]


def test_invalid_formula_in_file_returns_none(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    data = _library([]).model_dump()
    data["assemblies"][0]["phases"][0]["skus"][0]["qty_formula"] = "mq_sconosciuto"
    bad = tmp_path / "renovation_assemblies.json"
    bad.write_text(json.dumps(data), encoding="utf-8")
    monkeypatch.setattr(assembly_library, "LIBRARY_PATH", bad)
    assert assembly_library.load_library() is None


# ── Elements, default choices, rule quantities (library v2.1) ────────────────


def _assembly(
    elements: list[dict[str, object]] | None = None,
    skus: list[dict[str, object]] | None = None,
    manual: list[str] | None = None,
) -> Assembly:
    return Assembly.model_validate({
        "id": "ASM-T", "name": "T", "description": "T", "triggers": ["t"], "questions_required": [],
        "phases": [{"phase": "Lavori", "skus": skus if skus is not None else [
            {"sku": "A-1", "unit": "mq", "qty_formula": "mq", "note": "a"},
            {"sku": "B-1", "unit": "cad", "qty_formula": "1", "note": "b", "conditional": "if_b"},
            {"sku": "B-2", "unit": "cad", "qty_formula": "1", "note": "b", "conditional": "if_b"},
        ]}],
        "manual_items": [{"work": w, "note": "n"} for w in (manual or [])],
        "elements": elements or [],
    })


def test_element_skus_must_belong_to_the_package() -> None:
    with pytest.raises(ValidationError):
        _assembly([{"element": "e", "label": "E", "supply_skus": ["XYZ-001"]}])
    with pytest.raises(ValidationError):
        _assembly([{"element": "e", "label": "E", "remove_skus": ["XYZ-001"]}])
    with pytest.raises(ValidationError):
        _assembly([{"element": "e", "label": "E", "supply_skus": ["A-1"], "keep_conflicts_with": ["XYZ-001"], "reuse_work": "r"}])
    assert _assembly([{"element": "e", "label": "E", "supply_skus": ["A-1"]}]).elements[0].element == "e"


def test_supply_manual_must_be_a_manual_item_of_the_package() -> None:
    with pytest.raises(ValidationError):
        _assembly([{"element": "e", "label": "E", "supply_manual": ["Rubinetteria"]}])
    ok = _assembly([{"element": "e", "label": "E", "supply_manual": ["Rubinetteria"]}], manual=["Rubinetteria"])
    assert ok.elements[0].supply_manual == ["Rubinetteria"]


def test_element_names_must_be_unique_in_the_package() -> None:
    element = {"element": "e", "label": "E", "supply_skus": ["A-1"]}
    with pytest.raises(ValidationError):
        _assembly([element, element])


def test_only_one_default_choice_per_phase() -> None:
    skus = [
        {"sku": "B-1", "unit": "cad", "qty_formula": "1", "note": "b", "conditional": "if_b", "default_choice": True},
        {"sku": "B-2", "unit": "cad", "qty_formula": "1", "note": "b", "conditional": "if_b", "default_choice": True},
    ]
    with pytest.raises(ValidationError):
        _assembly(skus=skus)


def test_default_choice_needs_a_conditional() -> None:
    skus = [{"sku": "A-1", "unit": "mq", "qty_formula": "mq", "note": "a", "default_choice": True}]
    with pytest.raises(ValidationError):
        _assembly(skus=skus)


def test_requires_rule_needs_a_quantity_formula() -> None:
    base = {"rule": "r", "triggers_sku": ["A"], "requires_sku": ["B"]}
    with pytest.raises(ValidationError):
        DependencyRule.model_validate(base)
    with pytest.raises(ValidationError):
        DependencyRule.model_validate({**base, "requires_qty_formula": "mq ** 2"})
    assert DependencyRule.model_validate({**base, "requires_qty_formula": "mq * 2"}).requires_qty_formula == "mq * 2"
    assert DependencyRule.model_validate({"rule": "r", "triggers_sku": ["A"]}).requires_qty_formula is None


def test_formula_variables() -> None:
    assert formula_variables("mq_parete * 2 + n_porte") == {"mq_parete", "n_porte"}
    assert formula_variables("1") == frozenset()


def test_conditions_and_element_names_are_sorted_and_unique() -> None:
    library = assembly_library.load_library()
    assert library is not None
    conditions = library.conditions()
    assert conditions == sorted(set(conditions))
    assert "if_pvc" in conditions
    names = library.element_names()
    assert names == sorted(set(names))
    assert {"sanitari", "pavimento"} <= set(names)


def test_bundled_library_v2_1_has_bathroom_elements() -> None:
    library = assembly_library.load_library()
    assert library is not None
    assert library.version == "2.1.0"
    found = {
        (a.id, e.element): (e.remove_skus, e.supply_skus, e.supply_manual, e.reuse_work, e.keep_conflicts_with)
        for a in library.assemblies
        for e in a.elements
    }
    sanitari_work = "Smontaggio con cura e rimontaggio dei sanitari esistenti"
    rubinetteria_work = "Rimontaggio della rubinetteria esistente"
    assert found == {
        ("ASM-BAGNO-FULL", "sanitari"): (["DEM-006"], ["BAG-SAN-001"], [], sanitari_work, ["DEM-002", "DEM-003"]),
        ("ASM-BAGNO-FULL", "box_doccia"): (
            [], ["BAG-BOX-001"], [], "Smontaggio e rimontaggio del box doccia esistente", ["DEM-002", "DEM-003"],
        ),
        ("ASM-BAGNO-FULL", "rubinetteria"): ([], [], ["Rubinetteria (fornitura)"], rubinetteria_work, ["DEM-003"]),
        ("ASM-BAGNO-FULL", "pavimento"): (["DEM-002"], ["PAV-004", "PAV-001"], [], None, []),
        ("ASM-BAGNO-FULL", "rivestimento_pareti"): (["DEM-003"], ["MUR-004", "BAG-RIV-001"], [], None, []),
        ("ASM-BAGNO-LIGHT", "sanitari"): (["DEM-006"], ["BAG-SAN-001"], [], sanitari_work, []),
        ("ASM-BAGNO-LIGHT", "rubinetteria"): ([], [], ["Rubinetteria (fornitura)"], rubinetteria_work, []),
        ("ASM-CUCINA-FULL", "pavimento"): (["DEM-002"], ["PAV-004", "PAV-001"], [], None, []),
    }
    bathroom = next(a for a in library.assemblies if a.id == "ASM-BAGNO-FULL")
    assert [e.element for e in bathroom.elements] == [
        "sanitari", "box_doccia", "rubinetteria", "pavimento", "rivestimento_pareti",
    ]


def test_element_needs_something_to_remove_or_supply() -> None:
    with pytest.raises(ValidationError):
        _assembly([{"element": "e", "label": "E"}])


def test_conflicting_keep_needs_reuse_work() -> None:
    element = {"element": "e", "label": "E", "remove_skus": ["A-1"], "keep_conflicts_with": ["A-1"]}
    with pytest.raises(ValidationError):
        _assembly([element])
    assert _assembly([{**element, "reuse_work": "Rimontaggio"}]).elements[0].reuse_work == "Rimontaggio"


def test_bundled_defaults_and_rule_quantity() -> None:
    library = assembly_library.load_library()
    assert library is not None
    defaults = {
        item.sku for a in library.assemblies for p in a.phases for item in p.skus if item.default_choice
    }
    assert defaults == {"INF-FIN-001", "INF-POR-001"}
    assert library.dependency_rules[0].requires_qty_formula == "mq * 0.4 / 7"
