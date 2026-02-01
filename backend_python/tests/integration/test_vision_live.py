import pytest
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from backend_python/.env
env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(env_path)

from src.vision.triage import analyze_image_triage
from src.vision.video_triage import analyze_video_with_gemini

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Test Assets - Relative to backend_python root
WEB_CLIENT_PATH = Path("../web_client/public").resolve()
IMAGE_ASSET = WEB_CLIENT_PATH / "slides" / "slide-1.jpg"
VIDEO_ASSET = WEB_CLIENT_PATH / "videos" / "ai-interior-design.mp4"

@pytest.mark.integration
@pytest.mark.asyncio
class TestVisionLive:
    """
    Live integration tests for Agentic Vision.
    REQUIRES: GEMINI_API_KEY environment variable.
    COSTS: Consumes API credits/quota.
    """

    async def test_live_image_agentic_vision(self):
        """
        Verifies that analyze_image_triage works with a real image
        and returns a valid structural analysis.
        """
        logger.info(f"Testing live image triage with: {IMAGE_ASSET}")
        
        if not IMAGE_ASSET.exists():
            pytest.skip(f"Test asset not found: {IMAGE_ASSET}")
            
        # Read image bytes
        with open(IMAGE_ASSET, "rb") as f:
            image_data = f.read()
            
        # Execute Live API Call
        result = await analyze_image_triage(image_data)
        
        logger.info(f"Live Image Result: {result}")
        
        # Verify Structure
        assert isinstance(result, dict)
        assert "roomType" in result
        assert "renovationNotes" in result
        # Verify Agentic Vision "Thought" likely happened (implicit in successful JSON parse)
        assert result["roomType"] is not None

    async def test_live_video_agentic_vision(self):
        """
        Verifies that analyze_video_with_gemini works with a real video
        using the targeted frame analysis strategy.
        """
        logger.info(f"Testing live video triage with: {VIDEO_ASSET}")
        
        if not VIDEO_ASSET.exists():
            pytest.skip(f"Test asset not found: {VIDEO_ASSET}")
            
        # Execute Live API Call (Pass absolute path string as expected by function)
        result = await analyze_video_with_gemini(str(VIDEO_ASSET))
        
        logger.info(f"Live Video Result: {result}")
        
        # Verify Structure
        assert isinstance(result, dict)
        assert "roomType" in result
        assert "renovationNotes" in result
        if "audioTranscript" in result:
             logger.info(f"Audio Transcript detected: {result['audioTranscript']}")
