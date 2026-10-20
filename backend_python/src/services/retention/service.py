"""RetentionService — erase what has outlived its retention period.

The last phase of the GDPR lifecycle pass (account_lifecycle_service.py), under
the same lifecycle lease. Each project is erased completely — Firestore trees
and Storage, by the same code as a user erasure (erasure/project_purge.py) —
and a quote that reached the client always stays under legal hold:

  guest sessions   `sessions.expireAt` has passed: the 30-day guest retention
                   (src/db/session_retention.py). A session whose owner turns
                   out to be a REGISTERED account is never erased; its stale
                   guest expiry is removed instead.
  binned projects  soft-deleted (`is_deleted`) more than 30 days ago.
  expired holds    sent quotes past their 10 years (erasure/legal_hold.py).
  orphans          what is left of a project whose session no longer exists:
                   the Firestore TTL never cascades, and older code deleted
                   sessions alone. Erased only after 30 days without a single
                   write (a guest can upload before the first message creates
                   the session), and never when the projection names a
                   registered account — unless the project was binned.

Until RETENTION_PURGE_ENABLED is set a run is a dry run: it counts what it
would erase (shown in /admin) and writes nothing, so the first real purge
comes after the numbers were checked.

Bounded: at most `limit` items and `budget_seconds` per run (Cloud Run ends
the request at 300 s, the lifecycle phases run first). The rest waits for the
next run, and the report says `truncated`.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from enum import StrEnum
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter

from src.auth.user_lookup import AccountKind, account_kind
from src.core.config import settings
from src.db.firebase_client import get_async_firestore_client, get_storage_client
from src.db.purge import iter_tree, storage_folder_ids
from src.db.session_retention import GUEST_SESSION_TTL, clear_session_expiry
from src.db.storage_paths import PROJECT_STORAGE_ROOTS, is_safe_id, project_storage_prefixes
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event
from src.services.erasure.legal_hold import HoldRecord, expired_holds, held_project_ids, release_hold
from src.services.erasure.project_purge import purge_project
from src.services.retention.models import RetentionReport
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

BIN_RETENTION = timedelta(days=30)
ORPHAN_GRACE = GUEST_SESSION_TTL
RUN_BUDGET_SECONDS = 150.0
RUN_LIMIT = 300

_GUEST_OWNER_PREFIX = "guest_"
_OWNER_KEYS = ("userId", "user_id", "uid")  # the legacy spellings too (erasure/discovery.py)


class _Verdict(StrEnum):
    ERASE = "erase"
    REGISTERED = "registered"  # belongs to a live registered account: not ours to erase
    WAIT = "wait"              # written to recently (or nothing left): look again next run


def _blob_times(bucket: Any, prefix: str) -> list[datetime]:
    return [blob.updated for blob in bucket.list_blobs(prefix=prefix) if blob.updated is not None]


class RetentionService:
    def __init__(
        self,
        *,
        db: Any,
        bucket: Any,
        account_kind: Callable[[str], Awaitable[AccountKind]],
        apply: bool,
        now: Callable[[], datetime] = utc_now,
        monotonic: Callable[[], float] = time.monotonic,
        budget_seconds: float = RUN_BUDGET_SECONDS,
        limit: int = RUN_LIMIT,
    ) -> None:
        self._db = db
        self._bucket = bucket
        self._account_kind = account_kind
        self._apply = apply
        self._now = now
        self._monotonic = monotonic
        self._budget_seconds = budget_seconds
        self._limit = limit
        # Per-run state, reset by run().
        self._at = utc_now()
        self._deadline = 0.0
        self._handled = 0
        self._kinds: dict[str, AccountKind] = {}

    async def run(self) -> RetentionReport:
        """One bounded pass over the four categories. Failures are reported in
        `errors`; one never stops the others."""
        report = RetentionReport(applied=self._apply)
        self._at = self._now()
        self._deadline = self._monotonic() + self._budget_seconds
        self._handled = 0
        self._kinds = {}
        phases = (
            ("guest_session", self._guest_sessions),
            ("deleted_project", self._binned_projects),
            ("expired_hold", self._expired_holds),
            ("orphan", self._orphans),
        )
        for category, phase in phases:
            if report.truncated:
                break
            try:
                await phase(report)
            except Exception as exc:
                logger.error("[Retention] Phase failed", extra={"category": category}, exc_info=True)
                report.errors.append(f"retention:{category}:{type(exc).__name__}")
        logger.info("[Retention] Run complete", extra={"report": report})
        self._audit(report)
        return report

    # ── Budget ────────────────────────────────────────────────────────────────

    def _take(self, report: RetentionReport) -> bool:
        """Claim one item of the run's budget; False (and `truncated`) when spent."""
        if self._handled >= self._limit or self._monotonic() >= self._deadline:
            report.truncated = True
            return False
        self._handled += 1
        return True

    async def _attempt(self, report: RetentionReport, category: str, project_id: str, work: Awaitable[None]) -> None:
        """Run one item; a failure is logged and reported, never raised — the
        item is still there for the next run."""
        try:
            await work
        except Exception as exc:
            logger.error(
                "[Retention] Could not erase; retried next run",
                extra={"category": category, "project_id": project_id, "error_type": type(exc).__name__},
                exc_info=True,
            )
            report.errors.append(f"retention:{category}:{type(exc).__name__}")

    # ── Phases ────────────────────────────────────────────────────────────────

    async def _guest_sessions(self, report: RetentionReport) -> None:
        query = (
            self._db.collection("sessions")
            .where(filter=FieldFilter("expireAt", "<=", self._at))
            .select(["userId", "is_deleted"])
        )
        expired = [snap async for snap in query.stream()]  # read first: the erasures are slow
        for snap in expired:
            data = snap.to_dict() or {}
            if data.get("is_deleted") is True:
                continue  # binned: the bin's own 30 days apply (older soft deletes stamped an expiry too)
            if not self._take(report):
                return
            await self._attempt(report, "guest_session", snap.id, self._expire_guest(snap.id, data.get("userId"), report))

    async def _expire_guest(self, project_id: str, owner: Any, report: RetentionReport) -> None:
        if await self._is_registered(owner):
            if self._apply:
                await clear_session_expiry(self._db, project_id)
            report.made_permanent += 1
        else:
            await self._erase(project_id)
            report.guest_sessions += 1

    async def _binned_projects(self, report: RetentionReport) -> None:
        cutoff = self._at - BIN_RETENTION
        query = self._db.collection("sessions").where(filter=FieldFilter("is_deleted", "==", True))
        binned = [snap async for snap in query.select(["deleted_at"]).stream()]
        for snap in binned:
            deleted_at = (snap.to_dict() or {}).get("deleted_at")
            if not isinstance(deleted_at, datetime) or deleted_at > cutoff:
                continue  # still recoverable (or undated: never guessed)
            if not self._take(report):
                return
            await self._attempt(report, "deleted_project", snap.id, self._erase_binned(snap.id, report))

    async def _erase_binned(self, project_id: str, report: RetentionReport) -> None:
        await self._erase(project_id)
        report.deleted_projects += 1

    async def _expired_holds(self, report: RetentionReport) -> None:
        for hold in await expired_holds(self._db, now=self._at, limit=self._limit):
            if not self._take(report):
                return
            await self._attempt(report, "expired_hold", hold.project_id, self._release(hold, report))

    async def _release(self, hold: HoldRecord, report: RetentionReport) -> None:
        if self._apply:
            await release_hold(self._db, self._bucket, hold)
        report.expired_holds += 1

    async def _orphans(self, report: RetentionReport) -> None:
        for project_id in await self._orphan_ids():
            if not self._take(report):
                return
            await self._attempt(report, "orphan", project_id, self._settle_orphan(project_id, report))

    async def _settle_orphan(self, project_id: str, report: RetentionReport) -> None:
        verdict = await self._orphan_verdict(project_id)
        if verdict is _Verdict.REGISTERED:
            report.orphans_kept += 1
        elif verdict is _Verdict.ERASE:
            await self._erase(project_id)
            report.orphans += 1

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _erase(self, project_id: str) -> None:
        if self._apply:
            await purge_project(self._db, self._bucket, project_id, now=self._at)

    async def _is_registered(self, owner: Any) -> bool:
        """Whether `owner` is a live registered account. Guest placeholders,
        anonymous and deleted accounts are not; a failed lookup raises."""
        if not isinstance(owner, str) or not owner or owner.startswith(_GUEST_OWNER_PREFIX):
            return False
        if owner not in self._kinds:
            self._kinds[owner] = await self._account_kind(owner)
        return self._kinds[owner] is AccountKind.REGISTERED

    async def _orphan_ids(self) -> list[str]:
        """Ids with remains (Firestore or Storage) but no session document."""
        sessions = self._db.collection("sessions")
        projects = self._db.collection("projects")
        live = {snap.id async for snap in sessions.select([]).stream()}
        session_remains = {ref.id async for ref in sessions.list_documents()} - live
        projections = {snap.id async for snap in projects.select([]).stream()}
        project_remains = {ref.id async for ref in projects.list_documents()}
        stored: set[str] = set()
        for root in PROJECT_STORAGE_ROOTS:
            stored |= await storage_folder_ids(self._bucket, root)

        candidates = (session_remains | project_remains | stored) - live
        # A legal hold keeps the quote (under the deleted projection) and its
        # PDFs on purpose: only something else left beside them is an orphan.
        held = await held_project_ids(self._db)
        candidates = {pid for pid in candidates if pid not in held or pid in session_remains or pid in projections}
        malformed = {pid for pid in candidates if not is_safe_id(pid)}
        if malformed:
            logger.warning("[Retention] Ignoring remains with a malformed id", extra={"count": len(malformed)})
        return sorted(candidates - malformed)

    async def _orphan_verdict(self, project_id: str) -> _Verdict:
        projection = await self._db.collection("projects").document(project_id).get()
        data = (projection.to_dict() or {}) if projection.exists else {}
        if data.get("is_deleted") is not True:
            for key in _OWNER_KEYS:
                if await self._is_registered(data.get(key)):
                    return _Verdict.REGISTERED
        last_write = await self._last_write(project_id)
        if last_write is None or last_write > self._at - ORPHAN_GRACE:
            return _Verdict.WAIT
        return _Verdict.ERASE

    async def _last_write(self, project_id: str) -> datetime | None:
        """The newest write among everything left of the project."""
        times: list[datetime] = []
        for collection in ("sessions", "projects"):
            ref = self._db.collection(collection).document(project_id)
            snap = await ref.get()
            if snap.exists:
                times.append(snap.update_time)
            times += [doc.update_time async for doc in iter_tree(ref)]
        for prefix in project_storage_prefixes(project_id):
            times += await asyncio.to_thread(_blob_times, self._bucket, prefix)
        return max((t for t in times if t is not None), default=None)

    def _audit(self, report: RetentionReport) -> None:
        emit_audit_event(
            AuditAction.RETENTION_CLEANUP,
            AuditResourceType.SYSTEM,
            "retention",
            status="success" if not report.errors else "partial_errors",
            metadata={
                "applied": report.applied,
                "guest_sessions": report.guest_sessions,
                "deleted_projects": report.deleted_projects,
                "expired_holds": report.expired_holds,
                "orphans": report.orphans,
                "orphans_kept": report.orphans_kept,
                "made_permanent": report.made_permanent,
                "truncated": report.truncated,
                "errors": len(report.errors),
            },
        )


def get_retention_service() -> RetentionService:
    return RetentionService(
        db=get_async_firestore_client(),
        bucket=get_storage_client(),
        account_kind=account_kind,
        apply=settings.RETENTION_PURGE_ENABLED,
    )
