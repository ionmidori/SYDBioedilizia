
import logging
import httpx
import re
import mimetypes
from urllib.parse import unquote
import firebase_admin
from firebase_admin import storage

logger = logging.getLogger(__name__)

async def download_image_smart(url: str, timeout: float = 30.0) -> tuple[bytes, str]:
    """
    Download image from URL using the most robust method available.
    
    Strategy:
    1. If URL is from Firebase Storage (internal), use Admin SDK to bypass public access rules.
    2. Fallback to standard HTTP GET with retries and user-agent.
    
    Args:
        url: The image URL.
        timeout: Timeout in seconds for HTTP requests.
        
    Returns:
        tuple: (file_bytes, mime_type)
        
    Raises:
        Exception: If download fails after all attempts.
    """
    logger.info(f"[SmartDownload] 📥 Requested download for: {url[:100]}...")
    
    # -------------------------------------------------------------------------
    # STRATEGY 1: Internal Firebase Admin SDK (The "VIP Pass")
    # -------------------------------------------------------------------------
    # Regex to capture bucket and path from standard Firebase/GCS URLs
    # Matches:
    # - https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?...
    # - https://storage.googleapis.com/<bucket>/<path>
    
    # 1. client: firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>
    # 2. signed: storage.googleapis.com/<bucket>/<path>
    firebase_pattern = r"https?://(?:firebasestorage\.googleapis\.com/v0/b|storage\.googleapis\.com)/([^/]+)(?:/o/|/)(.+?)(?:\?|$)"
    
    # -------------------------------------------------------------------------
    # STRATEGY 0: Check for Gemini File API / Internal URIs (Pass-through)
    # -------------------------------------------------------------------------
    if url.startswith("https://generativelanguage.googleapis.com") or url.startswith("files/"):
        logger.info(f"[SmartDownload] ⏩ Identified Gemini File API URI. Skipping download.")
        # Return the URI as encoded bytes, with special MIME type
        return url.encode("utf-8"), "application/vnd.google-apps.file"

    match = re.match(firebase_pattern, url)
    
    if match:
        bucket_name = match.group(1)
        encoded_path = match.group(2)
        blob_path = unquote(encoded_path) # Decode URL-encoded characters (e.g. %2F -> /)
        
        logger.info(f"[SmartDownload] 🕵️ Detected Firebase Storage URL.")
        logger.info(f"  - Bucket: {bucket_name}")
        logger.info(f"  - Path: {blob_path}")
        
        try:
            logger.info("[SmartDownload] ⚡ Attempting direct bucket access via Admin SDK...")
            bucket = storage.bucket(bucket_name)
            blob = bucket.blob(blob_path)
            
            # Download as bytes
            file_bytes = blob.download_as_bytes()
            content_type = blob.content_type or mimetypes.guess_type(blob_path)[0] or "image/jpeg"
            
            logger.info(f"[SmartDownload] ✅ Direct access SUCCESS: {len(file_bytes)} bytes, Type: {content_type}")
            return file_bytes, content_type
            
        except Exception as e:
            logger.warning(f"[SmartDownload] ⚠️ Direct access failed (will fallback to HTTP): {e}")
            # Continue to Strategy 2
            
    # -------------------------------------------------------------------------
    # STRATEGY 2: Standard HTTP GET (The "Public Entrance")
    # -------------------------------------------------------------------------
    logger.info("[SmartDownload] 🌐 Attempting HTTP download...")
    
    headers = {
        "User-Agent": "RenovationAI-Backend/1.0",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8"
    }
    
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            
            file_bytes = resp.content
            content_type = resp.headers.get("content-type")
            
            # Validate content is actually media
            if not content_type or (not content_type.startswith("image/") and not content_type.startswith("video/")):
                 # Helper to guess if header is missing
                 guessed_type, _ = mimetypes.guess_type(url)
                 content_type = guessed_type or "application/octet-stream"
                 logger.warning(f"[SmartDownload] ⚠️ Response content-type '{resp.headers.get('content-type')}' suspicious. Fallback guess: {content_type}")

            logger.info(f"[SmartDownload] ✅ HTTP download SUCCESS: {len(file_bytes)} bytes, Type: {content_type}")
            return file_bytes, content_type
            
        except Exception as e:
            logger.error(f"[SmartDownload] ❌ HTTP download failed: {e}")
            raise Exception(f"Failed to download image: {str(e)}")
