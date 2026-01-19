import os
import logging
import base64
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any
from google.cloud import storage

logger = logging.getLogger(__name__)

FIREBASE_STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET")

def upload_base64_image(
    base64_data: str,
    session_id: str,
    prefix: str = "renders"
) -> str:
    """
    Upload a base64-encoded image to Firebase Storage and return public URL.
    
    Args:
        base64_data: Base64 encoded image data (with or without data URI prefix)
        session_id: User session ID for organizing uploads
        prefix: Storage path prefix (default: "renders")
        
    Returns:
        Public HTTPS URL to the uploaded image
        
    Raises:
        Exception: If upload fails
    """
    if not FIREBASE_STORAGE_BUCKET:
        raise Exception("FIREBASE_STORAGE_BUCKET not configured")
    
    try:
        # Parse base64 data URL if present
        if base64_data.startswith('data:'):
            # Extract mime type and data
            header, data = base64_data.split(',', 1)
            mime_type = header.split(':')[1].split(';')[0]
            base64_string = data
        else:
            # Assume PNG if no header
            mime_type = 'image/png'
            base64_string = base64_data
        
        # Decode base64
        image_bytes = base64.b64decode(base64_string)
        
        # Validate size (max 10MB)
        max_size = 10 * 1024 * 1024
        if len(image_bytes) > max_size:
            size_mb = len(image_bytes) / 1024 / 1024
            raise Exception(f"Image too large: {size_mb:.2f}MB (max 10MB)")
        
        size_kb = len(image_bytes) / 1024
        logger.info(f"Uploading image: {size_kb:.2f} KB")
        
        # Generate unique filename
        timestamp = int(datetime.now().timestamp() * 1000)
        unique_id = str(uuid.uuid4())[:8]
        extension = mime_type.split('/')[1]
        file_name = f"{prefix}/{session_id}/{timestamp}-{unique_id}.{extension}"
        
        # Upload to Firebase Storage using centralized client
        # ✅ Now uses same credentials as Firestore
        from src.storage.firebase_storage import get_storage_client
        client = get_storage_client()
        bucket = client.bucket(FIREBASE_STORAGE_BUCKET)
        blob = bucket.blob(file_name)
        
        blob.upload_from_string(
            image_bytes,
            content_type=mime_type
        )
        
        # Use Signed URLs instead of make_public (works with Uniform Bucket Access)
        # Valid for 7 days - ample time for user session and AI processing
        public_url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(days=7),
            method="GET"
        )
        
        # Redact signature from logs
        safe_log_url = public_url.split("?")[0] + "?[REDACTED]"
        logger.info(f"Upload complete: {safe_log_url}")
        return public_url
        
    except Exception as e:
        logger.error(f"Upload failed: {str(e)}", exc_info=True)
        raise Exception(f"Failed to upload image: {str(e)}")
