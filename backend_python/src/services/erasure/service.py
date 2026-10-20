"""UserErasureService — erase a user's personal data, resumably.

One implementation for both paths: `DELETE /api/users/me` (Art. 17) and the
24-month inactivity phase of the account lifecycle.

State lives in `erasure_jobs/{uid}` (outside `users/`, which a full deletion
removes): mode, the project ids found (saved BEFORE anything is deleted), the
completed step names, a lease. "Completed" — and, for inactivity,
`users/{uid}.lifecycle_anonymized_at` — is written last, in one batch, after
the final step: a run that stops halfway leaves the job `failed` (or with an
expired lease) and `resume_incomplete` finishes it, never re-running a step
that already succeeded.
"""
from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from datetime import datetime, timedelta
from typing import Any

from google.cloud.firestore_v1 import DELETE_FIELD, async_transactional
from google.cloud.firestore_v1.base_query import FieldFilter

from src.core.exceptions import ErasureInProgressError
from src.db.firebase_client import get_async_firestore_client, get_storage_client
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event
from src.services.auth_gateway import AuthGateway, FirebaseAuthGateway
from src.services.erasure.discovery import discover_project_ids
from src.services.erasure.models import ErasureMode, ErasureReport, ErasureStatus
from src.services.erasure.steps import ERASURE_STEPS, ErasureContext, ErasureStep
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

JOBS_COLLECTION = "erasure_jobs"
LEASE = timedelta(minutes=15)


async def _transact(db: Any, body: Any) -> Any:
    @async_transactional
    async def _txn(transaction: Any) -> Any:
        return await body(transaction)

    return await _txn(db.transaction())


def _report(uid: str, job: dict[str, Any], status: ErasureStatus) -> ErasureReport:
    return ErasureReport(
        uid=uid,
        mode=ErasureMode(job["mode"]),
        status=status,
        completed_steps=list(job.get("completed_steps") or []),
        counts=dict(job.get("step_counts") or {}),
    )


