import asyncio
import logging
from typing import BinaryIO, Optional, IO
from google import genai
from google.genai import types

from src.core.config import settings

logger = logging.getLogger(__name__)

class VideoProcessingError(Exception):
    """Base exception for video processing errors."""
    pass

class MediaProcessor:
    """
    Service for handling media uploads and processing with Google Gemini API.
    Handles lifecycle, polling, and error mapping.
    """
    
    def __init__(self):
        # Initialize the client. 
        # Note: We use the async client features (aio) provided by the SDK.
        self.api_key = settings.GEMINI_API_KEY
        if not self.api_key:
             raise RuntimeError("GEMINI_API_KEY is not set in configuration.")
             
        self.client = genai.Client(api_key=self.api_key, http_options={'api_version': 'v1beta'})

    def __del__(self):
        # Best effort cleanup
        try:
            self.client.close()
        except Exception:
            pass

    async def upload_video_for_analysis(self, file_stream: IO[bytes], mime_type: str, display_name: str) -> types.File:
        """
        Uploads a video stream to Google File API.
        
        Args:
            file_stream: The binary stream of the video file.
            mime_type: The MIME type of the video.
            display_name: The display name for the file.
            
        Returns:
            The uploaded file object from the SDK.
            
        Raises:
            VideoProcessingError: If upload fails.
        """
        try:
            logger.info(f"📤 Starting upload for: {display_name} ({mime_type})")
            
            # Using the SDK's async upload interface
            # The SDK handles reading from the stream.
            uploaded_file = await self.client.aio.files.upload(
                file=file_stream,
                config=types.UploadFileConfig(
                    display_name=display_name,
                    mime_type=mime_type
                )
            )
            
            logger.info(f"✅ Upload succeeded: {uploaded_file.uri} (State: {uploaded_file.state})")
            return uploaded_file
            
        except Exception as e:
            logger.error(f"❌ Upload failed: {str(e)}", exc_info=True)
            raise VideoProcessingError(f"Video upload failed: {str(e)}")

    async def wait_for_processing(self, file_name: str, timeout_seconds: int = 30) -> types.File:
        """
        Polls the file status until it is ACTIVE or fails.
        Non-blocking polling using asyncio.sleep.
        
        Args:
            file_name: The unique resource name of the file (e.g. 'files/123...')
            timeout_seconds: Max time to wait.
            
        Returns:
            The refreshed file object in ACTIVE state.
            
        Raises:
            VideoProcessingError: If processing fails or times out.
        """
        start_time = asyncio.get_running_loop().time()
        
        while (asyncio.get_running_loop().time() - start_time) < timeout_seconds:
            try:
                # Fetch fresh file status
                file_obj = await self.client.aio.files.get(name=file_name)
                
                # Use .name to safely compare Enum or String
                state_name = getattr(file_obj.state, "name", str(file_obj.state))
                
                if state_name == "ACTIVE":
                    logger.info(f"✅ Video processing complete: {file_name}")
                    return file_obj
                
                if state_name == "FAILED":
                    raise VideoProcessingError(f"Video processing failed on remote server. State: {state_name}")
                
                # Still processing
                # logger.debug(f"⏳ Processing... ({file_obj.state})") # Optional debug
                await asyncio.sleep(1.0) # Non-blocking wait
                
            except VideoProcessingError:
                raise
            except Exception as e:
                logger.warning(f"⚠️ Error during polling (retrying): {str(e)}")
                await asyncio.sleep(1.0)

        raise VideoProcessingError(f"Processing timed out after {timeout_seconds} seconds.")

# Dependency Injection Helper
def get_media_processor() -> MediaProcessor:
    """
    Factory function for Dependency Injection.
    """
    return MediaProcessor()
