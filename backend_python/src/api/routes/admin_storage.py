import logging
from fastapi import APIRouter, Depends, HTTPException, status
from src.schemas.storage import SignedUrlRequest, SignedUrlResponse
from src.services.storage_service import StorageService, get_storage_service
from src.schemas.internal import UserSession
from src.auth.jwt_handler import verify_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin/storage", tags=["Admin Storage"])

@router.post("/signed-url", response_model=SignedUrlResponse)
async def generate_signed_url(
    request: SignedUrlRequest,
    user_session: UserSession = Depends(verify_token),
    storage_service: StorageService = Depends(get_storage_service)
):
    """
    Generate a direct-to-cloud PUT Signed URL for the Admin Panel.
    Requires an authenticated session.
    """
    if not user_session.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to generate upload URLs."
        )
        
    try:
        response = await storage_service.generate_upload_url(request)
        logger.info(f"Generated signed URL for {request.filename} by user {user_session.uid}")
        return response
    except Exception as e:
        logger.error(f"Failed to generate signed URL: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not generate signed URL."
        )
