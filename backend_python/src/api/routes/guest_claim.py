"""
Guest → account claim (Phase 138 PR-6): a guest's chats follow it into its account.

- POST /api/guest-claim/ticket — the anonymous guest gets its claim ticket
- POST /api/guest-claim        — the signed-in account redeems it

See src/services/guest_claim/service.py.
"""
from fastapi import APIRouter, Depends, Request
from src.auth.jwt_handler import verify_token
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.schemas.guest_claim import GuestClaimRequest, GuestClaimResult, GuestClaimTicket
from src.schemas.internal import UserSession
from src.services.guest_claim.service import claim_guest_sessions, issue_claim_ticket

router = APIRouter(prefix="/api/guest-claim", tags=["guest-claim"])


@router.post("/ticket", response_model=GuestClaimTicket, summary="Claim ticket for the anonymous guest")
@limiter.limit("10/minute")
async def issue_ticket(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    user_session: UserSession = Depends(verify_token),
) -> GuestClaimTicket:
    return await issue_claim_ticket(get_async_firestore_client(), user_session)


@router.post("", response_model=GuestClaimResult, summary="Move the guest's chats to the signed-in account")
@limiter.limit("10/minute")
async def claim(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    body: GuestClaimRequest,
    user_session: UserSession = Depends(verify_token),
) -> GuestClaimResult:
    return await claim_guest_sessions(get_async_firestore_client(), user_session, body.ticket)
