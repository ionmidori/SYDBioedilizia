"""
Phase 128 / Fase 2 — PRV number and dossier for quotes created before them.
Logic and rules: src/services/quote_backfill.py.

Usage (dry run by default — prints the plan, writes nothing):
    cd backend_python && uv run python scripts/backfill_quote_dossier.py
    cd backend_python && uv run python scripts/backfill_quote_dossier.py --apply
    cd backend_python && uv run python scripts/backfill_quote_dossier.py --undo

The report prints project ids and booleans only (no names or emails).
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from src.db.firebase_client import get_async_firestore_client  # noqa: E402
from src.services.quote_backfill import apply_all, plan_all, undo_all  # noqa: E402


def _print_plan(plans) -> None:
    print(f"{'project':40} {'action':9} {'numero':14} {'email':5} {'media':5} {'rev':3} campi / problemi")
    for p in plans:
        number = p.quote_number or ("(nuovo)" if p.needs_number and p.action == "backfill" else "-")
        detail = ", ".join(p.issues[:4]) if p.issues else ", ".join(sorted(p.updates))
        print(
            f"{p.project_id[:40]:40} {p.action:9} {number:14} {('si' if p.has_email else 'no'):5} "
            f"{p.media_count:<5} {('si' if p.needs_revision else '-'):3} {detail}"
        )
    counts: dict[str, int] = {}
    for p in plans:
        counts[p.action] = counts.get(p.action, 0) + 1
    print("\n" + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))


async def _main(mode: str) -> None:
    db = get_async_firestore_client()
    if mode == "undo":
        print(f"UNDO: {await undo_all(db)} preventivi ripristinati")
        return
    plans = await plan_all(db)
    _print_plan(plans)
    if mode == "apply":
        for project_id, number in await apply_all(db, plans):
            print(f"applicato {project_id[:40]:40} -> {number}")
        print("APPLIED")
    else:
        print("DRY RUN (nothing written)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--apply", action="store_true", help="write the backfill")
    group.add_argument("--undo", action="store_true", help="revert a previous --apply")
    args = parser.parse_args()
    asyncio.run(_main("apply" if args.apply else "undo" if args.undo else "dry-run"))


if __name__ == "__main__":
    main()
