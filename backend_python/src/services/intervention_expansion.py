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
from dataclasses import dataclass, field, replace
from datetime import datetime
from decimal import ROUND_HALF_UP, Context, Decimal, DivisionByZero, InvalidOperation, Overflow
from typing import Literal

from src.core.logger import get_logger
from src.core.money import round_half_up, to_decimal
from src.schemas.assembly_library import (
    MEASURE_LABELS,
    Assembly,
    AssemblyElement,
    AssemblyLibrary,
    AssemblySku,
    ElementAction,
    formula_variables,
    validate_formula,
)
from src.schemas.intervention_spec import (
    RoomInterventionSpec,
    StoredElementChoice,
    StoredExtraItem,
    StoredMeasure,
    StoredPackage,
)
from src.schemas.quote import ManualWorkOriginType
from src.schemas.room import RoomBrief
from src.services.assembly_library import referenced_skus
from src.services.insight_engine import InsightAnalysis, PackageChoice, SKUItemSuggestion, SpecMeasure

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
ManualOrigin = ManualWorkOriginType  # stored as is in QuoteRequest.manual_work
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
    # Short name of the work (library note or rule), used when the line has to be quoted by hand.
    note: str = ""
    # Measures the line's formula used, sorted (none for extra lines: the model gave the qty).
    measures: tuple[str, ...] = ()


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


def _values_text(values: Sequence[Decimal]) -> str:
    texts = [f"{value.normalize():f}" for value in values]
    return ", ".join(texts[:-1]) + " e " + texts[-1] if len(texts) > 1 else "".join(texts)


@dataclass(frozen=True)
class Expansion:
    lines: list[ExpandedLine] = field(default_factory=list)
    manual_work: list[ManualWork] = field(default_factory=list)
    warnings: list[ExpansionWarning] = field(default_factory=list)
    missing_measures: list[str] = field(default_factory=list)
    # Measure → the different values the model gave (several rooms in one unit?).
    conflicts: dict[str, tuple[Decimal, ...]] = field(default_factory=dict)

    @property
    def questions(self) -> list[str]:
        """One question per missing measure, in the order they were found missing. A
        measure with several values asks which room each one belongs to."""
        return [self._question(m) for m in self.missing_measures if m in MEASURE_QUESTIONS]

    def _question(self, measure: str) -> str:
        if measure not in self.conflicts:
            return MEASURE_QUESTIONS[measure]
        return (
            f"Ho più valori per {MEASURE_LABELS[measure]} ({_values_text(self.conflicts[measure])}): "
            "a quale stanza si riferisce ciascuno? Così quoto ogni stanza con le sue misure."
        )


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


def _measure_values(analysis: InsightAnalysis) -> dict[str, list[SpecMeasure]]:
    """The model's positive measures by name (0 or less is no measure: the model's "unknown")."""
    by_name: dict[str, list[SpecMeasure]] = {}
    for measure in analysis.measures:
        if measure.value > 0:
            by_name.setdefault(measure.name, []).append(measure)
    return by_name


def conflicting_measures(analysis: InsightAnalysis) -> dict[str, tuple[Decimal, ...]]:
    """Measures the model gave with different values, each with its values in order.

    One unit has one value per measure: two values are two rooms folded into one
    unit (a chat with no room), and neither is that unit's measure."""
    conflicts: dict[str, tuple[Decimal, ...]] = {}
    for name, measures in _measure_values(analysis).items():
        values = tuple(dict.fromkeys(to_decimal(m.value) for m in measures))
        if len(values) > 1:
            conflicts[name] = values
    return conflicts


def _spec_measures(analysis: InsightAnalysis) -> dict[str, SpecMeasure]:
    """The model's measures by name, the first of each name. A measure given with
    different values is left out: the room brief or the client decides it."""
    conflicts = conflicting_measures(analysis)
    return {name: measures[0] for name, measures in _measure_values(analysis).items() if name not in conflicts}


def resolve_measures(analysis: InsightAnalysis, brief: RoomBrief | None) -> dict[str, Decimal]:
    """The measures of the room: the spec first, then the room brief (floor, walls)."""
    measures = {name: to_decimal(m.value) for name, m in _spec_measures(analysis).items()}
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


