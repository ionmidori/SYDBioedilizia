from fastapi import APIRouter, Depends, HTTPException
from src.auth.jwt_handler import verify_token
from src.schemas.internal import UserSession
from src.db.projects import get_user_projects, count_user_projects
import logging
from datetime import datetime, timedelta

from src.services.gallery_service import get_gallery_service, GalleryService

from src.schemas.gallery import GalleryResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.get("/dashboard")
async def get_dashboard_stats(
    user_session: UserSession = Depends(verify_token)
):
    """
    Get aggregated statistics for the user dashboard.
    """
    try:
        user_id = user_session.uid
        
        # Parallelize these if performance is critical (for now sequential is fine)
        projects = await get_user_projects(user_id)
        
        # Filter active (non-draft? For now just all projects)
        active_projects_count = len(projects)
        
        total_files = 0 
        total_renders = 0
        recent_activity = []
        
        return {
            "activeProjects": active_projects_count,
            "totalFiles": total_files,
            "totalRenders": total_renders,
            "recentActivity": recent_activity
        }
    except Exception as e:
        logger.error(f"[Reports] Error fetching dashboard stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Impossibile caricare le statistiche")

@router.get("/gallery", response_model=GalleryResponse)
async def get_gallery_assets(
    limit: int = 50,
    last_id: str = None,
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

