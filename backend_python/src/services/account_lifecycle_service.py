"""
AccountLifecycleService — GDPR B2C inactivity lifecycle for Italian SaaS.

Daily pass (Cloud Scheduler, or "Run now" in /admin; both hold the lifecycle lease):

  0. Erasures left halfway by an earlier run are finished first.
  1. 12 months inactive → warning email (once). Sets lifecycle_warned_at.
  2. 13 months inactive, warned at least the notice period ago → Firebase Auth
     disabled. Sets lifecycle_disabled_at.
  3. 24 months inactive, disabled at least the notice period ago → every
     personal datum erased (UserErasureService, inactivity mode); the profile
     becomes a tombstone and lifecycle_anonymized_at is written last.
  4. Retention (RetentionService), with the time the pass has left: expired
     guest sessions, projects in the bin for more than 30 days and expired
     legal holds are erased; orphaned remains too, once
     RETENTION_ORPHAN_PURGE_ENABLED is set (until then they are counted).

Selection: users whose `last_active_at` is past the 12-month threshold; the
phase markers are checked in Python. Firestore `== None` never matches a
document WITHOUT the field, and no code writes these markers as null: filtering
on them in the query made the pipeline select nobody.

A user moves at most one phase per run, and every phase waits the notice
period after the previous one: when the pipeline catches up with a long-inactive
user, the warning still comes with its full notice before the account is
disabled. Users who come back reset `last_active_at` (and the warning) via
activity_tracker.py.
"""
from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Protocol

from google.cloud.firestore_v1.base_query import FieldFilter

from src.core.config import settings
from src.db.firebase_client import get_async_firestore_client
from src.services.auth_gateway import AuthGateway, FirebaseAuthGateway
from src.services.erasure.models import ErasureMode, ErasureReport, ErasureStatus
from src.services.erasure.service import get_user_erasure_service
from src.services.notification_service import NotificationService
from src.services.retention.models import RetentionReport
from src.services.retention.service import get_retention_service
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

_DAYS_PER_MONTH = 365.25 / 12
_RESUME_LIMIT = 50

# Wall time a whole pass may use: Cloud Run ends the request at 300 s. The
# retention phase gets what the earlier phases left of it.
PASS_BUDGET_SECONDS = 240.0


# ── Domain types ──────────────────────────────────────────────────────────────

@dataclass
class LifecycleRunResult:
    """Summary of a single lifecycle pass."""
    warned: int = 0
    disabled: int = 0
    anonymized: int = 0
    errors: list[str] = field(default_factory=list)
    retention: RetentionReport | None = None  # None: the retention phase did not run

    def __str__(self) -> str:  # pragma: no cover
        return (
            f"LifecycleRun: warned={self.warned}, disabled={self.disabled}, "
            f"anonymized={self.anonymized}, errors={len(self.errors)}, retention={self.retention}"
        )


class _Notifier(Protocol):
    async def send_inactivity_warning(self, email: str, display_name: str, disable_in_days: int) -> bool: ...


class _Eraser(Protocol):
    async def erase(self, uid: str, mode: ErasureMode, *, requested_by: str) -> ErasureReport: ...
    async def resume_incomplete(self, *, limit: int) -> list[ErasureReport]: ...


class _Retention(Protocol):
    async def run(self, *, budget_seconds: float) -> RetentionReport: ...


# ── Service ───────────────────────────────────────────────────────────────────

