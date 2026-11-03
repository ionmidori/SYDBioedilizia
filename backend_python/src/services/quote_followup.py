"""A change asked in the chat while the team has the quote (Phase 139 PR-3).

When the quote is submitted, in review or approved and about to be sent, the
chat must not write its items (`quote_state.ai_draft_action` → "relay"): the
request goes to the team instead. The quote records it (`client_followup`,
shown in the admin dossier) and the admin gets one email per quote version, so
a chatty client does not flood the inbox while the team has not acted yet.
"""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from google.cloud.firestore_v1 import async_transactional

from src.core.config import settings
from src.services.email import outbox
from src.services.email_templates import admin_client_followup_email, digest_from_quote
from src.services.quote_drafts import quote_doc_ref
from src.services.quote_state import ai_draft_action, status_label_it
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FollowupResult:
    status: str
    quote_number: str | None
    # True when the admin email was queued by this request.
    notified: bool


def followup_id_for(project_id: str, version: int) -> str:
    """Deterministic outbox id: one admin email per quote version."""
    return "followup_" + hashlib.sha256(f"{project_id}:{version}".encode()).hexdigest()[:24]


async def _transact(db: Any, body: Any) -> Any:
    """Run `body(transaction)` in a Firestore transaction (retried on contention).
    Single seam for the in-memory fakes used by the unit tests."""

    @async_transactional
    async def _txn(transaction: Any) -> Any:
        return await body(transaction)

    return await _txn(db.transaction())


async def relay_tx(
    transaction: Any, db: Any, project_id: str, now: datetime
) -> tuple[FollowupResult | None, str | None]:
    """Record the request and queue the admin email. Returns (None, None) when
    the chat may write the quote after all (the status changed): the caller
    drafts instead. Otherwise the result and the outbox id to dispatch."""
    ref = quote_doc_ref(db, project_id)
    snap = await ref.get(transaction=transaction)
    if not snap.exists:
        return None, None
    quote: dict[str, Any] = snap.to_dict() or {}
    status = quote.get("status")
    if ai_draft_action(status, quote.get("delivery_status")) != "relay":
        return None, None

    version = int(quote.get("version") or 1)
    previous = quote.get("client_followup") or {}
    count = int(previous.get("count") or 0) + 1 if previous.get("version") == version else 1
    out_ref = db.collection(outbox.OUTBOX).document(followup_id_for(project_id, version))
    already_emailed = (await out_ref.get(transaction=transaction)).exists

    transaction.update(ref, {"client_followup": {"requested_at": now, "count": count, "version": version}})
    result = FollowupResult(str(status), quote.get("quote_number"), notified=False)
    if already_emailed:
        return result, None
    if not settings.ADMIN_EMAIL:
        # Still visible in the admin dossier, but nobody is emailed.
        logger.error("Admin notification skipped: ADMIN_EMAIL not configured.")
        return result, None
    content = admin_client_followup_email(
        digest=digest_from_quote(quote), status_label=status_label_it(status), admin_url=settings.ADMIN_DASHBOARD_URL
    )
    transaction.set(
        out_ref,
        outbox.message_entry(
            kind="admin_notification", to=settings.ADMIN_EMAIL, subject=content.subject,
            text=content.text, html=content.html, now=now, project_id=project_id,
        ),
    )
    return FollowupResult(result.status, result.quote_number, notified=True), out_ref.id


async def relay_client_request(db: Any, project_id: str, now: datetime | None = None) -> FollowupResult | None:
    """Relay a change asked in the chat to the team (see the module docstring)."""
    when = now or utc_now()
    result, queued_id = await _transact(db, lambda tx: relay_tx(tx, db, project_id, when))
    if queued_id:
        await outbox.dispatch_soon(db, queued_id, when)
    if result is not None:
        # The quote number only: the project id is the chat session id (an access token).
        logger.info("Client change relayed to the team.", extra={"quote_number": result.quote_number,
                                                                  "notified": result.notified})
    return result
