"""Line-item diff between two versions of a quote (admin edits, AI revisions)."""
from __future__ import annotations

from typing import Any

from src.schemas.quote import RevisionChange


def _summary(item: dict[str, Any]) -> dict[str, Any]:
    return {k: item.get(k) for k in ("description", "unit", "qty", "unit_price", "total")}


def diff_items(before: list[dict[str, Any]], after: list[dict[str, Any]]) -> list[RevisionChange]:
    """Line-item diff, matched by room and SKU (positionally among lines with the
    same room and SKU): the same SKU in two rooms is two different lines, and a
    line moved to another room is removed from one and added to the other."""
    changes: list[RevisionChange] = []
    remaining: dict[tuple[str | None, str], list[dict[str, Any]]] = {}
    for item in before:
        remaining.setdefault((item.get("room_id"), str(item.get("sku"))), []).append(item)
    for item in after:
        room_id, sku = key = (item.get("room_id"), str(item.get("sku")))
        pool = remaining.get(key) or []
        if not pool:
            changes.append(RevisionChange(change="added", sku=sku, room_id=room_id, after=_summary(item)))
            continue
        old = pool.pop(0)
        if _summary(old) != _summary(item):
            changes.append(RevisionChange(
                change="changed", sku=sku, room_id=room_id, before=_summary(old), after=_summary(item)
            ))
    for (room_id, sku), pool in remaining.items():
        changes.extend(
            RevisionChange(change="removed", sku=sku, room_id=room_id, before=_summary(old)) for old in pool
        )
    return changes
