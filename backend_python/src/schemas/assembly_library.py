"""
Assembly library — the renovation packages (renovation_assemblies.json).

Each package lists the price-book SKUs a macro request expands into (e.g.
"bagno nuovo"), with the unit the SKU is priced in and a quantity formula.
Formulas are plain arithmetic over a closed set of room measures, so they can
be checked here and evaluated by code later (Phase 140, step 1).

Backend-only: not part of the API except `AssemblyProblem`, which the admin
price-book response carries (Golden Sync: web_client/types/admin-price-book.ts).
"""
from __future__ import annotations

import ast
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# The measures a formula may use (those the library already uses).
FORMULA_VARIABLES: frozenset[str] = frozenset({
    "mq", "mq_pareti", "mq_parete", "ml_parete", "ml_perimetro", "ml_pensili",
    "n_finestre", "n_porte", "n_radiatori",
})

_OPERATORS = (ast.Add, ast.Sub, ast.Mult, ast.Div)


def _is_arithmetic(node: ast.AST) -> bool:
    if isinstance(node, ast.BinOp):
        return isinstance(node.op, _OPERATORS) and _is_arithmetic(node.left) and _is_arithmetic(node.right)
    if isinstance(node, ast.UnaryOp):
        return isinstance(node.op, ast.USub) and _is_arithmetic(node.operand)
    if isinstance(node, ast.Constant):
        return type(node.value) in (int, float)
    if isinstance(node, ast.Name):
        return node.id in FORMULA_VARIABLES
    return False


class AssemblySku(BaseModel):
    """A price-book SKU inside a package phase."""
    model_config = ConfigDict(extra="forbid")

    sku: str = Field(..., min_length=1)
    unit: str = Field(..., min_length=1, description="Unit of the SKU in the price book (mq, cad, ps, ml...)")
    qty_formula: str = Field(..., description="Arithmetic over FORMULA_VARIABLES, e.g. 'mq * 2.2'")
    note: str
    conditional: str | None = Field(default=None, description="Only when this condition holds, e.g. 'if_pvc'")

    @field_validator("qty_formula")
    @classmethod
    def _formula(cls, value: str) -> str:
        try:
            tree = ast.parse(value, mode="eval")
        except SyntaxError as exc:
            raise ValueError(f"Formula non valida: {value!r}") from exc
        if not _is_arithmetic(tree.body):
            allowed = ", ".join(sorted(FORMULA_VARIABLES))
            raise ValueError(f"Formula {value!r}: solo numeri, + - * / e le misure {allowed}.")
        return value


class AssemblyPhase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phase: str
    note: str | None = None
    conditional: str | None = None
    skus: list[AssemblySku]


class ManualItem(BaseModel):
    """Work the package needs but the price book has no line for: quoted by hand."""
    model_config = ConfigDict(extra="forbid")

    work: str = Field(..., min_length=1)
    note: str


class Assembly(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    description: str
    triggers: list[str]
    questions_required: list[str]
    phases: list[AssemblyPhase]
    manual_items: list[ManualItem] = Field(default_factory=list)


class DependencyRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rule: str
    triggers_sku: list[str]
    requires_sku: list[str] = Field(default_factory=list)
    excludes_sku: list[str] = Field(default_factory=list)
    question_before_exclude: str | None = None
    requires_admin_flag: bool = False
    admin_note: str | None = None


class AssemblyLibrary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str
    description: str
    assemblies: list[Assembly]
    dependency_rules: list[DependencyRule]


class AssemblyProblem(BaseModel):
    """A SKU the library uses that the price book lacks or prices in another unit."""
    model_config = ConfigDict(extra="forbid")

    sku: str
    kind: Literal["missing", "unit_changed"]
    assemblies: list[str] = Field(..., description="Package ids (or 'dependency_rules') that use the SKU")
    expected_unit: str = Field(..., description="Unit the library expects ('' when only a rule uses the SKU)")
    actual_unit: str | None = None
