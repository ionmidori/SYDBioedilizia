import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from src.auth.jwt_handler import verify_token
from src.db.projects import get_user_projects
from src.schemas.gallery import GalleryResponse
from src.schemas.internal import UserSession
from src.services.gallery_service import GalleryService, get_gallery_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.get("/dashboard")
async def get_dashboard_stats(
    user_session: UserSession = Depends(verify_token),
    gallery_service: GalleryService = Depends(get_gallery_service)
):
    """
    Get aggregated statistics for the user dashboard.
    Runs projects count and gallery fetch in parallel for performance.
    """
    try:
        user_id = user_session.uid

        # Parallelise: count projects and fetch all assets concurrently
        projects, gallery = await asyncio.gather(
            get_user_projects(user_id),
            gallery_service.get_all_assets(user_id, limit=500),
            return_exceptions=True,
        )

        # gather(return_exceptions=True) returns exception objects instead of
        # raising, so both sub-calls always run to completion. Re-raise any
        # failure so it surfaces as a 500 (via the outer handler) rather than a
        # misleading 200 with zeroed stats that looks like the user lost data.
        # (Re-raising a CancelledError correctly propagates cancellation — the
        # outer `except Exception` won't swallow it.)
        if isinstance(projects, BaseException):
            raise projects
        if isinstance(gallery, BaseException):
            raise gallery

        active_projects_count = len(projects)

        total_files = 0
        total_renders = 0
        for asset in gallery.assets:
            if asset.type == "render":
                total_renders += 1
            else:
                total_files += 1

        return {
            "activeProjects": active_projects_count,
            "totalFiles": total_files,
            "totalRenders": total_renders,
            "recentActivity": []
        }
    except Exception as e:
        logger.error(f"[Reports] Error fetching dashboard stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Impossibile caricare le statistiche")

@router.get("/gallery", response_model=GalleryResponse)
async def get_gallery_assets(
    limit: int = Query(default=50, ge=1, le=200),
    last_id: str = Query(default=None, max_length=128),
    user_session: UserSession = Depends(verify_token),
    gallery_service: GalleryService = Depends(get_gallery_service)
):

    """
    Get all media assets (files) across all projects for the user.
    Optimized to use default indexes by querying per-project instead of collection_group.
    """
    try:
        user_id = user_session.uid
        return await gallery_service.get_all_assets(user_id, limit, last_id)
    except Exception as e:
        logger.error(f"[Reports] Error fetching gallery: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Impossibile caricare la galleria")

