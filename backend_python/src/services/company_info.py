"""
Company info storage — Firestore is the source of truth, the bundled JSON is the seed.

    app_config/company_info                 {info, version, updated_at, updated_by}
    app_config/company_info/history/{auto}  {info, version, actor_uid, reason, changed_parts, created_at}

* No document yet (or one that cannot be trusted) -> the seed
  (`src/data/company_info.seed.json`, version 0) is served and the first save
  creates version 1.
* A save needs the version the editor read (`If-Match`): a concurrent edit
  ends in 409, never in a silent overwrite.
* Every version is kept in `history` (who, when, why, which parts changed).
  History entries have auto ids: a replaced or reset document can never
  overwrite an earlier entry.
* The seed is validated when this module is imported: a broken seed stops the
  revision from starting (Cloud Run keeps the previous one), it is never served.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from google.cloud.firestore_v1 import async_transactional
from pydantic import ValidationError

from src.core.exceptions import CompanyInfoConflictError
from src.schemas.company_info import CompanyInfo

logger = logging.getLogger(__name__)

COLLECTION = "app_config"
DOCUMENT = "company_info"
HISTORY = "history"

_SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "company_info.seed.json"
_SEED = CompanyInfo.model_validate(json.loads(_SEED_PATH.read_text(encoding="utf-8"))["info"])

Problem = Literal["legacy_document", "invalid_info"]


@dataclass(frozen=True)
class CompanyInfoState:
    info: CompanyInfo
    version: int
    source: Literal["firestore", "seed"]
    updated_at: datetime | None = None
    updated_by: str | None = None
    # Why the stored document was not used (then `info` is the seed, version 0).
    problem: Problem | None = None


@dataclass(frozen=True)
class SaveResult:
    version: int
    info: CompanyInfo
    updated_at: datetime
    # Top-level fields of CompanyInfo that differ from the previous version, sorted.
    changed_parts: list[str]


def seed_info() -> CompanyInfo:
    """The bundled company info (a copy: callers may mutate it)."""
    return _SEED.model_copy(deep=True)


def _ref(db: Any) -> Any:
    return db.collection(COLLECTION).document(DOCUMENT)


def history_ref(db: Any) -> Any:
    return _ref(db).collection(HISTORY)


def _seed_state(problem: Problem | None = None) -> CompanyInfoState:
    return CompanyInfoState(info=seed_info(), version=0, source="seed", problem=problem)


def _state_from(data: dict[str, Any] | None) -> CompanyInfoState:
    """The stored company info, or the seed when there is none or it cannot be trusted."""
    if not data:
        return _seed_state()
    info, version = data.get("info"), data.get("version")
    if not isinstance(info, dict) or isinstance(version, bool) or not isinstance(version, int) or version < 1:
        logger.warning("[CompanyInfo] Ignoring a company info document without a valid version.")
        return _seed_state("legacy_document")
    try:
        validated = CompanyInfo.model_validate(info)
    except ValidationError:
        logger.warning("[CompanyInfo] Ignoring a company info document that fails the schema (version %s).", version)
        return _seed_state("invalid_info")
    return CompanyInfoState(
        info=validated,
        version=version,
        source="firestore",
        updated_at=data.get("updated_at"),
        updated_by=data.get("updated_by"),
    )


async def read_state(db: Any) -> CompanyInfoState:
    snap = await _ref(db).get()
    return _state_from(snap.to_dict() if snap.exists else None)


def changed_parts(before: CompanyInfo, after: CompanyInfo) -> list[str]:
    old, new = before.model_dump(), after.model_dump()
    return sorted(key for key in new if new[key] != old.get(key))


async def _transact(db: Any, body: Any) -> Any:
    @async_transactional
    async def _txn(transaction: Any) -> Any:
        return await body(transaction)

    return await _txn(db.transaction())


async def save(
    db: Any,
    info: CompanyInfo,
    expected_version: int,
    actor_uid: str,
    now: datetime,
    reason: str | None = None,
) -> SaveResult:
    """Replace the company info if (and only if) it is still at `expected_version`."""
    stored = info.model_dump(mode="json")

    async def body(transaction: Any) -> SaveResult:
        ref = _ref(db)
        snap = await ref.get(transaction=transaction)
        current = _state_from(snap.to_dict() if snap.exists else None)
        if current.version != expected_version:
            raise CompanyInfoConflictError(expected_version, current.version)
        parts = changed_parts(current.info, info)
        version = current.version + 1
        transaction.set(ref, {"info": stored, "version": version, "updated_at": now, "updated_by": actor_uid})
        transaction.set(
            history_ref(db).document(),  # auto id: an entry can never be overwritten
            {
                "version": version,
                "info": stored,
                "actor_uid": actor_uid,
                "reason": reason,
                "changed_parts": parts,
                "created_at": now,
            },
        )
        return SaveResult(version=version, info=info, updated_at=now, changed_parts=parts)

    return await _transact(db, body)
