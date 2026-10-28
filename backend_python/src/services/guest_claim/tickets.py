"""Claim tickets: an anonymous user's proof that it is that user.

The guest asks for one while still signed in anonymously and presents it once
signed in to its account, so knowing a session id is never enough to take a
chat. Only the SHA-256 of the ticket is stored (the ticket is 256 random bits:
no slow hash needed). A ticket is valid for TICKET_TTL; the first account that
redeems it owns it, and only that account may redeem it again (a retry gets the
same outcome). `expiresAt` also drives the Firestore TTL policy that deletes
old tickets. Clients never read this collection (firestore.rules: default deny).
"""
import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from src.core.exceptions import GuestClaimDenied
from src.db import transactions
from src.schemas.guest_claim import GuestClaimResult

TICKETS = "guest_claim_tickets"
TICKET_TTL = timedelta(minutes=15)

INVALID_TICKET = (
    "Il collegamento con la sessione da ospite non è valido o è scaduto: "
    "le conversazioni da ospite non sono state trasferite."
)
TICKET_USED = "Le conversazioni di questa sessione da ospite sono già state trasferite a un altro account."


@dataclass(frozen=True)
class IssuedTicket:
    ticket: str
    expires_at: datetime


@dataclass(frozen=True)
class Redemption:
    anon_uid: str
    # What an earlier redemption by the same account moved (None: first redemption).
    outcome: GuestClaimResult | None


def _ref(db: Any, ticket: str) -> Any:
    return db.collection(TICKETS).document(hashlib.sha256(ticket.encode()).hexdigest())


async def issue(db: Any, anon_uid: str, *, now: datetime) -> IssuedTicket:
    ticket = secrets.token_urlsafe(32)
    expires_at = now + TICKET_TTL
    await _ref(db, ticket).create({"anonUid": anon_uid, "createdAt": now, "expiresAt": expires_at})
    return IssuedTicket(ticket=ticket, expires_at=expires_at)


async def redeem(db: Any, ticket: str, claimer_uid: str, *, now: datetime) -> Redemption:
    """Bind the ticket to `claimer_uid` (first redemption) and say whose it is.

    Raises GuestClaimDenied for an unknown or expired ticket, or one another
    account already redeemed.
    """
    ref = _ref(db, ticket)

    async def body(transaction: Any) -> Redemption:
        snap = await ref.get(transaction=transaction)
        data = (snap.to_dict() or {}) if snap.exists else {}
        expires_at = data.get("expiresAt")
        if not isinstance(expires_at, datetime) or expires_at <= now:
            raise GuestClaimDenied(message=INVALID_TICKET)
        claimed_by = data.get("claimedBy")
        if claimed_by is None:
            transaction.update(ref, {"claimedBy": claimer_uid, "claimedAt": now})
        elif claimed_by != claimer_uid:
            raise GuestClaimDenied(message=TICKET_USED)
        outcome = data.get("outcome")
        return Redemption(
            anon_uid=data["anonUid"],
            outcome=GuestClaimResult.model_validate(outcome) if outcome is not None else None,
        )

    return await transactions.run_transaction(db, body)


async def record_outcome(db: Any, ticket: str, outcome: GuestClaimResult) -> None:
    """Remember what the claim moved: a retry by the same account answers the same."""
    await _ref(db, ticket).update({"outcome": outcome.model_dump()})