class AccountLifecycleService:
    """
    GDPR-compliant inactivity lifecycle for SYD Bioedilizia users.

    Phases 1-2 are reversible (a returning user is reactivated by support);
    phase 3 is not.
    """

    def __init__(
        self,
        *,
        db: Any,
        auth: AuthGateway,
        erasure: _Eraser,
        notify: _Notifier,
        retention: _Retention,
        now: Callable[[], datetime] = utc_now,
        monotonic: Callable[[], float] = time.monotonic,
        warn_months: int = settings.LIFECYCLE_WARN_MONTHS,
        disable_months: int = settings.LIFECYCLE_DISABLE_MONTHS,
        anonymize_months: int = settings.LIFECYCLE_ANONYMIZE_MONTHS,
    ) -> None:
        self._db = db
        self._auth = auth
        self._erasure = erasure
        self._notify = notify
        self._retention = retention
        self._now = now
        self._monotonic = monotonic
        self._warn_months = warn_months
        self._disable_months = disable_months
        self._anonymize_months = anonymize_months

    def _months_ago(self, months: float) -> datetime:
        return self._now() - timedelta(days=months * _DAYS_PER_MONTH)

    @property
    def _notice(self) -> timedelta:
        """How long the warning (and then the disable) stands before the next step."""
        return timedelta(days=(self._disable_months - self._warn_months) * _DAYS_PER_MONTH)

    # ── Public entry point ────────────────────────────────────────────────────

    async def run_lifecycle_pass(self) -> LifecycleRunResult:
        """One idempotent pass. Callers hold the lifecycle lease. Failures are
        reported in `errors` (shown in /admin); one never stops the others."""
        started = self._monotonic()
        result = LifecycleRunResult()
        await self._resume_erasures(result)
        await self._advance_inactive_users(result)
        await self._run_retention(result, time_left=PASS_BUDGET_SECONDS - (self._monotonic() - started))
        logger.info("[Lifecycle] Pass complete: %s", result)
        return result

    async def _advance_inactive_users(self, result: LifecycleRunResult) -> None:
        # Candidates are read first: the per-user work (Auth calls, emails, whole
        # erasures) is slow and must not run inside an open query stream.
        warn_before = self._months_ago(self._warn_months)
        query = self._db.collection("users").where(filter=FieldFilter("last_active_at", "<=", warn_before))
        try:
            candidates = [snap async for snap in query.stream()]
        except Exception as exc:
            logger.error("[Lifecycle] Could not read the inactive users", exc_info=True)
            result.errors.append(f"users:{type(exc).__name__}")
            return

        for snap in candidates:
            try:
                await self._advance(snap, result)
            except Exception as exc:
                logger.error("[Lifecycle] Failed for uid=%s", snap.id, exc_info=True)
                result.errors.append(f"user:{snap.id}:{type(exc).__name__}")

    async def _run_retention(self, result: LifecycleRunResult, *, time_left: float) -> None:
        try:
            result.retention = await self._retention.run(budget_seconds=max(0.0, time_left))
        except Exception as exc:
            logger.error("[Lifecycle] The retention phase failed", exc_info=True)
            result.errors.append(f"retention:{type(exc).__name__}")
            return
        result.errors.extend(result.retention.errors)

    async def _resume_erasures(self, result: LifecycleRunResult) -> None:
        try:
            reports = await self._erasure.resume_incomplete(limit=_RESUME_LIMIT)
        except Exception as exc:
            logger.error("[Lifecycle] Could not resume the pending erasures", exc_info=True)
            result.errors.append(f"resume:{type(exc).__name__}")
            return
        for report in reports:
            if report.status is ErasureStatus.COMPLETED:
                if report.mode is ErasureMode.INACTIVITY:
                    result.anonymized += 1
            elif report.status is ErasureStatus.FAILED:
                result.errors.append(f"resume:{report.uid}:{report.failed_step}")
            # CANCELLED: the user came back while the erasure waited — nothing to do.

    async def _advance(self, snap: Any, result: LifecycleRunResult) -> None:
        """Move one inactive user at most one phase forward."""
        uid = snap.id
        data = snap.to_dict() or {}
        now = self._now()
        last_active = data["last_active_at"]
        warned_at = data.get("lifecycle_warned_at")
        disabled_at = data.get("lifecycle_disabled_at")

        if data.get("lifecycle_anonymized_at") is not None:
            return

        if warned_at is None:
            problem = await self._warn(uid)
            if problem is None:
                await snap.reference.update({"lifecycle_warned_at": now})
                result.warned += 1
            else:
                # Without a delivered notice the countdown never starts: the account
                # stays (and is reported in /admin) until someone decides.
                result.errors.append(f"warn:{uid}:{problem}")
            return

        if disabled_at is None:
            if last_active <= self._months_ago(self._disable_months) and warned_at <= now - self._notice:
                await self._auth.disable_and_revoke(uid)
                await snap.reference.update({"lifecycle_disabled_at": now})
                result.disabled += 1
                logger.info("[Lifecycle/Disable] Firebase Auth disabled for uid=%s", uid)
            return

        if last_active <= self._months_ago(self._anonymize_months) and disabled_at <= now - self._notice:
            report = await self._erasure.erase(uid, ErasureMode.INACTIVITY, requested_by="lifecycle")
            if report.status is ErasureStatus.COMPLETED:
                result.anonymized += 1
                logger.info("[Lifecycle/Erase] Personal data erased for uid=%s", uid)
            elif report.status is ErasureStatus.FAILED:
                result.errors.append(f"anonymize:{uid}:{report.failed_step}")

    async def _warn(self, uid: str) -> str | None:
        """Email the inactivity warning. None if delivered, else why not:
        `no_account` (missing from Firebase Auth — possibly a misconfiguration,
        never a reason to erase), `no_email`, `not_delivered`."""
        contact = await self._auth.get_contact(uid)
        if contact is None:
            logger.warning("[Lifecycle/Warn] uid=%s not found in Firebase Auth — not warned", uid)
            return "no_account"
        if not contact.email:
            logger.warning("[Lifecycle/Warn] uid=%s has no email address — not warned", uid)
            return "no_email"
        delivered = await self._notify.send_inactivity_warning(
            email=contact.email,
            display_name=contact.display_name or "Utente",
            disable_in_days=round(self._notice.days),
        )
        if not delivered:
            return "not_delivered"
        logger.info("[Lifecycle/Warn] Warning sent to uid=%s", uid)
        return None


# ── Factory ───────────────────────────────────────────────────────────────────

def get_account_lifecycle_service() -> AccountLifecycleService:
    return AccountLifecycleService(
        db=get_async_firestore_client(),
        auth=FirebaseAuthGateway(),
        erasure=get_user_erasure_service(),
        notify=NotificationService(),
        retention=get_retention_service(),
    )
