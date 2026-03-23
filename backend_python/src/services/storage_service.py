import datetime
import urllib.parse
from typing import Dict, Any
from firebase_admin import storage
from src.core.config import settings
from src.schemas.storage import SignedUrlRequest, SignedUrlResponse

class StorageService:
    """
    Tier 3 Service handling Google Cloud Storage interactions via Firebase Admin SDK.
    """
    def __init__(self):
        self.bucket_name = settings.FIREBASE_STORAGE_BUCKET
        if not self.bucket_name:
            raise ValueError("FIREBASE_STORAGE_BUCKET is not configured.")
        try:
            self.bucket = storage.bucket(self.bucket_name)
        except Exception as e:
            raise RuntimeError(f"Failed to initialize Firebase Storage bucket: {e}")

    async def generate_upload_url(self, request: SignedUrlRequest) -> SignedUrlResponse:
        """
        Generates a V4 Signed URL for direct-to-cloud PUT uploads.
        We do this synchronously as it only involves local crypto logic
        and does not block the event loop (no network requests made by SDK).
        """
        # Ensure safe filenames and avoid collisions
        timestamp = int(datetime.datetime.now().timestamp() * 1000)
        safe_name = request.filename.replace(" ", "_").replace("/", "_")
        blob_path = f"{request.folder}/{timestamp}_{safe_name}"
        
        blob = self.bucket.blob(blob_path)
        
        # Generate PUT signed URL
        url = blob.generate_signed_url(
            version="v4",
            expiration=datetime.timedelta(minutes=15),
            method="PUT",
            content_type=request.content_type,
        )
        
        # Build standard public URL for Firebase Storage
        encoded_path = urllib.parse.quote(blob_path, safe='')
        public_url = f"https://firebasestorage.googleapis.com/v0/b/{self.bucket_name}/o/{encoded_path}?alt=media"
        
        return SignedUrlResponse(
            upload_url=url,
            public_url=public_url,
            path=blob_path
        )


def get_storage_service() -> StorageService:
    return StorageService()