class UserErasureService:
    def __init__(
        self,
        *,
        db: Any,
        bucket: Any,
        auth: AuthGateway,
        now: Callable[[], datetime] = utc_now,
        steps: Sequence[ErasureStep] = ERASURE_STEPS,
    ) -> None:
        self._db = db
        self._bucket = bucket
        self._auth = auth
        self._now = now
        self._steps = steps

    def _job_ref(self, uid: str) -> Any:
        return self._db.collection(JOBS_COLLECTION).document(uid)

    async def _acquire(self, uid: str, mode: ErasureMode, requested_by: str) -> dict[str, Any]:
        """Take the job lease (creating or resuming the job). A completed job is
        returned untouched; a live lease raises ErasureInProgressError."""
        ref = self._job_ref(uid)

        async def body(transaction: Any) -> dict[str, Any]:
            snap = await ref.get(transaction=transaction)
            job = (snap.to_dict() or {}) if snap.exists else {}
            now = self._now()
            if job.get("status") == ErasureStatus.COMPLETED:
                return job
            lease_until = job.get("lease_until")
            if job.get("status") == ErasureStatus.RUNNING and lease_until is not None and lease_until > now:
                raise ErasureInProgressError()
            if job.get("status") == ErasureStatus.CANCELLED:
                # A new lapse is a new erasure: every step runs again. The project
                # ids are kept — the cancelled run may have erased the pointers
                # (leads, batches) that were the only way to find some of them.
                job = {
                    "created_at": job.get("created_at"),
                    "attempts": job.get("attempts"),
                    "project_ids": job.get("project_ids") or [],
                }
            # A deletion request upgrades a pending inactivity erasure, never the reverse.
            upgraded = ErasureMode.ACCOUNT_DELETION in (mode, job.get("mode"))
            job = {
                "uid": uid,
                "mode": (ErasureMode.ACCOUNT_DELETION if upgraded else ErasureMode.INACTIVITY).value,
                "status": ErasureStatus.RUNNING.value,
                "requested_by": job.get("requested_by") or requested_by,
                "project_ids": list(job.get("project_ids") or []),
                "completed_steps": list(job.get("completed_steps") or []),
                "step_counts": dict(job.get("step_counts") or {}),
                "attempts": int(job.get("attempts") or 0) + 1,
                "last_error_type": None,
                "lease_until": now + LEASE,
                "created_at": job.get("created_at") or now,
                "updated_at": now,
            }
            transaction.set(ref, job)
            return job

        return await _transact(self._db, body)

    async def erase(self, uid: str, mode: ErasureMode, *, requested_by: str) -> ErasureReport:
        """Erase (or resume erasing) the user's data. Returns COMPLETED, or FAILED
        when a step failed — the job is then resumed by `resume_incomplete`.
        Raises ErasureInProgressError if another run holds the lease."""
        job = await self._acquire(uid, mode, requested_by)
        if job.get("status") == ErasureStatus.COMPLETED:
            return _report(uid, job, ErasureStatus.COMPLETED)

        job_mode = ErasureMode(job["mode"])
        completed: list[str] = job["completed_steps"]
        counts: dict[str, int] = job["step_counts"]
        stage = "eligibility"
        try:
            if job_mode is ErasureMode.INACTIVITY:
                reason = await self._no_longer_inactive(uid, completed)
                if reason is not None:
                    return await self._cancel(uid, job_mode, completed, counts, reason, requested_by)
            stage = "discovery"
            # Saved before anything is deleted: the discovery sources are erased too.
            project_ids = sorted(set(job["project_ids"]) | await discover_project_ids(self._db, uid))
            await self._job_ref(uid).update({"project_ids": project_ids, "updated_at": self._now()})
            ctx = ErasureContext(
                db=self._db, bucket=self._bucket, auth=self._auth, uid=uid,
                mode=job_mode, project_ids=project_ids, now=self._now(),
            )
            for step in self._steps:
                if step.name in completed:
                    continue
                stage = step.name
                counts[step.name] = await step.run(ctx)
                completed.append(step.name)
                await self._progress(uid, completed, counts)
            stage = "finalize"
            await self._finalize(uid, job_mode, completed, counts)
        except Exception as exc:
            logger.error(
                "[Erasure] Failed; the job will be resumed",
                extra={"stage": stage, "mode": job_mode.value, "error_type": type(exc).__name__},
                exc_info=True,
            )
            await self._mark_failed(uid, completed, counts, stage, exc)
            report = ErasureReport(
                uid=uid, mode=job_mode, status=ErasureStatus.FAILED, completed_steps=list(completed),
                counts=dict(counts), failed_step=stage, error_type=type(exc).__name__,
            )
            self._audit(report, requested_by)
            return report

        report = ErasureReport(
            uid=uid, mode=job_mode, status=ErasureStatus.COMPLETED,
            completed_steps=list(completed), counts=dict(counts),
        )
        self._audit(report, requested_by)
        return report

    async def _no_longer_inactive(self, uid: str, completed: list[str]) -> str | None:
        """Why an inactivity erasure must not go on, checked at every start and
        resumption (a job can wait days while the user comes back). None if it
        still applies. An explicit erasure request is never re-checked.

        An inactivity erasure only ever applies to an account the lifecycle
        DISABLED: an enabled one means support re-enabled it — even if the user
        has not logged in yet and the profile still says disabled.
        """
        if "user_profile" not in completed:
            snapshot = await self._db.collection("users").document(uid).get()
            profile = (snapshot.to_dict() or {}) if snapshot.exists else {}
            if profile.get("lifecycle_disabled_at") is None:
                return "user_active_again"  # the activity tracker cleared the marker
        if "auth_delete" not in completed and await self._auth.is_disabled(uid) is False:
            return "account_reenabled"
        return None

    async def _cancel(
        self, uid: str, mode: ErasureMode, completed: list[str], counts: dict[str, int],
        reason: str, requested_by: str,
    ) -> ErasureReport:
        logger.warning("[Erasure] Inactivity erasure cancelled: the user is active again",
                       extra={"reason": reason})
        if reason == "account_reenabled" and "user_profile" not in completed:
            # The stale markers would re-trigger (and re-cancel) phase 3 on every
            # run, and the user would never get a new warning: restart the cycle.
            profile_ref = self._db.collection("users").document(uid)
            if (await profile_ref.get()).exists:
                await profile_ref.update({"lifecycle_warned_at": DELETE_FIELD, "lifecycle_disabled_at": DELETE_FIELD})
        await self._job_ref(uid).update({
            "status": ErasureStatus.CANCELLED.value, "lease_until": None,
            "cancel_reason": reason, "updated_at": self._now(),
        })
        report = ErasureReport(
            uid=uid, mode=mode, status=ErasureStatus.CANCELLED, completed_steps=list(completed),
            counts=dict(counts), failed_step=reason,
        )
        self._audit(report, requested_by)
        return report

    async def _progress(self, uid: str, completed: list[str], counts: dict[str, int]) -> None:
        """Record a finished step and renew the lease (a long erasure must not
        be taken over by a second run while it is still progressing)."""
        now = self._now()
        await self._job_ref(uid).update({
            "completed_steps": completed, "step_counts": counts, "lease_until": now + LEASE, "updated_at": now,
        })

    async def _mark_failed(
        self, uid: str, completed: list[str], counts: dict[str, int], stage: str, exc: Exception
    ) -> None:
        try:
            await self._job_ref(uid).update({
                "status": ErasureStatus.FAILED.value, "lease_until": None,
                "last_error_type": type(exc).__name__, "failed_step": stage,
                "completed_steps": completed, "step_counts": counts, "updated_at": self._now(),
            })
        except Exception:
            # The lease still expires on its own and resume_incomplete picks the job up.
            logger.error("[Erasure] Could not record the failure", exc_info=True)

    async def _finalize(self, uid: str, mode: ErasureMode, completed: list[str], counts: dict[str, int]) -> None:
        now = self._now()
        batch = self._db.batch()
        batch.update(self._job_ref(uid), {
            "status": ErasureStatus.COMPLETED.value, "lease_until": None, "completed_at": now,
            "completed_steps": completed, "step_counts": counts, "updated_at": now,
        })
        if mode is ErasureMode.INACTIVITY:
            batch.set(self._db.collection("users").document(uid), {"lifecycle_anonymized_at": now}, merge=True)
        await batch.commit()

    async def resume_incomplete(self, *, limit: int) -> list[ErasureReport]:
        """Finish the erasures a previous run left failed or abandoned (expired lease).

        The longest-waiting jobs go first: a job that keeps failing gets a fresh
        `updated_at` each time, so it cannot starve the others behind `limit`.
        One broken job never stops the rest.
        """
        query = self._db.collection(JOBS_COLLECTION).where(
            filter=FieldFilter("status", "in", [ErasureStatus.FAILED.value, ErasureStatus.RUNNING.value])
        )
        now = self._now()
        pending = []
        async for snap in query.stream():
            job = snap.to_dict() or {}
            lease_until = job.get("lease_until")
            if job.get("status") == ErasureStatus.RUNNING and lease_until is not None and lease_until > now:
                continue  # someone is on it
            pending.append((job.get("updated_at") or now, snap.id, job))
        pending.sort(key=lambda item: item[0])

        reports: list[ErasureReport] = []
        for _, uid, job in pending[:limit]:
            try:
                reports.append(await self.erase(
                    uid, ErasureMode(job["mode"]), requested_by=job.get("requested_by") or "resume"
                ))
            except ErasureInProgressError:
                continue
            except Exception as exc:
                logger.error("[Erasure] Could not resume a job", extra={"error_type": type(exc).__name__},
                             exc_info=True)
                reports.append(ErasureReport(
                    uid=uid, mode=None, status=ErasureStatus.FAILED, failed_step="resume",
                    error_type=type(exc).__name__,
                ))
        return reports

    @staticmethod
    def _audit(report: ErasureReport, requested_by: str) -> None:
        # Counts and step names only: an erasure record must not hold the erased data.
        emit_audit_event(
            AuditAction.USER_ERASE,
            AuditResourceType.USER,
            report.uid,
            status=(
                "success" if report.status is ErasureStatus.COMPLETED
                else "cancelled" if report.status is ErasureStatus.CANCELLED
                else "failure"
            ),
            user_id=report.uid if requested_by == "self" else "system",
            metadata={
                "mode": report.mode.value if report.mode else None,
                "requested_by": requested_by,
                "counts": report.counts,
                "failed_step": report.failed_step,
                "error_type": report.error_type,
            },
        )


def get_user_erasure_service() -> UserErasureService:
    return UserErasureService(
        db=get_async_firestore_client(), bucket=get_storage_client(), auth=FirebaseAuthGateway()
    )
