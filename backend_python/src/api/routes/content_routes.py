"""
Public Content API — Testimonials & Portfolio.

These endpoints replace direct Firestore reads from the frontend,
enforcing the 3-Tier architecture boundary.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from src.auth.jwt_handler import verify_token
from src.core.logger import get_logger
from src.db.firebase_client import get_firestore_client
from src.schemas.internal import UserSession
from starlette.concurrency import run_in_threadpool

logger = get_logger(__name__)
router = APIRouter(prefix="/api/content", tags=["Content"])


# ── Testimonials ─────────────────────────────────────────────────────────────

class TestimonialOut(BaseModel):
    id: str
    name: str
    location: str = ""
    text: str
    rating: int = 5


class TestimonialSubmit(BaseModel):
    # Optional: the form requires both, but the API stays permissive so the existing
    # text+rating-only client (and its regression test) keeps working unchanged.
    name: str | None = Field(None, max_length=80)
    location: str | None = Field(None, max_length=80)
    text: str = Field(..., min_length=10, max_length=2000)
    rating: int = Field(..., ge=1, le=5)


@router.get("/testimonials", response_model=list[TestimonialOut])
async def get_approved_testimonials():
    """Return all approved testimonials (public, no auth required)."""
    def _query():
        db = get_firestore_client()
        return list(
            db.collection("testimonials")
            .where("status", "==", "approved")
            .stream()
        )

    try:
        docs = await run_in_threadpool(_query)
        return [
            TestimonialOut(
                id=doc.id,
                name=((doc.to_dict() or {}).get("name") or "Cliente SYD"),
                location=((doc.to_dict() or {}).get("location") or ""),
                text=((doc.to_dict() or {}).get("text") or ""),
                rating=((doc.to_dict() or {}).get("rating") or 5),
            )
            for doc in docs
        ]
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[testimonials] Firestore query failed: {e}")
        return []


@router.post("/testimonials", status_code=201)
async def submit_testimonial(
    body: TestimonialSubmit,
    user_session: UserSession = Depends(verify_token),
):
    """Submit a testimonial for admin approval (requires auth)."""
    if user_session.is_anonymous:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Login required")

    from google.cloud.firestore import SERVER_TIMESTAMP

    def _write():
        db = get_firestore_client()
        db.collection("testimonials").add({
            "userId": user_session.uid,
            "name": (body.name or "").strip() or user_session.claims.get("name") or "Utente SYD",
            "location": (body.location or "").strip(),
            "text": body.text.strip(),
            "rating": body.rating,
            "createdAt": SERVER_TIMESTAMP,
            "status": "pending",
        })

    try:
        await run_in_threadpool(_write)
        return {"status": "ok", "message": "Recensione inviata. Sarà visibile dopo l'approvazione."}
    except Exception as e:
        logger.error(f"[testimonials] Submit failed: {e}")
        raise HTTPException(status_code=500, detail="Errore durante l'invio della recensione.") from e


# ── Portfolio ────────────────────────────────────────────────────────────────

class PortfolioStats(BaseModel):
    area: str = ""
    duration: str = ""
    budget: str = ""


class PortfolioOut(BaseModel):
    id: str
    title: str
    category: str
    location: str
    # None when the document has no image yet — lets the client render an explicit
    # placeholder instead of handing an empty string to next/image.
    image: str | None
    description: str
    stats: PortfolioStats


@router.get("/portfolio", response_model=list[PortfolioOut])
async def get_portfolio_projects():
    """Return all active portfolio projects (public, no auth required)."""
    def _query():
        db = get_firestore_client()
        return list(
            db.collection("portfolio_projects")
            .where("active", "==", True)
            .order_by("order")
            .stream()
        )

    try:
        docs = await run_in_threadpool(_query)
        results = []
        for doc in docs:
            d = doc.to_dict() or {}
            results.append(PortfolioOut(
                id=doc.id,
                title=d.get("title", ""),
                category=d.get("category", ""),
                location=d.get("location", ""),
                image=d.get("image_url") or None,
                description=d.get("description", ""),
                stats=PortfolioStats(
                    area=d.get("stats", {}).get("area", ""),
                    duration=d.get("stats", {}).get("duration", ""),
                    budget=d.get("stats", {}).get("budget", ""),
                ),
            ))
        if not results:
            logger.info("[portfolio] Query succeeded but no active projects found")
        return results
    except Exception as e:  # noqa: BLE001
        # The exception type matters: FailedPrecondition means the composite index on
        # (active, order) is missing, which is indistinguishable from an empty
        # collection at the HTTP layer — both return [].
        logger.warning(f"[portfolio] Firestore query failed [{type(e).__name__}]: {e}")
        return []
