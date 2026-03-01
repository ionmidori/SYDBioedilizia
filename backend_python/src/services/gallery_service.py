from typing import List, Optional
from datetime import datetime
import asyncio
import logging
from src.db.firebase_client import get_async_firestore_client
from src.utils.serialization import parse_firestore_datetime
from src.db.projects import get_user_projects
from src.schemas.gallery import GalleryAsset, GalleryAssetMetadata, GalleryResponse

logger = logging.getLogger(__name__)

class GalleryService:
    def __init__(self):
        self.db = get_async_firestore_client()

    async def get_all_assets(self, user_id: str, limit: int = 50, last_id: str = None) -> GalleryResponse:
        """
        Business logic for fetching and orchestrating gallery assets across projects.
        """
        # 1. Get all user projects
        projects = await get_user_projects(user_id)
        
        all_files: List[GalleryAsset] = []
        
        async def fetch_project_files(project):
            p_id = project.session_id
            p_files = []
            try:
                # Subcollection query
                files_ref = self.db.collection('projects').document(p_id).collection('files')
                docs = files_ref.order_by('uploadedAt', direction="DESCENDING").limit(limit).stream()
                
                async for doc in docs:
                    data = doc.to_dict()
                    timestamp_dt = parse_firestore_datetime(data.get("uploadedAt"))
                    
                    if not timestamp_dt:
                        # Fallback for missing timestamps
                        timestamp_dt = datetime.now()

                    p_files.append(GalleryAsset(
                        id=doc.id,
                        type="quote" if data.get("type") == "document" else data.get("type", "unknown"),
                        url=data.get("url"),
                        thumbnail=data.get("preview") or (data.get("url") if data.get("type") == "image" else None),
                        title=data.get("name"),
                        createdAt=timestamp_dt,
                        timestamp=timestamp_dt,
                        metadata=GalleryAssetMetadata(
                            size=data.get("size"),
                            uploadedBy=data.get("uploadedBy"),
                            projectId=p_id,
                            projectName=project.title
                        )
                    ))
            except Exception as e:
                logger.warning(f"[GalleryService] Error fetching files for project {p_id}: {e}")
            return p_files

        # Execute all fetches concurrently
        results = await asyncio.gather(*(fetch_project_files(p) for p in projects))
        for res in results:
            all_files.extend(res)
        
        # 3. In-memory Sort (Global sort across projects)
        all_files.sort(
            key=lambda x: x.timestamp.timestamp() if x.timestamp else 0, 
            reverse=True
        )
        
        # 4. Pagination Slice
        start_idx = 0
        if last_id:
            for i, asset in enumerate(all_files):
                if asset.id == last_id:
                    start_idx = i + 1
                    break
        
        paginated_assets = all_files[start_idx:start_idx + limit]
        
        return GalleryResponse(
            assets=paginated_assets,
            hasMore=start_idx + limit < len(all_files),
            lastVisibleId=paginated_assets[-1].id if paginated_assets else None
        )


def get_gallery_service() -> GalleryService:
    return GalleryService()
