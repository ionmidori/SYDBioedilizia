"""Intervention spec → quote lines, computed by code (Phase 140, step 1).

The InsightEngine compiles a spec (packages, conditions, measures with their
source); this module expands it with the library formulas
(`renovation_assemblies.json`) into price-book lines, work quoted by hand,
warnings for the admin and the measures still missing. Pure: no I/O, no model.

Quantities are Decimal, rounded once to two decimals (ROUND_HALF_UP). They are
quantities, not amounts: prices stay with `src/core/money.py` downstream.
"""
from __future__ import annotations

import ast
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Context, Decimal, DivisionByZero, InvalidOperation, Overflow
from typing import Literal

from src.core.logger import get_logger
from src.core.money import round_half_up, to_decimal
from src.schemas.assembly_library import Assembly, AssemblyLibrary, AssemblySku, formula_variables, validate_formula
from src.schemas.room import RoomBrief
from src.services.insight_engine import InsightAnalysis, PackageChoice

logger = get_logger(__name__)

# Bounds of a line quantity (moved here from quote_tools: they bound every line).
MIN_QTY = Decimal("0.01")
MAX_QTY = Decimal(10_000)
_QTY_PLACES = 2
# Formula arithmetic (divisions included); the only rounding is the final one.
_FORMULA = Context(prec=28, rounding=ROUND_HALF_UP, traps=[InvalidOperation, DivisionByZero, Overflow])

# What to ask the client when a formula needs a measure nobody gave.
MEASURE_QUESTIONS: Mapping[str, str] = {
    "mq": "Quanti metri quadri misura il pavimento della stanza, anche indicativamente?",
    "mq_pareti": "Quanti metri quadri di pareti vanno trattati, anche indicativamente?",
    "mq_parete": "Quanto è grande la parete da abbattere (larghezza per altezza, anche indicativa)?",
    "ml_parete": "Quanti metri è lunga la parete interessata?",
    "ml_perimetro": "Quanti metri misura il perimetro della stanza?",
    "ml_pensili": "Quanti metri lineari di pensili ha la cucina?",
    "n_finestre": "Quante finestre vanno sostituite?",
    "n_porte": "Quante porte interne vanno sostituite?",
    "n_radiatori": "Quanti radiatori servono?",
}

LineOrigin = Literal["package", "extra", "rule"]
ManualOrigin = Literal["package", "reuse", "client_request", "price_book"]
WarningKind = Literal[
    "element_kept_but_demolished",
    "reuse_not_possible",
    "choice_defaulted",
    "admin_check",
    "price_book_mismatch",
    "qty_out_of_bounds",
    "unknown_condition",
    "unknown_package",
]


class MissingMeasure(Exception):
    """A formula needs a measure the spec and the room brief do not have."""

    def __init__(self, variable: str) -> None:
        super().__init__(f"Misura mancante: {variable}")
        self.variable = variable


@dataclass(frozen=True)
class ExpandedLine:
    sku: str
    qty: Decimal
    reasoning: str
    origin: LineOrigin
    assembly_id: str | None = None


@dataclass(frozen=True)
class ManualWork:
    """Work with no price-book line: the technician quotes it by hand."""
    work: str
    origin: ManualOrigin


@dataclass(frozen=True)
class ExpansionWarning:
    kind: WarningKind
    message: str
    skus: tuple[str, ...] = ()


@dataclass(frozen=True)
class Expansion:
    lines: list[ExpandedLine] = field(default_factory=list)
    manual_work: list[ManualWork] = field(default_factory=list)
    warnings: list[ExpansionWarning] = field(default_factory=list)
    missing_measures: list[str] = field(default_factory=list)

    @property
    def questions(self) -> list[str]:
        """One question per missing measure, in the order they were found missing."""
        return [MEASURE_QUESTIONS[m] for m in self.missing_measures if m in MEASURE_QUESTIONS]


# ── Formulas ──────────────────────────────────────────────────────────────────


def _evaluate(node: ast.AST, measures: Mapping[str, Decimal]) -> Decimal:
    if isinstance(node, ast.Constant) and isinstance(node.value, int | float) and not isinstance(node.value, bool):
        return to_decimal(node.value)
    if isinstance(node, ast.Name):
        if node.id not in measures:
            raise MissingMeasure(node.id)
        return measures[node.id]
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return _FORMULA.minus(_evaluate(node.operand, measures))
    if isinstance(node, ast.BinOp):
        left, right = _evaluate(node.left, measures), _evaluate(node.right, measures)
        if isinstance(node.op, ast.Add):
            return _FORMULA.add(left, right)
        if isinstance(node.op, ast.Sub):
            return _FORMULA.subtract(left, right)
        if isinstance(node.op, ast.Mult):
            return _FORMULA.multiply(left, right)
        if isinstance(node.op, ast.Div):
            return _FORMULA.divide(left, right)
    # validate_formula admits nothing else.
    raise ValueError(f"Unsupported formula node: {type(node).__name__}")


def evaluate_formula(formula: str, measures: Mapping[str, Decimal]) -> Decimal:
    """The exact value of a library formula; MissingMeasure if a measure is absent."""
    tree = ast.parse(validate_formula(formula), mode="eval")
    return _evaluate(tree.body, measures)


def resolve_measures(analysis: InsightAnalysis, brief: RoomBrief | None) -> dict[str, Decimal]:
    """The measures of the room: the spec first, then the room brief (floor, walls).

    A measure of 0 or less is no measure (the model's "unknown")."""
    measures: dict[str, Decimal] = {}
    for measure in analysis.measures:
        value = to_decimal(measure.value)
        if value > 0 and measure.name not in measures:
            measures[measure.name] = value
    if brief is not None:
        for name, value in (("mq", brief.floor_mq), ("mq_pareti", brief.walls_mq)):
            if name not in measures and value is not None and value > 0:
                measures[name] = to_decimal(value)
    return measures


