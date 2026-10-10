"""
Event-driven dispatch scheduling with Cloud Tasks (Phase 128 — Fase 4, rev. 2).

The owner does not want a job waking the service every 5 minutes around the
clock. Instead, work is scheduled only when there is an email to send:

- right after an email is queued: ONE delayed "safety" task (after the lease
  can expire), in case the instance stopped before the inline dispatch ran.
  If the email already left, the task finds the entry `done` and does nothing;
- after a transient failure: ONE task at the retry time (`next_attempt_at`).

No email → no task → the service is never woken up for the outbox.

Each task calls POST /internal/email/dispatch/{outbox_id} with an OIDC token
of a dedicated service account (verified by the endpoint). Task names are
deterministic (`{outbox_id}-{label}`), so scheduling twice is harmless
(Cloud Tasks answers 409 ALREADY_EXISTS).

The REST API is called with the runtime service account's credentials (ADC)
— no extra client library. When the queue is not configured (local dev,
tests) scheduling is a logged no-op: the inline dispatch still sends.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

import google.auth
from google.auth.transport.requests import AuthorizedSession

from src.core.config import settings

logger = logging.getLogger(__name__)

_SCOPES = ("https://www.googleapis.com/auth/cloud-platform",)
_session: AuthorizedSession | None = None


def tasks_configured() -> bool:
    return bool(
        settings.EMAIL_TASKS_QUEUE
        and settings.EMAIL_INTERNAL_BASE_URL
        and settings.EMAIL_INTERNAL_AUDIENCE
        and settings.EMAIL_INTERNAL_INVOKER_EMAIL
    )


def _queue_path() -> str:
    project = settings.GOOGLE_CLOUD_PROJECT or settings.FIREBASE_PROJECT_ID
    return f"projects/{project}/locations/{settings.EMAIL_TASKS_LOCATION}/queues/{settings.EMAIL_TASKS_QUEUE}"


def build_task(outbox_id: str, at: datetime, label: str) -> dict[str, Any]:
    """Cloud Tasks v2 Task resource for one dispatch attempt."""
    base = (settings.EMAIL_INTERNAL_BASE_URL or "").rstrip("/")
    return {
        "name": f"{_queue_path()}/tasks/{outbox_id}-{label}",
        "scheduleTime": at.isoformat().replace("+00:00", "Z"),
        "httpRequest": {
            "httpMethod": "POST",
            "url": f"{base}/internal/email/dispatch/{outbox_id}",
            "oidcToken": {
                "serviceAccountEmail": settings.EMAIL_INTERNAL_INVOKER_EMAIL,
                "audience": settings.EMAIL_INTERNAL_AUDIENCE,
            },
        },
    }


def _get_session() -> AuthorizedSession:
    global _session
    if _session is None:
        credentials, _project = google.auth.default(scopes=_SCOPES)
        _session = AuthorizedSession(credentials)
    return _session


def _create_task_sync(task: dict[str, Any]) -> int:
    response = _get_session().post(
        f"https://cloudtasks.googleapis.com/v2/{_queue_path()}/tasks", json={"task": task}, timeout=10
    )
    return response.status_code


async def schedule_dispatch(outbox_id: str, at: datetime, label: str) -> bool:
    """Schedule one dispatch of `outbox_id` at `at`. Never raises: a failure is
    logged (the entry stays `pending` and a manual sweep recovers it)."""
    if not tasks_configured():
        logger.info("[Email/Tasks] Queue not configured: no task scheduled.", extra={"outbox_id": outbox_id})
        return False
    try:
        status = await asyncio.to_thread(_create_task_sync, build_task(outbox_id, at, label))
    except Exception as exc:  # noqa: BLE001 — scheduling is best-effort by contract; logged, entry stays pending
        logger.error("[Email/Tasks] Task creation failed.", extra={"outbox_id": outbox_id,
                                                                    "error_type": type(exc).__name__})
        return False
    if status in (200, 409):  # 409 = already scheduled (deterministic name)
        return True
    logger.error("[Email/Tasks] Task creation refused.", extra={"outbox_id": outbox_id, "status": status})
    return False
