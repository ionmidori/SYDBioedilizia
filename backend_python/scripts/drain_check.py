#!/usr/bin/env python
"""
Phase 3 Canary Rollout Utility - Drain Check Script
Usage: cd backend_python && python scripts/drain_check.py [--dry-run] [--ttl-hours 72] [--expire]
"""
import sys
import os
import asyncio
import argparse
import logging

# Add parent dir to path so imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.adk.drain import drain_inflight_quotes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s — %(levelname)s — %(message)s"
)
logger = logging.getLogger(__name__)


async def main():
    parser = argparse.ArgumentParser(
        description="Check and manage LangGraph HITL sessions before ADK canary cutover"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Dry-run mode (default: True). Set --expire to actually soft-delete stale sessions."
    )
    parser.add_argument(
        "--expire",
        action="store_true",
        help="DANGEROUS: Expire stale sessions (dry_run=False). Requires confirmation."
    )
    parser.add_argument(
        "--ttl-hours",
        type=int,
        default=72,
        help="Session TTL in hours (default: 72). Sessions older than this are considered stale."
    )

    args = parser.parse_args()

    dry_run = not args.expire
    if args.expire:
        # Ask for confirmation
        confirm = input(
            "⚠️  You are about to EXPIRE stale LangGraph sessions. This action soft-deletes checkpoints.\n"
            "   Type 'yes' to confirm: "
        )
        if confirm.lower() != "yes":
            logger.info("Operation cancelled.")
            return

    logger.info(
        f"Starting drain check (dry_run={dry_run}, ttl_hours={args.ttl_hours})..."
    )

    report = await drain_inflight_quotes(
        ttl_hours=args.ttl_hours,
        dry_run=dry_run
    )

    # Print report
    print("\n" + "=" * 70)
    print("LANGGRAPH HITL SESSION DRAIN REPORT")
    print("=" * 70)
    print(f"\n[ACTIVE] Active Sessions (awaiting admin review): {len(report['active_sessions'])}")
    if report["active_sessions"]:
        for sid in report["active_sessions"][:10]:  # Show first 10
            print(f"   - {sid}")
        if len(report["active_sessions"]) > 10:
            print(f"   ... and {len(report['active_sessions']) - 10} more")

    print(f"\n[STALE] Stale Sessions (expired): {len(report['stale_sessions'])}")
    if report["stale_sessions"]:
        for sid in report["stale_sessions"][:10]:
            print(f"   - {sid}")
        if len(report["stale_sessions"]) > 10:
            print(f"   ... and {len(report['stale_sessions']) - 10} more")

    print(f"\n[DONE] Finalized Sessions (past admin_review): {len(report['already_finalized'])}")

    print(f"\n[ERROR] Errors: {len(report['errors'])}")
    if report["errors"]:
        for err in report["errors"][:5]:
            print(f"   - {err}")
        if len(report["errors"]) > 5:
            print(f"   ... and {len(report['errors']) - 5} more")

    print("\n" + "=" * 70)

    # Canary readiness check
    if report["active_sessions"]:
        logger.warning(
            f"WARNING: {len(report['active_sessions'])} active HITL sessions still in progress. "
            "Recommend waiting for them to complete before setting ADK_CANARY_PERCENT > 0."
        )
    else:
        logger.info(
            "SUCCESS: NO active HITL sessions. Safe to proceed with canary rollout."
        )

    if not dry_run:
        logger.info(
            f"SUCCESS: Expired {len(report['stale_sessions'])} stale sessions. "
            "Soft-delete preserved audit trail."
        )


if __name__ == "__main__":
    asyncio.run(main())
