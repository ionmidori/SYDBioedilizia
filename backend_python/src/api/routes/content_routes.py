"""
Public Content API — Testimonials & Portfolio.

These endpoints replace direct Firestore reads from the frontend,
enforcing the 3-Tier architecture boundary.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from src.auth.jwt_handler import verify_token
from src.core.logger import get_logger
from src.db.firebase_client import get_firestore_client
from src.schemas.internal import UserSession

logger = get_logger(__name__)
router = APIRouter(prefix="/api/content", tags=["Content"])


# ── Testimonials ─────────────────────────────────────────────────────────────

class TestimonialOut(BaseModel):
    id: str
    name: str
    text: str
    rating: int = 5


class TestimonialSubmit(BaseModel):
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
                name=(doc.to_dict().get("name") or "Cliente SYD"),
                text=(doc.to_dict().get("text") or ""),
                rating=(doc.to_dict().get("rating") or 5),
            )
            for doc in docs
        ]
    except Exception as e:
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
            "name": user_session.display_name or "Utente SYD",
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
        raise HTTPException(status_code=500, detail="Errore durante l'invio della recensione.")


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
    image: str
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
            d = doc.to_dict()
            results.append(PortfolioOut(
                id=doc.id,
                title=d.get("title", ""),
                category=d.get("category", ""),
                location=d.get("location", ""),
                image=d.get("image_url", ""),
                description=d.get("description", ""),
                stats=PortfolioStats(
                    area=d.get("stats", {}).get("area", ""),
                    duration=d.get("stats", {}).get("duration", ""),
                    budget=d.get("stats", {}).get("budget", ""),
                ),
            ))
        return results
    except Exception as e:
        logger.warning(f"[portfolio] Firestore query failed: {e}")
        return []