def _formula_measures(formula: str) -> tuple[str, ...]:
    return tuple(sorted(formula_variables(formula)))


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
        return None  # a result below one cent: nothing to quote
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
            note=item.note,
            measures=_formula_measures(item.qty_formula),
        ))
    for manual in assembly.manual_items:
        draft.add_manual(manual.work, "package")


def _merged_choices(packages: Sequence[PackageChoice]) -> dict[str, set[str]]:
    """Package id → conditions, a package chosen twice counted once."""
    merged: dict[str, set[str]] = {}
    for choice in packages:
        merged.setdefault(choice.assembly_id, set()).update(choice.conditions)
    return merged


# ── Elements: replace (default), reuse, keep in place ─────────────────────────


@dataclass(frozen=True)
class _ElementDecision:
    assembly_id: str
    element: AssemblyElement
    action: ElementAction

    def dropped_skus(self) -> set[str]:
        if self.action == "keep":
            return {*self.element.remove_skus, *self.element.supply_skus}
        if self.action == "reuse":
            return set(self.element.supply_skus)
        return set()

    def dropped_manual(self) -> set[str]:
        return set(self.element.supply_manual) if self.action != "replace" else set()


def _dropped_lines(decisions: Sequence[_ElementDecision]) -> set[tuple[str, str]]:
    """(package id, SKU) of the lines the element choices remove."""
    return {(d.assembly_id, sku) for d in decisions for sku in d.dropped_skus()}


def _requested_actions(analysis: InsightAnalysis) -> dict[str, ElementAction]:
    """Element → action; the first choice of an element wins."""
    actions: dict[str, ElementAction] = {}
    for choice in analysis.element_choices:
        actions.setdefault(choice.element, choice.action)
    return actions


ACTION_LABELS: Mapping[ElementAction, str] = {"replace": "sostituisci", "reuse": "riutilizza", "keep": "lascia in posa"}


def _flag_shared_choices(assemblies: Sequence[Assembly], actions: Mapping[str, ElementAction], draft: _Draft) -> None:
    """A keep or reuse names an element, not a room: with several chosen packages that
    have it (a bathroom and a kitchen in one unit) it applies to all of them."""
    for element, action in actions.items():
        if action == "replace":
            continue
        owners = [a for a in assemblies if any(e.element == element for e in a.elements)]
        if len(owners) > 1:
            label = next(e.label for e in owners[0].elements if e.element == element)
            draft.warnings.append(ExpansionWarning(
                "admin_check",
                f"\"{ACTION_LABELS[action]}\" su {label} applicato a {', '.join(a.name for a in owners)}: "
                "verificare a quale stanza si riferisce",
            ))


def _decide_elements(
    assemblies: Sequence[Assembly], actions: Mapping[str, ElementAction], draft: _Draft
) -> list[_ElementDecision]:
    """The action applied to each element of the chosen packages.

    A reuse without rebuild work is a keep. A keep with a demolition around the
    element (`keep_conflicts_with` still among the lines once every choice is
    applied) cannot stay in place: it is reused (taken off and put back).
    Only package lines count here: extra lines are added after the choices."""
    decisions: list[_ElementDecision] = []
    for assembly in assemblies:
        for element in assembly.elements:
            action = actions.get(element.element, "replace")
            if action == "reuse" and element.reuse_work is None:
                draft.warnings.append(ExpansionWarning(
                    "reuse_not_possible",
                    f"{assembly.name}: {element.label} non si può riutilizzare, lasciato in posa",
                ))
                action = "keep"
            decisions.append(_ElementDecision(assembly.id, element, action))

    dropped = _dropped_lines(decisions)
    remaining = {line.sku for line in draft.lines if (line.assembly_id, line.sku) not in dropped}
    final: list[_ElementDecision] = []
    for decision in decisions:
        conflicts = sorted(set(decision.element.keep_conflicts_with) & remaining)
        if decision.action == "keep" and conflicts and decision.element.reuse_work is not None:
            draft.warnings.append(ExpansionWarning(
                "element_kept_but_demolished",
                f"Il cliente vuole tenere {decision.element.label}, ma si demoliscono {', '.join(conflicts)}: "
                "previsto smontaggio e rimontaggio, da verificare",
                tuple(conflicts),
            ))
            decision = _ElementDecision(decision.assembly_id, decision.element, "reuse")
        final.append(decision)
    return final


