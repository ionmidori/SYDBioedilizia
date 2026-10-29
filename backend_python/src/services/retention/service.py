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

The first three are fixed rules — what the Firestore TTL already deleted, now
done completely — and always apply. The orphan rule is a heuristic over
leftovers: until RETENTION_ORPHAN_PURGE_ENABLED is set it only counts (shown
in /admin), so its first real run comes after the numbers were checked.

Bounded: the caller passes the time left in its request (Cloud Run ends it at
300 s) and at most `limit` items are erased per run; what is left waits for the
next run and the report says `truncated`. The orphan scan lists every session
id once per run (a field-less projection): fine for a weekly job at this
scale, the first thing to revisit if it grows by orders of magnitude.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable, Sequence
from datetime import datetime, timedelta
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter

from src.auth.user_lookup import AccountKind, account_kind
from src.core.config import settings
from src.db.firebase_client import get_async_firestore_client, get_storage_client
from src.db.ownership import real_owners
from src.db.purge import find_chat_remains, iter_tree
from src.db.session_retention import EXPIRE_AT, GUEST_SESSION_TTL, clear_session_expiry
from src.db.storage_paths import is_safe_id, project_storage_prefixes
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event
from src.services.erasure.legal_hold import (
    HeldQuote,
    HoldRecord,
    expired_holds,
    find_held_quotes,
    held_project_ids,
    release_hold,
)
from src.services.erasure.project_purge import hold_sent_quotes, purge_project
from src.services.retention.models import RetentionReport
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

BIN_RETENTION = timedelta(days=30)
ORPHAN_GRACE = GUEST_SESSION_TTL
RUN_BUDGET_SECONDS = 150.0
RUN_LIMIT = 300


def _blob_times(bucket: Any, prefix: str, skip: frozenset[str]) -> list[datetime]:
    return [b.updated for b in bucket.list_blobs(prefix=prefix) if b.name not in skip and b.updated is not None]


