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

from google.cloud.firestore_v1 import async_transactional
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
        stage = "discovery"
        try:
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
            status="success" if report.status is ErasureStatus.COMPLETED else "failure",
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