def _apply_elements(decisions: Sequence[_ElementDecision], draft: _Draft) -> None:
    dropped = _dropped_lines(decisions)
    dropped_manual = {work for d in decisions for work in d.dropped_manual()}
    draft.lines = [line for line in draft.lines if (line.assembly_id, line.sku) not in dropped]
    draft.manual_work = [m for m in draft.manual_work if not (m.origin == "package" and m.work in dropped_manual)]
    for decision in decisions:
        if decision.action == "reuse" and decision.element.reuse_work is not None:
            draft.add_manual(decision.element.reuse_work, "reuse")


# ── Extra lines, dependency rules, live price book ────────────────────────────


def _add_extras(
    suggestions: Sequence[SKUItemSuggestion],
    covered: set[str],
    price_book_units: Mapping[str, str],
    draft: _Draft,
) -> None:
    """The model's single lines outside the packages. A SKU the chosen packages
    cover (`covered`: their lines before the element choices) is dropped: the
    package line wins, and a line an element choice removed stays removed.
    An unknown SKU is left out (quote_tools reports it)."""
    for suggestion in suggestions:
        if suggestion.sku in covered:
            logger.info("[Expansion] Extra line already in a package: dropped.", extra={"sku": suggestion.sku})
            continue
        if suggestion.sku not in price_book_units:
            logger.info("[Expansion] Extra line not in the price book: dropped.", extra={"sku": suggestion.sku})
            continue
        value = to_decimal(suggestion.qty)
        if value > MAX_QTY:  # before rounding, like the package lines
            draft.warnings.append(ExpansionWarning(
                "qty_out_of_bounds", f"{suggestion.sku}: quantità {value:.2f} fuori dai limiti, voce non inserita",
                (suggestion.sku,),
            ))
            continue
        qty = round_half_up(value, _QTY_PLACES)
        draft.lines.append(ExpandedLine(
            sku=suggestion.sku, qty=qty, reasoning=suggestion.ai_reasoning, origin="extra",
        ))


def _library_notes(library: AssemblyLibrary) -> dict[str, str]:
    """SKU → the first package note naming it (a work description for the technician)."""
    notes: dict[str, str] = {}
    for assembly in library.assemblies:
        for phase in assembly.phases:
            for item in phase.skus:
                notes.setdefault(item.sku, item.note)
    return notes


def _apply_rules(library: AssemblyLibrary, measures: Mapping[str, Decimal], draft: _Draft) -> None:
    """Dependency rules on the lines found so far.

    Exclusions first, so an excluded line triggers nothing. Then every rule whose
    trigger is present fires once: required lines are added (and may trigger
    other rules, in any order), structural checks are flagged to the admin."""
    rules = library.dependency_rules
    present = {line.sku for line in draft.lines}
    excluded = {sku for rule in rules if present.intersection(rule.triggers_sku) for sku in rule.excludes_sku}
    if excluded:
        draft.lines = [line for line in draft.lines if line.sku not in excluded]
        present -= excluded
    notes = _library_notes(library)
    fired: set[int] = set()
    progress = True
    while progress:  # at most one pass per rule: each fires once
        progress = False
        for index, rule in enumerate(rules):
            if index in fired or not present.intersection(rule.triggers_sku):
                continue
            fired.add(index)
            progress = True
            for sku in rule.requires_sku:
                if sku in present or sku in excluded or rule.requires_qty_formula is None:
                    continue
                qty = _line_quantity(rule.requires_qty_formula, measures, sku, draft)
                if qty is not None:
                    draft.lines.append(ExpandedLine(
                        sku=sku, qty=qty, origin="rule", note=notes.get(sku, rule.rule),
                        reasoning=f"{rule.rule} ({_measures_text(rule.requires_qty_formula, measures)})",
                        measures=_formula_measures(rule.requires_qty_formula),
                    ))
                    present.add(sku)
            if rule.requires_admin_flag:
                draft.warnings.append(ExpansionWarning(
                    "admin_check", rule.admin_note or rule.rule, tuple(sorted(present.intersection(rule.triggers_sku))),
                ))


