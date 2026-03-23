"""
Portfolio Service: orchestrates CRUD + Firebase Storage image uploads.

Upload strategy: Admin SDK direct upload → make_public() → permanent URL.
No signed URLs needed (admin tool runs server-side with full Storage access).

Skill: building-admin-dashboards — §Portfolio Management
Skill: generating-pdf-documents — §Storage Upload Pattern (reuse from PdfService)
"""
import logging
import re
import time
from typing import Any

from firebase_admin import storage as fb_storage
from src.db.firebase_init import init_firebase
from src.db.portfolio_repo import PortfolioRepository

logger = logging.getLogger(__name__)

_STORAGE_FOLDER = "portfolio"
_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


class PortfolioService:
    """Orchestrates portfolio project management including image uploads."""

    def __init__(self) -> None:
        self.repo = PortfolioRepository()

    # ------------------------------------------------------------------
    # READ
    # ------------------------------------------------------------------

    def get_all(self) -> list[dict[str, Any]]:
        """Return all projects sorted by order."""
        return self.repo.get_all()

    # ------------------------------------------------------------------
    # IMAGE UPLOAD
    # ------------------------------------------------------------------

    def upload_image(
        self, file_bytes: bytes, content_type: str, original_name: str
    ) -> str:
        """
        Upload an image to Firebase Storage and return its permanent public URL.

        Args:
            file_bytes:    Raw image bytes from st.file_uploader.
            content_type:  MIME type (e.g. 'image/jpeg').
            original_name: Original filename (sanitized before use).

        Returns:
            Public URL string (permanent, no expiry).

        Raises:
            ValueError: If content_type is not an allowed image type.
        """
        if content_type not in _ALLOWED_TYPES:
            raise ValueError(f"Unsupported content type: {content_type}")

        init_firebase()
        bucket = fb_storage.bucket()

        # Sanitize filename and add timestamp prefix to avoid collisions
        safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", original_name)
        blob_path = f"{_STORAGE_FOLDER}/{int(time.time())}_{safe_name}"

        blob = bucket.blob(blob_path)
        blob.upload_from_string(file_bytes, content_type=content_type)
        blob.make_public()

        logger.info(
            "Portfolio image uploaded.",
            extra={"blob_path": blob_path, "size_kb": len(file_bytes) // 1024},
        )
        return blob.public_url

    def delete_image(self, image_url: str) -> None:
        """
        Delete an image from Firebase Storage given its public URL.
        Silently ignores errors (e.g. already deleted).
        """
        if not image_url or _STORAGE_FOLDER not in image_url:
            return
        try:
            init_firebase()
            bucket = fb_storage.bucket()
            # Extract blob path from URL: .../o/portfolio%2F...
            # public_url format: https://storage.googleapis.com/{bucket}/{path}
            bucket_name = bucket.name
            prefix = f"https://storage.googleapis.com/{bucket_name}/"
            if image_url.startswith(prefix):
                blob_path = image_url[len(prefix):]
                bucket.blob(blob_path).delete()
                logger.info("Portfolio image deleted.", extra={"blob_path": blob_path})
        except Exception:
            logger.warning("Could not delete portfolio image.", extra={"url": image_url})

    # ------------------------------------------------------------------
    # WRITE
    # ------------------------------------------------------------------

    def create(
        self,
        title: str,
        category: str,
        location: str,
        description: str,
        stats: dict[str, str],
        image_url: str,
        active: bool = True,
    ) -> str:
        """Create a new portfolio project. Returns the new document ID."""
        order = self.repo.count() + 1
        return self.repo.create(
            {
                "title": title,
                "category": category,
                "location": location,
                "description": description,
                "stats": stats,
                "image_url": image_url,
                "active": active,
                "order": order,
            }
        )

    def update(self, project_id: str, data: dict[str, Any]) -> None:
        """Update an existing project's metadata (and optionally image_url)."""
        self.repo.update(project_id, data)

    def delete(self, project_id: str, image_url: str = "") -> None:
        """Delete a project from Firestore and its image from Storage."""
        self.delete_image(image_url)
        self.repo.delete(project_id)

    def set_active(self, project_id: str, active: bool) -> None:
        """Toggle a project's visibility on the landing page."""
        self.repo.set_active(project_id, active)