class RetentionService:
    def __init__(
        self,
        *,
        db: Any,
        bucket: Any,
        account_kind: Callable[[str], Awaitable[AccountKind]],
        erase_orphans: bool,
        now: Callable[[], datetime] = utc_now,
        monotonic: Callable[[], float] = time.monotonic,
        limit: int = RUN_LIMIT,
    ) -> None:
        self._db = db
        self._bucket = bucket
        self._account_kind = account_kind
        self._erase_orphans = erase_orphans
        self._now = now
        self._monotonic = monotonic
        self._limit = limit
        # Per-run state, reset by run().
        self._at = utc_now()
        self._deadline = 0.0
        self._erased = 0
        self._kinds: dict[str, AccountKind] = {}

    async def run(self, *, budget_seconds: float = RUN_BUDGET_SECONDS) -> RetentionReport:
        """One bounded pass over the four categories, within `budget_seconds`.
        Failures are reported in `errors`; one never stops the others."""
        report = RetentionReport(orphans_applied=self._erase_orphans)
        self._at = self._now()
        self._deadline = self._monotonic() + budget_seconds
        self._erased = 0
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

    def _stop(self, report: RetentionReport) -> bool:
        """Out of time, or erased as much as one run may: stop (and say so).
        Only erasures count against the limit — remains left in place cost a
        look, not a slot, so they can never starve the ones to erase."""
        if self._erased >= self._limit or self._monotonic() >= self._deadline:
            report.truncated = True
            return True
        return False

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
        query = self._db.collection("sessions").where(filter=FieldFilter(EXPIRE_AT, "<=", self._at))
        expired = [snap async for snap in query.select(["is_deleted"]).stream()]  # read first: erasures are slow
        for snap in expired:
            if (snap.to_dict() or {}).get("is_deleted") is True:
                continue  # binned: the bin's own 30 days apply (older soft deletes stamped an expiry too)
            if self._stop(report):
                return
            await self._attempt(report, "guest_session", snap.id, self._expire_guest(snap.id, report))

    async def _expire_guest(self, project_id: str, report: RetentionReport) -> None:
        # Read again right before acting: since the list was read the session may
        # have been claimed by a registered user, written to, or binned.
        snap = await self._db.collection("sessions").document(project_id).get()
        data = (snap.to_dict() or {}) if snap.exists else {}
        expire_at = data.get(EXPIRE_AT)
        if data.get("is_deleted") is True or not isinstance(expire_at, datetime) or expire_at > self._at:
            return
        if await self._any_registered(real_owners(data)):
            await clear_session_expiry(self._db, project_id)
            report.made_permanent += 1
        else:
            await self._purge(project_id)
            report.guest_sessions += 1

    async def _binned_projects(self, report: RetentionReport) -> None:
        # `deleted_at` is written only by the soft delete: a single-field range
        # query (automatic index) selects just the projects past the bin period.
        cutoff = self._at - BIN_RETENTION
        query = self._db.collection("sessions").where(filter=FieldFilter("deleted_at", "<=", cutoff))
        binned = [snap async for snap in query.select(["is_deleted"]).stream()]
        for snap in binned:
            if (snap.to_dict() or {}).get("is_deleted") is not True:
                continue
            if self._stop(report):
                return
            await self._attempt(report, "deleted_project", snap.id, self._erase_binned(snap.id, report))

    async def _erase_binned(self, project_id: str, report: RetentionReport) -> None:
        await self._purge(project_id)
        report.deleted_projects += 1

    async def _expired_holds(self, report: RetentionReport) -> None:
        for hold in await expired_holds(self._db, now=self._at, limit=self._limit):
            if self._stop(report):
                return
            await self._attempt(report, "expired_hold", hold.project_id, self._release(hold, report))

    async def _release(self, hold: HoldRecord, report: RetentionReport) -> None:
        await release_hold(self._db, self._bucket, hold)
        self._erased += 1
        report.expired_holds += 1

    async def _orphans(self, report: RetentionReport) -> None:
        if self._stop(report):  # the scan itself is the expensive part
            return
        for project_id in await self._orphan_ids():
            if self._stop(report):
                return
            await self._attempt(report, "orphan", project_id, self._settle_orphan(project_id, report))

    async def _settle_orphan(self, project_id: str, report: RetentionReport) -> None:
        projection = await self._db.collection("projects").document(project_id).get()
        data = (projection.to_dict() or {}) if projection.exists else {}
        if data.get("is_deleted") is not True and await self._any_registered(real_owners(data)):
            report.orphans_kept += 1
            return
        held = await find_held_quotes(self._db, project_id, now=self._at)
        last_write = await self._last_write(project_id, projection, held)
        if last_write is None:
            # Only what a legal hold keeps is left. A hold marked before the
            # registry existed gets its record now (it is then skipped by the scan).
            if self._erase_orphans and held:
                await hold_sent_quotes(self._db, project_id, held, now=self._at)
            return
        if last_write > self._at - ORPHAN_GRACE:
            return  # written to recently: look again next run
        if self._erase_orphans:
            await self._purge(project_id)
        report.orphans += 1

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _purge(self, project_id: str) -> None:
        await purge_project(self._db, self._bucket, project_id, now=self._at)
        self._erased += 1

    async def _any_registered(self, owners: Sequence[str]) -> bool:
        """Whether any of `owners` is a live registered account (anonymous and
        deleted accounts are not). A failed lookup raises: never guessed."""
        for owner in owners:
            if owner not in self._kinds:
                self._kinds[owner] = await self._account_kind(owner)
            if self._kinds[owner] is AccountKind.REGISTERED:
                return True
        return False

    async def _orphan_ids(self) -> list[str]:
        """Ids with remains (Firestore or Storage) but no session document."""
        remains = await find_chat_remains(self._db, self._bucket)
        session_remains = remains.session_remains
        projects = self._db.collection("projects")
        candidates = remains.all_ids - remains.live

        # A registered legal hold keeps the quote (under the deleted projection)
        # and its PDFs on purpose: such a project is an orphan only if a session
        # remain or the projection itself is still there (an interrupted purge).
        for pid in (candidates & await held_project_ids(self._db)) - session_remains:
            if not (await projects.document(pid).get()).exists:
                candidates.discard(pid)

        malformed = {pid for pid in candidates if not is_safe_id(pid)}
        if malformed:
            logger.warning("[Retention] Ignoring remains with a malformed id", extra={"count": len(malformed)})
        return sorted(candidates - malformed)

    async def _last_write(self, project_id: str, projection: Any, held: Sequence[HeldQuote]) -> datetime | None:
        """The newest write among what is left of the project, the held quotes
        excluded. None: nothing but held quotes is left."""
        held_ids = {quote.doc_id for quote in held}
        held_blobs = frozenset().union(*(quote.blob_paths for quote in held))

        def keep(ref: Any) -> bool:
            return ref.parent.id == "private_data" and ref.id in held_ids

        times: list[datetime] = []
        if projection.exists:
            times.append(projection.update_time)
        times += [doc.update_time async for doc in iter_tree(self._db.collection("sessions").document(project_id))]
        times += [doc.update_time async for doc in iter_tree(self._db.collection("projects").document(project_id), keep=keep)]
        for prefix in project_storage_prefixes(project_id):
            times += await asyncio.to_thread(_blob_times, self._bucket, prefix, held_blobs)
        return max((t for t in times if t is not None), default=None)

    def _audit(self, report: RetentionReport) -> None:
        emit_audit_event(
            AuditAction.RETENTION_CLEANUP,
            AuditResourceType.SYSTEM,
            "retention",
            status="success" if not report.errors else "partial_errors",
            metadata={
                "orphans_applied": report.orphans_applied,
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
        erase_orphans=settings.RETENTION_ORPHAN_PURGE_ENABLED,
    )
