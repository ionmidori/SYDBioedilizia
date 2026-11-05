"""
Assembly library service: load renovation_assemblies.json once and check it
against a price book (the bundled seed in CI, the live Firestore one at runtime).

Used by the InsightEngine prompt, the price-book save guard, the live
price-book refresh and the admin price-book response.
"""
from __future__ import annotations

import json
import logging
from collections.abc import Mapping, Sequence
from pathlib import Path

from pydantic import ValidationError

from src.schemas.assembly_library import AssemblyLibrary, AssemblyProblem

logger = logging.getLogger(__name__)

LIBRARY_PATH = Path(__file__).resolve().parent.parent / "data" / "renovation_assemblies.json"
RULES = "dependency_rules"

_cache: AssemblyLibrary | None = None
_loaded = False


def load_library() -> AssemblyLibrary | None:
    """The validated library, read once; None (logged) when it cannot be read or is invalid."""
    global _cache, _loaded
    if not _loaded:
        try:
            _cache = AssemblyLibrary.model_validate(json.loads(LIBRARY_PATH.read_text(encoding="utf-8")))
        except (OSError, ValueError, ValidationError):
            # ValidationError is a ValueError; listed for the reader.
            logger.exception("[AssemblyLibrary] The assembly library could not be loaded.")
            _cache = None
        _loaded = True
    return _cache


def reset_library_cache() -> None:
    global _cache, _loaded
    _cache, _loaded = None, False


def referenced_skus(library: AssemblyLibrary) -> dict[str, tuple[str, set[str]]]:
    """SKU -> (unit the library expects, package ids or 'dependency_rules' using it).

    A SKU only a rule names has unit '' and is checked for existence only.
    """
    found: dict[str, tuple[str, set[str]]] = {}
    for assembly in library.assemblies:
        for phase in assembly.phases:
            for item in phase.skus:
                unit, users = found.setdefault(item.sku, (item.unit, set()))
                users.add(assembly.id)
    for rule in library.dependency_rules:
        for sku in (*rule.triggers_sku, *rule.requires_sku, *rule.excludes_sku):
            unit, users = found.setdefault(sku, ("", set()))
            users.add(RULES)
    return found


def check_against_price_book(
    library: AssemblyLibrary, items: Sequence[Mapping[str, object]]
) -> list[AssemblyProblem]:
    """The library SKUs a price book lacks, or prices in a different unit (sorted by SKU)."""
    units = {str(item.get("sku")): item.get("unit") for item in items}
    problems: list[AssemblyProblem] = []
    for sku, (expected, users) in sorted(referenced_skus(library).items()):
        if sku not in units:
            problems.append(AssemblyProblem(sku=sku, kind="missing", assemblies=sorted(users), expected_unit=expected))
        elif expected and units[sku] != expected:
            actual = units[sku]
            problems.append(AssemblyProblem(
                sku=sku, kind="unit_changed", assemblies=sorted(users),
                expected_unit=expected, actual_unit=actual if isinstance(actual, str) else None,
            ))
    return problems
