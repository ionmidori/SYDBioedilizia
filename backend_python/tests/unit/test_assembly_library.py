"""The assembly library (renovation_assemblies.json): schema, formulas and
consistency with the price book (Phase 140, step 0)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError
from src.schemas.assembly_library import AssemblyLibrary, AssemblyProblem, AssemblySku
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
        "dependency_rules": [{"rule": "regola", "triggers_sku": ["X-1"], "requires_sku": rule_skus}],
    })


@pytest.mark.parametrize("formula", ["1", "mq * 2.2 * 1.05", "mq * 0.8 / 7", "n_porte * 2", "(mq - 1) * 2"])
def test_formula_accepts_allowed_arithmetic(formula: str) -> None:
    assert AssemblySku(sku="X-1", unit="mq", qty_formula=formula, note="n").qty_formula == formula


@pytest.mark.parametrize(
    "formula", ["mq_bagno * 2", "__import__('os')", "mq ** 2", "mq if 1 else 2", "", "mq.real", "-"]
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
