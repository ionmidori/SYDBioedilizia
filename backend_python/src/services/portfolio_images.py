"""
Portfolio image processing and storage (Phase 128, Fase 6.2b).

An admin uploads a photo for the public gallery. The server — not the browser —
decides what is stored:

* the bytes must really be an image (magic bytes are checked by the route, Pillow
  has to decode it here), within a pixel budget (decompression-bomb guard);
* it is re-encoded as WebP, scaled down to 1920 px on the long side, with the
  EXIF orientation applied and ALL metadata dropped — a phone photo carries the
  GPS position of the building, which must never reach a public website;
* it is stored as `portfolio/<ms>_<random>.webp` with a long immutable cache
  (the name changes whenever the picture does).
"""
from __future__ import annotations

import io
import logging
import secrets
import time
from urllib.parse import quote

from firebase_admin import storage
from PIL import Image, ImageOps, UnidentifiedImageError

from src.core.exceptions import AppException

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_SIDE = 1920
WEBP_QUALITY = 85
FOLDER = "portfolio"


class InvalidImageError(AppException):
    status_code = 422
    error_code = "INVALID_IMAGE"

    def __init__(self, reason: str) -> None:
        super().__init__(message=f"The file is not a usable image: {reason}")


def process_image(raw: bytes) -> tuple[bytes, int, int]:
    """Decode, normalise and re-encode. Returns (webp bytes, width, height). CPU-bound: run in a thread."""
    try:
        image = Image.open(io.BytesIO(raw))
        width, height = image.size
        if width * height > MAX_PIXELS:
            raise InvalidImageError(f"too many pixels ({width}x{height})")
        image.load()
    except InvalidImageError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError) as exc:
        raise InvalidImageError(type(exc).__name__) from exc

    image = ImageOps.exif_transpose(image) or image
    image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    image = image.convert("RGBA" if has_alpha else "RGB")

    out = io.BytesIO()
    image.save(out, format="WEBP", quality=WEBP_QUALITY, method=4)  # no exif/icc passed: metadata is dropped
    return out.getvalue(), image.width, image.height


def new_blob_path() -> str:
    return f"{FOLDER}/{int(time.time() * 1000)}_{secrets.token_hex(4)}.webp"


def public_url(bucket_name: str, blob_path: str) -> str:
    """The Firebase download URL; readable by anyone thanks to the `portfolio/` storage rule."""
    return f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/{quote(blob_path, safe='')}?alt=media"


def upload_sync(blob_path: str, data: bytes) -> None:
    blob = storage.bucket().blob(blob_path)
    blob.cache_control = "public, max-age=31536000, immutable"
    blob.upload_from_string(data, content_type="image/webp")