# ── Expansion ─────────────────────────────────────────────────────────────────


@dataclass
class _Draft:
    """Mutable state of one expansion; frozen into an Expansion at the end."""
    lines: list[ExpandedLine] = field(default_factory=list)
    manual_work: list[ManualWork] = field(default_factory=list)
    warnings: list[ExpansionWarning] = field(default_factory=list)
    missing_measures: list[str] = field(default_factory=list)

    def add_manual(self, work: str, origin: ManualOrigin) -> None:
        if all(m.work != work for m in self.manual_work):
            self.manual_work.append(ManualWork(work, origin))

    def missing(self, variable: str) -> None:
        if variable not in self.missing_measures:
            self.missing_measures.append(variable)

    def freeze(self) -> Expansion:
        return Expansion(list(self.lines), list(self.manual_work), list(self.warnings), list(self.missing_measures))


def _measures_text(formula: str, measures: Mapping[str, Decimal]) -> str:
    used = sorted(name for name in measures if name in formula_variables(formula))
    values = ", ".join(f"{name}={measures[name].normalize():f}" for name in used)
    return f"{formula} con {values}" if values else formula


def _line_quantity(
    formula: str, measures: Mapping[str, Decimal], sku: str, draft: _Draft
) -> Decimal | None:
    """The rounded quantity of a line, or None when it cannot or should not be quoted."""
    try:
        value = evaluate_formula(formula, measures)
    except MissingMeasure as exc:
        draft.missing(exc.variable)
        return None
    except ArithmeticError:
        # A library formula the validator admits but the measures break (e.g. a zero divisor).
        logger.exception("[Expansion] Formula not computable.", extra={"sku": sku, "formula": formula})
        draft.warnings.append(ExpansionWarning(
            "admin_check", f"{sku}: la formula {formula} non è calcolabile con queste misure, voce non inserita", (sku,),
        ))
        return None
    if value > MAX_QTY:  # checked before rounding: a huge value cannot be quantized
        logger.warning("[Expansion] Quantity out of bounds.", extra={"sku": sku, "qty": f"{value:.2E}"})
        draft.warnings.append(ExpansionWarning(
            "qty_out_of_bounds", f"{sku}: quantità {value:.2f} fuori dai limiti, voce non inserita", (sku,),
        ))
        return None
    qty = round_half_up(value, _QTY_PLACES)
    if qty < MIN_QTY:
        return None  # e.g. n_finestre = 0: nothing to quote
    return qty


def _package_conditions(assembly: Assembly) -> set[str]:
    return {
        name
        for phase in assembly.phases
        for name in (phase.conditional, *(item.conditional for item in phase.skus))
        if name
    }


def _chosen_items(assembly: Assembly, chosen: set[str]) -> list[tuple[AssemblySku, bool]]:
    """The package lines the chosen conditions select, each with whether it is a
    default alternative (no condition of its phase was chosen)."""
    items: list[tuple[AssemblySku, bool]] = []
    for phase in assembly.phases:
        if phase.conditional and phase.conditional not in chosen:
            continue
        alternatives = [item for item in phase.skus if item.conditional]
        any_chosen = any(item.conditional in chosen for item in alternatives)
        for item in phase.skus:
            if item.conditional is None or item.conditional in chosen:
                items.append((item, False))
            elif not any_chosen and item.default_choice:
                items.append((item, True))
    return items


def _expand_package(
    assembly: Assembly, conditions: set[str], measures: Mapping[str, Decimal], draft: _Draft
) -> None:
    unknown = sorted(conditions - _package_conditions(assembly))
    if unknown:
        draft.warnings.append(ExpansionWarning(
            "unknown_condition", f"{assembly.name}: condizioni ignorate {', '.join(unknown)}",
        ))
    for item, defaulted in _chosen_items(assembly, conditions):
        qty = _line_quantity(item.qty_formula, measures, item.sku, draft)
        if qty is None:
            continue
        if defaulted:
            draft.warnings.append(ExpansionWarning(
                "choice_defaulted",
                f"{assembly.name}: scelta non indicata dal cliente, previsto {item.sku} ({item.note})",
                (item.sku,),
            ))
        draft.lines.append(ExpandedLine(
            sku=item.sku,
            qty=qty,
            reasoning=f"{assembly.name}: {item.note} ({_measures_text(item.qty_formula, measures)})",
            origin="package",
            assembly_id=assembly.id,
        ))
    for manual in assembly.manual_items:
        draft.add_manual(manual.work, "package")


def _merged_choices(packages: Sequence[PackageChoice]) -> dict[str, set[str]]:
    """Package id → conditions, a package chosen twice counted once."""
    merged: dict[str, set[str]] = {}
    for choice in packages:
        merged.setdefault(choice.assembly_id, set()).update(choice.conditions)
    return merged


def expand(
    analysis: InsightAnalysis,
    library: AssemblyLibrary,
    price_book_units: Mapping[str, str],
    measures: Mapping[str, Decimal],
) -> Expansion:
    """The quote lines of a spec, computed from the library formulas."""
    draft = _Draft()
    by_id = {assembly.id: assembly for assembly in library.assemblies}
    for assembly_id, conditions in _merged_choices(analysis.packages).items():
        assembly = by_id.get(assembly_id)
        if assembly is None:
            draft.warnings.append(ExpansionWarning("unknown_package", f"Pacchetto sconosciuto ignorato: {assembly_id}"))
            continue
        _expand_package(assembly, conditions, measures, draft)
    return draft.freeze()
