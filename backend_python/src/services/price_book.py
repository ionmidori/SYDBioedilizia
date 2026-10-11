"""
Price book storage — Firestore is the source of truth, the bundled JSON is the seed.

    app_config/price_book                 {items, version, updated_at, updated_by, item_count}
    app_config/price_book/history/{auto}  {items, version, actor_uid, reason, added, removed, changed, created_at}

* No document yet (or one that cannot be trusted) -> the seed
  (`src/data/master_price_book.json`, version 0) is served and the first save
  creates version 1.
* A save needs the version the editor read (`If-Match`): a concurrent edit
  ends in 409, never in a silent overwrite.
* Every version is kept in `history` (who, when, why, how many lines changed)
  so a bad edit can be traced. History entries have auto ids: a replaced or
  reset document can never overwrite an earlier entry.
* A save cannot remove a SKU that the assembly library points to.
"""
from __future__ import annotations

import copy
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from google.cloud.firestore_v1 import async_transactional
from pydantic import ValidationError

from src.core.exceptions import PriceBookConflictError, PriceBookSkuInUseError
from src.schemas.price_book import PriceBookItem

logger = logging.getLogger(__name__)

COLLECTION = "app_config"
DOCUMENT = "price_book"
HISTORY = "history"

_DATA = Path(__file__).resolve().parent.parent / "data"
_SEED_PATH = _DATA / "master_price_book.json"
_ASSEMBLIES_PATH = _DATA / "renovation_assemblies.json"


@dataclass(frozen=True)
class PriceBookState:
    items: list[dict[str, Any]]
    version: int
    source: Literal["firestore", "seed"]
    updated_at: datetime | None = None
    updated_by: str | None = None
    # Why the stored document was not used (then `items` is the seed, version 0).
    problem: Literal["legacy_document", "invalid_items"] | None = None


@dataclass(frozen=True)
class SaveResult:
    version: int
    item_count: int
    added: int
    removed: int
    changed: int
    items: list[dict[str, Any]]
    updated_at: datetime


_seed_cache: list[dict[str, Any]] | None = None


def seed_items() -> list[dict[str, Any]]:
    """The bundled price book (a copy: callers may mutate it)."""
    global _seed_cache
    cached = _seed_cache
    if cached is None:
        try:
            cached = json.loads(_SEED_PATH.read_text(encoding="utf-8"))["items"]
        except (OSError, ValueError, KeyError):
            logger.exception("[PriceBook] The bundled price book could not be read.")
            cached = []
        _seed_cache = cached
    return copy.deepcopy(cached)


def _price_book_ref(db: Any) -> Any:
    return db.collection(COLLECTION).document(DOCUMENT)


def history_ref(db: Any) -> Any:
    return _price_book_ref(db).collection(HISTORY)


def _seed_state(problem: Literal["legacy_document", "invalid_items"] | None = None) -> PriceBookState:
    return PriceBookState(items=seed_items(), version=0, source="seed", problem=problem)


def _state_from(data: dict[str, Any] | None) -> PriceBookState:
    """The stored price book, or the seed when there is none or it cannot be trusted.

    Other tools (the legacy Streamlit editor) wrote this document with no
    version and no validation (NaN, `tags: None`...). A document that is not
    exactly what `save` writes is ignored and logged, never served to the AI.
    """
    if not data:
        return _seed_state()
    items, version = data.get("items"), data.get("version")
    if not isinstance(items, list) or isinstance(version, bool) or not isinstance(version, int) or version < 1:
        logger.warning("[PriceBook] Ignoring a price book document without a valid version (written by another tool?).")
        return _seed_state("legacy_document")
    try:
        validated = [PriceBookItem(**item).model_dump(exclude_none=True) for item in items]
    except (ValidationError, TypeError):
        logger.warning("[PriceBook] Ignoring a price book document with invalid items (version %s).", version)
        return _seed_state("invalid_items")
    return PriceBookState(
        items=validated,
        version=version,
        source="firestore",
        updated_at=data.get("updated_at"),
        updated_by=data.get("updated_by"),
    )


async def read_state(db: Any) -> PriceBookState:
    snap = await _price_book_ref(db).get()
    return _state_from(snap.to_dict() if snap.exists else None)


_assembly_skus_cache: frozenset[str] | None = None


def assembly_skus() -> frozenset[str]:
    """SKUs the assembly library tells the AI to use (renovation_assemblies.json)."""
    global _assembly_skus_cache
    cached = _assembly_skus_cache
    if cached is None:
        found: set[str] = set()

        def walk(node: Any) -> None:
            if isinstance(node, dict):
                for key, value in node.items():
                    if key == "sku" and isinstance(value, str):
                        found.add(value)
                    else:
                        walk(value)
            elif isinstance(node, list):
                for value in node:
                    walk(value)

        try:
            walk(json.loads(_ASSEMBLIES_PATH.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            logger.exception("[PriceBook] The assembly library could not be read.")
        cached = _assembly_skus_cache = frozenset(found)
    return cached


def check_removed_skus(before: list[dict[str, Any]], after: list[dict[str, Any]]) -> None:
    """Refuse to drop a SKU the assembly library still points to (the prompt
    would then contradict itself and Gemini's lines would be dropped)."""
    removed = {i["sku"] for i in before} - {i["sku"] for i in after}
    in_use = sorted(removed & assembly_skus())
    if in_use:
        raise PriceBookSkuInUseError(in_use)


def diff_counts(before: list[dict[str, Any]], after: list[dict[str, Any]]) -> tuple[int, int, int]:
    """(added, removed, changed) lines, matched by SKU."""
    old = {i["sku"]: i for i in before}
    new = {i["sku"]: i for i in after}
    added = len(new.keys() - old.keys())
    removed = len(old.keys() - new.keys())
    changed = sum(1 for sku in new.keys() & old.keys() if new[sku] != old[sku])
    return added, removed, changed


def dump_items(items: list[PriceBookItem]) -> list[dict[str, Any]]:
    """Storage form: optional fields that are unset are left out."""
    return [item.model_dump(exclude_none=True) for item in items]


async def _transact(db: Any, body: Any) -> Any:
    @async_transactional
    async def _txn(transaction: Any) -> Any:
        return await body(transaction)

    return await _txn(db.transaction())


async def save(
    db: Any,
    items: list[PriceBookItem],
    expected_version: int,
    actor_uid: str,
    now: datetime,
    reason: str | None = None,
) -> SaveResult:
    """Replace the price book if (and only if) it is still at `expected_version`."""
    new_items = dump_items(items)

    async def body(transaction: Any) -> SaveResult:
        ref = _price_book_ref(db)
        snap = await ref.get(transaction=transaction)
        current = _state_from(snap.to_dict() if snap.exists else None)
        if current.version != expected_version:
            raise PriceBookConflictError(expected_version, current.version)
        check_removed_skus(current.items, new_items)
        added, removed, changed = diff_counts(current.items, new_items)
        version = current.version + 1
        transaction.set(
            ref,
            {
                "items": new_items,
                "version": version,
                "item_count": len(new_items),
                "updated_at": now,
                "updated_by": actor_uid,
            },
        )
        transaction.set(
            history_ref(db).document(),  # auto id: an entry can never be overwritten
            {
                "version": version,
                "items": new_items,
                "item_count": len(new_items),
                "actor_uid": actor_uid,
                "reason": reason,
                "added": added,
                "removed": removed,
                "changed": changed,
                "created_at": now,
            },
        )
        return SaveResult(version, len(new_items), added, removed, changed, new_items, now)

    return await _transact(db, body)
