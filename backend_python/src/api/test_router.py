from fastapi import APIRouter, Depends, HTTPException
from src.auth.jwt_handler import verify_token
from src.schemas.internal import UserSession
from src.core.logger import get_logger
from src.core.config import settings

logger = get_logger(__name__)
router = APIRouter(prefix="/api/test", tags=["test-automation"])

@router.get("/tools/market-prices")
async def test_market_prices(
    query: str = "prezzi ristrutturazione cartongesso",
    user_session: UserSession = Depends(verify_token)
):
    """Exposes market_prices tool for TestSprite TC002."""
    from src.tools.market_prices import get_market_prices_wrapper
    try:
        return await get_market_prices_wrapper(query=query)
    except Exception as e:
        logger.error(f"Test Market Prices failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
# ...
@router.post("/tools/analyze-room")
async def test_analyze_room(
    file: UploadFile = File(...),
    user_session: UserSession = Depends(verify_token)
):
    """Exposes analyze_room tool for TestSprite TC005."""
    from src.vision.triage import analyze_media_triage
    try:
        content = await file.read()
        return await analyze_media_triage(media_data=content, mime_type=file.content_type)
    except Exception as e:
        logger.error(f"Test Analyze Room failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tools/generate-render")
async def test_generate_render(
    payload: dict,
    session_id: str,
    user_session: UserSession = Depends(verify_token)
):
    """Exposes generate_render tool for TestSprite TC003."""
    from src.tools.generate_render import generate_render_wrapper
    try:
        return await generate_render_wrapper(
            prompt=payload.get("prompt", "A modern room"),
            room_type=payload.get("room_type", "living room"),
            style=payload.get("style", "modern"),
            session_id=session_id,
            mode=payload.get("mode", "creation"),
            source_image_url=payload.get("source_image_url"),
            keep_elements=payload.get("keep_elements")
        )
    except Exception as e:
        logger.error(f"Test Generate Render failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tools/plan-renovation")
async def test_plan_renovation(
    project_id: str,
    user_session: UserSession = Depends(verify_token)
):
    """Exposes plan_renovation tool for TestSprite TC006."""
    from src.services.architect import generate_renovation_plan # Correct import?
    try:
        return await generate_renovation_plan(project_id=project_id)
    except Exception as e:
        logger.error(f"Test Plan Renovation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tools/generate-cad")
async def test_generate_cad(
    image_url: str,
    user_session: UserSession = Depends(verify_token)
):
    """Exposes generate_cad tool for TestSprite TC009."""
    from src.vision.cad_engine import CADEngine # Adjust import
    try:
        engine = CADEngine()
        return await engine.generate_dxf(image_url=image_url)
    except Exception as e:
        logger.error(f"Test Generate CAD failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
