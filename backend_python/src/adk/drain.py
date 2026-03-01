"""
Phase 3 Canary: LangGraph In-Flight Session Drain Utility.

Before increasing ADK_CANARY_PERCENT to 100%, all LangGraph sessions that
are suspended at interrupt_before["admin_review"] must be completed or expired.

This module provides:
  - drain_inflight_quotes(): log / enumerate pending LangGraph HITL sessions
  - expire_stale_checkpoints(): soft-delete checkpoints older than TTL

Usage (one-shot before cutover):
    from src.adk.drain import drain_inflight_quotes
    report = await drain_inflight_quotes()

Collection layout (FirestoreSaver):
    langgraph_checkpoints/{thread_id}  → checkpoint documents
    langgraph_writes/{thread_id}       → write documents

We read from langgraph_checkpoints to find sessions stuck in QUOTE phase.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import TypedDict

from google.cloud import firestore

logger = logging.getLogger(__name__)

_CHECKPOINTS_COLLECTION = "langgraph_checkpoints"
_DEFAULT_TTL_HOURS = 72  # Sessions older than this are considered stale


class DrainReport(TypedDict):
    active_sessions: list[str]       # session_ids still in HITL state
    stale_sessions: list[str]        # session_ids expired / soft-deleted
    already_finalized: list[str]     # session_ids past admin_review
    errors: list[str]


async def drain_inflight_quotes(
    ttl_hours: int = _DEFAULT_TTL_HOURS,
    dry_run: bool = True,
) -> DrainReport:
    """
    Enumerates LangGraph quote checkpoints in Firestore and classifies them.

    Args:
        ttl_hours: Sessions older than this (in hours) are considered stale.
        dry_run: If True, only log without modifying Firestore.
                 Set to False during actual Phase 3 cutover.

    Returns:
        DrainReport with categorized session lists.
    """
    db = firestore.AsyncClient()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=ttl_hours)

    report: DrainReport = {
        "active_sessions": [],
        "stale_sessions": [],
        "already_finalized": [],
        "errors": [],
    }

    try:
        docs = db.collection(_CHECKPOINTS_COLLECTION).stream()
        async for doc in docs:
            thread_id = doc.id
            try:
                data = doc.to_dict() or {}
                ts = data.get("ts") or data.get("created_at")
                checkpoint = data.get("checkpoint", {})

                # Determine phase from checkpoint channel_values
                channel_values = checkpoint.get("channel_values", {})
                phase = channel_values.get("phase", "UNKNOWN")
                next_node = data.get("next", [])

                # Sessions waiting at admin_review interrupt
                if "admin_review" in next_node or phase == "QUOTE":
                    doc_time: datetime | None = None
                    if ts:
                        doc_time = ts if isinstance(ts, datetime) else None

                    if doc_time and doc_time.replace(tzinfo=timezone.utc) < cutoff:
                        report["stale_sessions"].append(thread_id)
                        if not dry_run:
                            await _soft_expire_checkpoint(db, thread_id)
                            logger.warning(
                                "Expired stale LangGraph HITL session",
                                extra={"thread_id": thread_id, "phase": phase},
                            )
                        else:
                            logger.info(
                                "[DryRun] Would expire stale session %s (phase=%s)",
                                thread_id, phase,
                            )
                    else:
                        report["active_sessions"].append(thread_id)
                        logger.info(
                            "Active LangGraph HITL session (must complete before ADK cutover)",
                            extra={"thread_id": thread_id, "phase": phase},
                        )
                else:
                    report["already_finalized"].append(thread_id)

            except Exception as e:
                msg = f"{thread_id}: {e}"
                report["errors"].append(msg)
                logger.error("Error processing checkpoint %s: %s", thread_id, e)

    except Exception as e:
        logger.error("Failed to stream langgraph_checkpoints: %s", e)
        report["errors"].append(f"stream_failed: {e}")

    logger.info(
        "LangGraph drain complete",
        extra={
            "active": len(report["active_sessions"]),
            "stale": len(report["stale_sessions"]),
            "finalized": len(report["already_finalized"]),
            "errors": len(report["errors"]),
            "dry_run": dry_run,
        },
    )
    return report


async def _soft_expire_checkpoint(db: firestore.AsyncClient, thread_id: str) -> None:
    """Mark checkpoint as expired without deleting (audit trail preserved)."""
    ref = db.collection(_CHECKPOINTS_COLLECTION).document(thread_id)
    await ref.update({
        "status": "expired",
        "expired_at": firestore.SERVER_TIMESTAMP,
    })
