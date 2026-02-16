from fastapi import APIRouter, Depends, HTTPException
from src.auth.jwt_handler import verify_token
from src.schemas.internal import UserSession
from src.db.projects import get_user_projects, count_user_projects
import logging
from datetime import datetime, timedelta

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
        
        # Files/Renders counting would require a DB query for files
        # For MVP, we'll return placeholders or basic counts if we can't easily get them
        # TODO: Add get_user_files_count to db/projects.py
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
@router.get("/gallery")
async def get_gallery_assets(
    limit: int = 50,
    last_id: str = None,
    user_session: UserSession = Depends(verify_token)
):
    """
    Get all media assets (files) across all projects for the user.
    Optimized to use default indexes by querying per-project instead of collection_group.
    """
    try:
        user_id = user_session.uid
        from src.db.projects import get_user_projects
        
        # 1. Get all user projects
        projects = await get_user_projects(user_id)
        
        # 2. Fetch files for each project
        from src.db.firebase_client import get_firestore_client
        from firebase_admin import firestore
        db = get_firestore_client()
        
        all_files = []
        
        # Parallel fetch could be better, but sequential is safer for now
        for project in projects:
            p_id = project.session_id
            try:
                # Subcollection query - uses default indexes!
                files_ref = db.collection('projects').document(p_id).collection('files')
                # Order by uploadedAt desc at the project level is supported by default
                p_files = files_ref.order_by('uploadedAt', direction=firestore.Query.DESCENDING).limit(limit).stream()
                
                for doc in p_files:
                    data = doc.to_dict()
                    # Handle Timestamp serialization safely
                    uploaded_at = data.get("uploadedAt")
                    timestamp_dt = None
                    if uploaded_at:
                        # Convert Firestore Timestamp to Python datetime
                        # Firestore Admin SDK returns datetime objects with timezone usually
                        timestamp_dt = uploaded_at
                    
                    all_files.append({
                        "id": doc.id,
                        "type": "quote" if data.get("type") == "document" else data.get("type", "unknown"),
                        "url": data.get("url"),
                        "thumbnail": data.get("preview") or (data.get("url") if data.get("type") == "image" else None),
                        "title": data.get("name"),
                        "createdAt": timestamp_dt, # Keep as object for sorting
                        "timestamp": timestamp_dt, # Keep as object for sorting
                        "metadata": {
                            "size": data.get("size"),
                            "uploadedBy": data.get("uploadedBy"),
                            "projectId": p_id,
                            "projectName": project.title # Add project name here to save frontend lookup
                        }
                    })
            except Exception as e:
                logger.warning(f"[Reports] Error fetching files for project {p_id}: {e}")
                continue
        
        # 3. In-memory Sort (Global sort across projects)
        # Handle None timestamps by treating them as old (0)
        all_files.sort(
            key=lambda x: x["timestamp"].timestamp() if x["timestamp"] else 0, 
            reverse=True
        )
        
        # 4. Pagination Slice
        paginated_assets = all_files[:limit]
        
        # 5. Serialize for JSON response
        # Convert datetime objects to ISO strings
        json_assets = []
        for asset in paginated_assets:
            asset_copy = asset.copy()
            if asset_copy["timestamp"]:
                asset_copy["timestamp"] = asset_copy["timestamp"].isoformat()
            if asset_copy["createdAt"]:
                asset_copy["createdAt"] = asset_copy["createdAt"].isoformat()
            json_assets.append(asset_copy)
            
        return {
            "assets": json_assets,
            "hasMore": len(all_files) > limit,
            "lastVisibleId": paginated_assets[-1]["id"] if paginated_assets else None
        }

    except Exception as e:
        logger.error(f"[Reports] Error fetching gallery: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Impossibile caricare la galleria")