def _check_price_book(library: AssemblyLibrary, price_book_units: Mapping[str, str], draft: _Draft) -> None:
    """A library line the live price book lacks, or prices in another unit, would be
    priced with a meaningless formula: it becomes work quoted by hand."""
    expected = {sku: unit for sku, (unit, _) in referenced_skus(library).items()}
    kept: list[ExpandedLine] = []
    for line in draft.lines:
        unit = expected.get(line.sku, "")
        actual = price_book_units.get(line.sku)
        if line.origin == "extra" or (actual is not None and (not unit or actual == unit)):
            kept.append(line)
            continue
        problem = "non disponibile nel listino" if actual is None else f"con unità {actual} invece di {unit}"
        logger.warning(
            "[Expansion] Library line out of sync with the live price book.",
            extra={"sku": line.sku, "expected_unit": unit, "actual_unit": actual},
        )
        draft.warnings.append(ExpansionWarning(
            "price_book_mismatch", f"Voce {line.sku} {problem}: da quotare a mano", (line.sku,),
        ))
        draft.add_manual(f"{line.note or line.sku} (voce {line.sku} {problem})", "price_book")
    draft.lines = kept


def expand(
    analysis: InsightAnalysis,
    library: AssemblyLibrary,
    price_book_units: Mapping[str, str],
    measures: Mapping[str, Decimal],
) -> Expansion:
    """The quote lines of a spec, computed from the library formulas.

    Fixed order: packages → element choices → extra lines → dependency rules →
    live price-book check → requests outside the price book."""
    draft = _Draft()
    conflicts = conflicting_measures(analysis)
    for name, values in conflicts.items():
        draft.warnings.append(ExpansionWarning(
            "admin_check", f"Valori diversi per {name} ({_values_text(values)}): forse stanze diverse, misura non usata",
        ))
    by_id = {assembly.id: assembly for assembly in library.assemblies}
    chosen: list[Assembly] = []
    times = [choice.assembly_id for choice in analysis.packages]
    for assembly_id, conditions in _merged_choices(analysis.packages).items():
        assembly = by_id.get(assembly_id)
        if assembly is None:
            draft.warnings.append(ExpansionWarning("unknown_package", f"Pacchetto sconosciuto ignorato: {assembly_id}"))
            continue
        if times.count(assembly_id) > 1:
            draft.warnings.append(ExpansionWarning(
                "admin_check", f"{assembly.name} scelto più volte: calcolato una volta sola, verificare se le stanze sono più di una",
            ))
        chosen.append(assembly)
        _expand_package(assembly, conditions, measures, draft)
    covered = {line.sku for line in draft.lines}
    actions = _requested_actions(analysis)
    _flag_shared_choices(chosen, actions, draft)
    _apply_elements(_decide_elements(chosen, actions, draft), draft)
    _add_extras(analysis.suggestions, covered, price_book_units, draft)
    _apply_rules(library, measures, draft)
    _check_price_book(library, price_book_units, draft)
    for request in analysis.unmapped_work_requests:
        if request.strip():
            draft.add_manual(request.strip(), "client_request")
    return replace(draft.freeze(), conflicts=conflicts)


# ── Stored spec ───────────────────────────────────────────────────────────────


def spec_from_analysis(
    analysis: InsightAnalysis, measures: Mapping[str, Decimal], *, library_version: str, now: datetime
) -> RoomInterventionSpec:
    """The spec to store on the room: what `expand` read from the analysis.

    `measures` are the ones the expansion used (`resolve_measures`): each keeps the
    model's source, or "brief" when it came from the room brief. Packages are merged
    like `expand` merges them, and only kept or reused elements are stored."""
    from_model = _spec_measures(analysis)
    return RoomInterventionSpec(
        measures=[
            StoredMeasure(
                name=name,
                value=float(value),
                source=from_model[name].source if name in from_model else "brief",
            )
            for name, value in measures.items()
        ],
        packages=[
            StoredPackage(assembly_id=assembly_id, conditions=sorted(conditions))
            for assembly_id, conditions in _merged_choices(analysis.packages).items()
        ],
        element_choices=[
            StoredElementChoice(element=element, action=action)
            for element, action in _requested_actions(analysis).items()
            if action != "replace"
        ],
        extra_items=[StoredExtraItem(sku=item.sku, qty=item.qty) for item in analysis.suggestions],
        unmapped_work_requests=[r.strip() for r in analysis.unmapped_work_requests if r.strip()],
        library_version=library_version,
        generated_at=now,
    )
