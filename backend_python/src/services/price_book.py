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
* A save cannot remove, rename or change the unit of a SKU the assembly
  library uses (src/services/assembly_library.py).
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
from src.services.assembly_library import check_against_price_book, load_library, referenced_skus

logger = logging.getLogger(__name__)

COLLECTION = "app_config"
DOCUMENT = "price_book"
HISTORY = "history"

_DATA = Path(__file__).resolve().parent.parent / "data"
_SEED_PATH = _DATA / "master_price_book.json"


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

    Another tool (the old Streamlit editor, removed in Phase 128) wrote this document
    with no version and no validation (NaN, `tags: None`...); a stale copy may exist. A document that is not
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


def assembly_skus() -> frozenset[str]:
    """SKUs the assembly library uses (package phases and dependency rules).
    Empty when the library cannot be loaded (load_library logs why)."""
    library = load_library()
    return frozenset(referenced_skus(library)) if library is not None else frozenset()


def check_assembly_skus(before: list[dict[str, Any]], after: list[dict[str, Any]]) -> None:
    """Refuse a save that removes (or renames) a SKU the assembly library uses,
    or changes its unit: the prompt would then contradict the price book and
    Gemini's lines would be dropped or mispriced. Problems the price book
    already had are not blamed on this save."""
    library = load_library()
    if library is None:
        return
    already = {p.sku for p in check_against_price_book(library, before)}
    introduced = sorted({p.sku for p in check_against_price_book(library, after)} - already)
    if introduced:
        raise PriceBookSkuInUseError(introduced)


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
        check_assembly_skus(current.items, new_items)
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
