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
import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# The measures a formula may use (those the library already uses).
FORMULA_VARIABLES: frozenset[str] = frozenset({
    "mq", "mq_pareti", "mq_parete", "ml_parete", "ml_perimetro", "ml_pensili",
    "n_finestre", "n_porte", "n_radiatori",
})

_OPERATORS = (ast.Add, ast.Sub, ast.Mult, ast.Div)


def _is_zero(node: ast.AST) -> bool:
    return isinstance(node, ast.Constant) and type(node.value) in (int, float) and node.value == 0


def _is_arithmetic(node: ast.AST) -> bool:
    if isinstance(node, ast.BinOp):
        if isinstance(node.op, ast.Div) and _is_zero(node.right):
            return False
        return isinstance(node.op, _OPERATORS) and _is_arithmetic(node.left) and _is_arithmetic(node.right)
    if isinstance(node, ast.UnaryOp):
        return isinstance(node.op, ast.USub) and _is_arithmetic(node.operand)
    if isinstance(node, ast.Constant):
        value = node.value
        return type(value) in (int, float) and isinstance(value, int | float) and math.isfinite(value)
    if isinstance(node, ast.Name):
        return node.id in FORMULA_VARIABLES
    return False


def validate_formula(value: str) -> str:
    """The formula if it is plain arithmetic over FORMULA_VARIABLES, else ValueError."""
    try:
        tree = ast.parse(value, mode="eval")
    except SyntaxError as exc:
        raise ValueError(f"Formula non valida: {value!r}") from exc
    if not _is_arithmetic(tree.body):
        allowed = ", ".join(sorted(FORMULA_VARIABLES))
        raise ValueError(f"Formula {value!r}: solo numeri, + - * / e le misure {allowed}.")
    return value


def formula_variables(formula: str) -> frozenset[str]:
    """The measure names a (valid) formula uses."""
    tree = ast.parse(validate_formula(formula), mode="eval")
    return frozenset(node.id for node in ast.walk(tree) if isinstance(node, ast.Name))


# What a request does to an existing element of the room.
ElementAction = Literal["replace", "reuse", "keep"]


class AssemblySku(BaseModel):
    """A price-book SKU inside a package phase."""
    model_config = ConfigDict(extra="forbid")

    sku: str = Field(..., min_length=1)
    unit: str = Field(..., min_length=1, description="Unit of the SKU in the price book (mq, cad, ps, ml...)")
    qty_formula: str = Field(..., description="Arithmetic over FORMULA_VARIABLES, e.g. 'mq * 2.2'")
    note: str
    conditional: str | None = Field(default=None, description="Only when this condition holds, e.g. 'if_pvc'")

    default_choice: bool = Field(
        default=False,
        description="Among the conditional alternatives of a phase, the one used when the client has not chosen",
    )

    @field_validator("qty_formula")
    @classmethod
    def _formula(cls, value: str) -> str:
        return validate_formula(value)


class AssemblyPhase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phase: str
    note: str | None = None
    conditional: str | None = None
    skus: list[AssemblySku]

    @model_validator(mode="after")
    def _default_choices(self) -> AssemblyPhase:
        defaults = [item for item in self.skus if item.default_choice]
        if len(defaults) > 1:
            raise ValueError(f"Fase {self.phase!r}: al massimo una voce default_choice.")
        if defaults and defaults[0].conditional is None:
            raise ValueError(f"Fase {self.phase!r}: default_choice {defaults[0].sku} richiede un conditional.")
        return self


class ManualItem(BaseModel):
    """Work the package needs but the price book has no line for: quoted by hand."""
    model_config = ConfigDict(extra="forbid")

    work: str = Field(..., min_length=1)
    note: str


class AssemblyElement(BaseModel):
    """A part of the room (sanitari, pavimento...) the client can replace, reuse or keep."""
    model_config = ConfigDict(extra="forbid")

    element: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    remove_skus: list[str] = Field(
        default_factory=list, description="Removal lines: kept when the element is reused, dropped when it is kept in place"
    )
    supply_skus: list[str] = Field(default_factory=list, description="Lines that supply and fit the new element")
    supply_manual: list[str] = Field(
        default_factory=list, description="ManualItem.work entries that supply the new element"
    )
    reuse_work: str | None = Field(default=None, description="Manual work added when the existing element is reused")
    keep_conflicts_with: list[str] = Field(
        default_factory=list,
        description="Lines (demolitions around it) that make keeping the element in place impossible: it is reused instead",
    )


class Assembly(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    description: str
    triggers: list[str]
    questions_required: list[str]
    phases: list[AssemblyPhase]
    manual_items: list[ManualItem] = Field(default_factory=list)
    elements: list[AssemblyElement] = Field(default_factory=list)

    @model_validator(mode="after")
    def _elements(self) -> Assembly:
        skus = {item.sku for phase in self.phases for item in phase.skus}
        manual = {item.work for item in self.manual_items}
        seen: set[str] = set()
        for element in self.elements:
            if element.element in seen:
                raise ValueError(f"{self.id}: elemento duplicato {element.element!r}.")
            seen.add(element.element)
            for sku in (*element.remove_skus, *element.supply_skus, *element.keep_conflicts_with):
                if sku not in skus:
                    raise ValueError(f"{self.id}/{element.element}: {sku} non e' una voce del pacchetto.")
            for work in element.supply_manual:
                if work not in manual:
                    raise ValueError(
                        f"{self.id}/{element.element}: {work!r} non e' una lavorazione manuale del pacchetto."
                    )
        return self


class DependencyRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rule: str
    triggers_sku: list[str]
    requires_sku: list[str] = Field(default_factory=list)
    requires_qty_formula: str | None = Field(
        default=None, description="Quantity of each required SKU, like AssemblySku.qty_formula"
    )
    excludes_sku: list[str] = Field(default_factory=list)
    question_before_exclude: str | None = None
    requires_admin_flag: bool = False
    admin_note: str | None = None

    @field_validator("requires_qty_formula")
    @classmethod
    def _formula(cls, value: str | None) -> str | None:
        return None if value is None else validate_formula(value)

    @model_validator(mode="after")
    def _quantity_needed(self) -> DependencyRule:
        if self.requires_sku and self.requires_qty_formula is None:
            raise ValueError(f"Regola {self.rule!r}: requires_sku richiede requires_qty_formula.")
        return self


class AssemblyLibrary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str
    description: str
    assemblies: list[Assembly]
    dependency_rules: list[DependencyRule]

    def conditions(self) -> list[str]:
        """Every condition name used by a phase or a SKU, sorted, without duplicates."""
        names = {
            name
            for assembly in self.assemblies
            for phase in assembly.phases
            for name in (phase.conditional, *(item.conditional for item in phase.skus))
            if name
        }
        return sorted(names)

    def element_names(self) -> list[str]:
        """Every element name used by a package, sorted, without duplicates."""
        return sorted({e.element for assembly in self.assemblies for e in assembly.elements})


class AssemblyProblem(BaseModel):
    """A SKU the library uses that the price book lacks or prices in another unit."""
    model_config = ConfigDict(extra="forbid")

    sku: str
    kind: Literal["missing", "unit_changed"]
    assemblies: list[str] = Field(..., description="Package ids (or 'dependency_rules') that use the SKU")
    expected_unit: str = Field(..., description="Unit the library expects ('' when only a rule uses the SKU)")
    actual_unit: str | None = None
