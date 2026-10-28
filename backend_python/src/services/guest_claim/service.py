"""A guest's chats follow it into its account (Phase 138 PR-6).

Guests chat as Firebase anonymous users, so their sessions are owned by the
anonymous uid. When the guest creates an account the client links it to the
anonymous user (same uid: nothing to claim). When the guest signs in to an
EXISTING account the uid changes: the client then
1. still anonymous, asks for a claim ticket (issue_claim_ticket);
2. signed in, presents it (claim_guest_sessions): every session of that
   anonymous uid moves to the account.
Sessions move only with the ticket of the anonymous user that owns them, only
to a registered account, and never from a registered account.
"""
import logging
from datetime import datetime
from typing import Any

from src.auth.user_lookup import AccountKind, account_kind
from src.core.exceptions import GuestClaimDenied
from src.schemas.guest_claim import GuestClaimResult, GuestClaimTicket
from src.schemas.internal import UserSession
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event
from src.services.guest_claim import tickets
from src.services.guest_claim.transfer import GuestSessions, find_guest_sessions, move_session
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

NOT_A_GUEST = "Solo un ospite può chiedere di trasferire le proprie conversazioni."
SIGN_IN_FIRST = "Accedi con il tuo account per recuperare le conversazioni da ospite."
SOURCE_IS_REGISTERED = "Le conversazioni appartengono a un account registrato e non possono essere trasferite."


async def issue_claim_ticket(db: Any, user: UserSession, *, now: datetime | None = None) -> GuestClaimTicket:
    """A ticket for the calling anonymous user. The token alone is not trusted:
    an account linked after its token was minted is no longer anonymous."""
    if not user.is_anonymous or await account_kind(user.uid) is not AccountKind.ANONYMOUS:
        raise GuestClaimDenied(message=NOT_A_GUEST)
    issued = await tickets.issue(db, user.uid, now=now or utc_now())
    return GuestClaimTicket(ticket=issued.ticket, expires_at=issued.expires_at)


def _outcome(earlier: GuestClaimResult | None, found: GuestSessions) -> GuestClaimResult:
    """What the claim moves: what an earlier attempt planned, plus what is left now."""
    if earlier is None:
        return GuestClaimResult(session_ids=found.session_ids, open_session_id=found.open_session_id)
    return GuestClaimResult(
        session_ids=[*earlier.session_ids, *(s for s in found.session_ids if s not in earlier.session_ids)],
        open_session_id=earlier.open_session_id or found.open_session_id,
    )


async def claim_guest_sessions(
    db: Any, user: UserSession, ticket: str, *, now: datetime | None = None
) -> GuestClaimResult:
    """Move the ticket's anonymous sessions to the calling registered user.

    A guest that never wrote has nothing to move (empty result, not an error);
    a retry by the same account answers like the first claim, and finishes an
    interrupted one.
    """
    if user.is_guest:
        raise GuestClaimDenied(message=SIGN_IN_FIRST)
    redemption = await tickets.redeem(db, ticket, user.uid, now=now or utc_now())
    anon_uid = redemption.anon_uid
    if anon_uid == user.uid:
        return GuestClaimResult(session_ids=[])  # linked account: the sessions are already its own
    # The ticket proved an anonymous account when it was issued; one that has
    # since become registered keeps its sessions (a missing one has no one to keep them).
    if await account_kind(anon_uid) is AccountKind.REGISTERED:
        raise GuestClaimDenied(message=SOURCE_IS_REGISTERED)

    found = await find_guest_sessions(db, anon_uid)
    outcome = _outcome(redemption.outcome, found)
    if outcome != redemption.outcome:
        # Before moving: an interrupted claim still answers with every session it planned.
        await tickets.record_outcome(db, ticket, outcome)
    for session_id in found.session_ids:
        await move_session(db, session_id, anon_uid, user.uid)
        emit_audit_event(
            AuditAction.PROJECT_CLAIM, AuditResourceType.PROJECT, session_id,
            user_id=user.uid, metadata={"from_uid": anon_uid},
        )
    logger.info(f"[GuestClaim] {len(found.session_ids)} sessions of {anon_uid} claimed by {user.uid}")
    return outcome
