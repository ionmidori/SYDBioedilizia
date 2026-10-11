"""
Price book storage — Firestore is the source of truth, the bundled JSON is the seed.

    app_config/price_book                 {items, version, updated_at, updated_by, item_count}
    app_config/price_book/history/{v}     {items, version, actor_uid, reason, added, removed, changed, created_at}

* No document yet → the seed (`src/data/master_price_book.json`, version 0) is
  served and the first save creates version 1.
* A save needs the version the editor read (`If-Match`): a concurrent edit
  ends in 409, never in a silent overwrite.
* Every version is kept in `history` (who, when, why, how many lines changed)
  so a bad edit can be traced and restored.
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

from src.core.exceptions import PriceBookConflictError
from src.schemas.price_book import PriceBookItem

logger = logging.getLogger(__name__)

COLLECTION = "app_config"
DOCUMENT = "price_book"
HISTORY = "history"

_SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "master_price_book.json"


@dataclass(frozen=True)
class PriceBookState:
    items: list[dict[str, Any]]
    version: int
    source: Literal["firestore", "seed"]
    updated_at: datetime | None = None
    updated_by: str | None = None


@dataclass(frozen=True)
class SaveResult:
    version: int
    item_count: int
    added: int
    removed: int
    changed: int
    items: list[dict[str, Any]]


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


def _state_from(data: dict[str, Any] | None) -> PriceBookState:
    if not data or not isinstance(data.get("items"), list):
        return PriceBookState(items=seed_items(), version=0, source="seed")
    return PriceBookState(
        items=list(data["items"]),
        version=int(data.get("version") or 0),
        source="firestore",
        updated_at=data.get("updated_at"),
        updated_by=data.get("updated_by"),
    )


async def read_state(db: Any) -> PriceBookState:
    snap = await _price_book_ref(db).get()
    return _state_from(snap.to_dict() if snap.exists else None)


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
            history_ref(db).document(str(version)),
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
        return SaveResult(version, len(new_items), added, removed, changed, new_items)

    return await _transact(db, body)
