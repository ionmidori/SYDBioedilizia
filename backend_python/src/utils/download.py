
import ipaddress
import logging
import mimetypes
from urllib.parse import unquote, urljoin, urlparse, urlunparse

import httpx
from firebase_admin import storage
from src.core.config import settings
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

# SSRF Protection: only these hosts are allowed for external HTTP fetches
_ALLOWED_DOWNLOAD_HOSTS = frozenset({
    "firebasestorage.googleapis.com",
    "storage.googleapis.com",
    "replicate.delivery",
    "generativelanguage.googleapis.com",
})

_BLOCKED_HOSTS = frozenset({
    "metadata.google.internal",
    "169.254.169.254",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
})

_GEMINI_FILE_HOST = "generativelanguage.googleapis.com"

# Firebase/GCS URL host prefixes handled by the Admin SDK fast-path
_FIREBASE_CLIENT_HOST = "firebasestorage.googleapis.com"
_GCS_SIGNED_HOST = "storage.googleapis.com"

# Cap on redirect hops we are willing to follow while re-validating each target.
_MAX_REDIRECTS = 3
_REDIRECT_STATUS = frozenset({301, 302, 303, 307, 308})
# Cap on downloaded body size (bytes) to avoid resource exhaustion.
_MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


def is_gemini_file_uri(value: str) -> bool:
    """True if `value` is a Gemini File API URI (native file reference, not a fetchable image).

    Uses exact hostname matching (not substring/startswith) so lookalike hosts
    such as ``generativelanguage.googleapis.com.evil.tld`` are rejected. Also
    accepts the bare ``files/...`` relative form the SDK emits.
    """
    if value.startswith("files/"):
        return True
    try:
        return urlparse(value).hostname == _GEMINI_FILE_HOST
    except ValueError:
        return False


def _allowed_download_hosts() -> frozenset[str]:
    """Static allowlist plus the dynamically configured storage bucket."""
    bucket = settings.FIREBASE_STORAGE_BUCKET or ""
    if bucket:
        return _ALLOWED_DOWNLOAD_HOSTS | {bucket}
    return _ALLOWED_DOWNLOAD_HOSTS


def _validate_url_for_ssrf(url: str) -> None:
    """Block SSRF targets: cloud metadata, internal IPs, localhost, non-allowlisted hosts."""
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()

    if not parsed.scheme or parsed.scheme not in ("http", "https"):
        raise ValueError(f"Blocked URL scheme: {parsed.scheme}")

    if not hostname:
        raise ValueError("Blocked URL with no hostname")

    if hostname in _BLOCKED_HOSTS:
        raise ValueError(f"Blocked SSRF target: {hostname}")

    # Block private/link-local/reserved IP literals. Parsing failure just means
    # the hostname is a DNS name — fall through to the allowlist check below.
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        ip = None
    if ip is not None and (
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast
    ):
        raise ValueError(f"Blocked private/reserved IP: {ip}")

    if hostname not in _allowed_download_hosts():
        raise ValueError(f"URL host '{hostname}' not in download allowlist")


def _build_allowlisted_request_url(url: str) -> str:
    """Return a request URL whose host is a **constant** drawn from the allowlist.

    After validating the parsed hostname against the allowlist, the outbound URL
    is rebuilt using the matched allowlist constant as the netloc — not the raw
    user-supplied host. This both (a) guarantees the request can only ever reach
    an allowlisted host even if httpx and urlparse disagree on parsing, and
    (b) breaks the host-taint so static analysis no longer sees a fully
    attacker-controlled request URL (CodeQL py/full-ssrf). Scheme is pinned to
    https; any user-supplied port is dropped.

    Raises ValueError if the host is not allowlisted (or the URL is malformed).
    """
    _validate_url_for_ssrf(url)
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()

    # Pick the canonical host from the allowlist constant. `matched` is sourced
    # from the allowlist set, so the rebuilt URL's host is not user-controlled.
    matched = next((h for h in _allowed_download_hosts() if h == hostname), None)
    if matched is None:
        raise ValueError(f"URL host '{hostname}' not in download allowlist")

    return urlunparse(("https", matched, parsed.path, parsed.params, parsed.query, ""))


def _parse_firebase_url(url: str) -> tuple[str, str] | None:
    """Extract (bucket, object_path) from a Firebase/GCS URL, or None if not one.

    Replaces the previous backtracking regex (ReDoS-prone) with structural
    urlparse-based parsing.

    Supported shapes:
      - https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?...
      - https://storage.googleapis.com/<bucket>/<path>
    """
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    # Strip leading slash, drop query implicitly (urlparse already split it off).
    segments = [s for s in parsed.path.split("/") if s]

    if host == _FIREBASE_CLIENT_HOST:
        # /v0/b/<bucket>/o/<path...>
        if len(segments) >= 5 and segments[0] == "v0" and segments[1] == "b" and segments[3] == "o":
            bucket = segments[2]
            encoded_path = "/".join(segments[4:])
            return bucket, unquote(encoded_path)
        return None

    if host == _GCS_SIGNED_HOST:
        # /<bucket>/<path...>
        if len(segments) >= 2:
            bucket = segments[0]
            return bucket, unquote("/".join(segments[1:]))
        return None

    return None


async def download_image_smart(url: str, timeout: float = 30.0) -> tuple[bytes, str]:
    """
    Download image from URL using the most robust method available.

    Strategy:
    1. If URL is from Firebase Storage (internal), use Admin SDK to bypass public access rules.
    2. Fallback to standard HTTP GET with retries and user-agent (SSRF-protected).

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
    # STRATEGY 0: Gemini File API / internal URIs (pass-through, nothing to fetch)
    # -------------------------------------------------------------------------
    if is_gemini_file_uri(url):
        logger.info("[SmartDownload] ⏩ Identified Gemini File API URI. Skipping download.")
        return url.encode("utf-8"), "application/vnd.google-apps.file"

    # -------------------------------------------------------------------------
    # STRATEGY 1: Internal Firebase Admin SDK (The "VIP Pass")
    # -------------------------------------------------------------------------
    # _parse_firebase_url only returns a match when the host is exactly one of
    # the two Google Storage hosts, so the bucket reached here is always accessed
    # through the GCS Admin SDK (not an SSRF-style HTTP request to an arbitrary host).
    firebase_parts = _parse_firebase_url(url)
    if firebase_parts:
        bucket_name, blob_path = firebase_parts

        logger.info("[SmartDownload] 🕵️ Detected Firebase Storage URL.")
        logger.info(f"  - Bucket: {bucket_name}")
        logger.info(f"  - Path: {blob_path}")
        try:
            logger.info("[SmartDownload] ⚡ Attempting direct bucket access via Admin SDK...")
            bucket = storage.bucket(bucket_name)
            blob = bucket.blob(blob_path)

            # Sync GCS SDK call, offloaded so it can't block the event loop
            file_bytes = await run_in_threadpool(blob.download_as_bytes)
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
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
    }

    # follow_redirects is disabled so we can re-validate every hop against the
    # SSRF allowlist — a redirect from an allowlisted host to an internal IP
    # would otherwise bypass the guard.
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        current_url = url
        try:
            for _ in range(_MAX_REDIRECTS + 1):
                # Validate and rebuild with an allowlisted constant host, so the
                # request can only reach an allowlisted host (redirects included).
                safe_url = _build_allowlisted_request_url(current_url)
                resp = await client.get(safe_url, headers=headers)

                if resp.status_code in _REDIRECT_STATUS:
                    location = resp.headers.get("location")
                    if not location:
                        raise Exception("Redirect response without Location header")
                    current_url = urljoin(current_url, location)
                    continue

                resp.raise_for_status()

                file_bytes = resp.content
                if len(file_bytes) > _MAX_DOWNLOAD_BYTES:
                    raise Exception(f"Downloaded body exceeds size cap ({len(file_bytes)} bytes)")

                content_type = resp.headers.get("content-type")
                if not content_type or (
                    not content_type.startswith("image/") and not content_type.startswith("video/")
                ):
                    guessed_type, _ = mimetypes.guess_type(current_url)
                    content_type = guessed_type or "application/octet-stream"
                    logger.warning(
                        f"[SmartDownload] ⚠️ Response content-type "
                        f"'{resp.headers.get('content-type')}' suspicious. Fallback guess: {content_type}"
                    )

                logger.info(f"[SmartDownload] ✅ HTTP download SUCCESS: {len(file_bytes)} bytes, Type: {content_type}")
                return file_bytes, content_type

            raise Exception(f"Too many redirects (>{_MAX_REDIRECTS})")

        except Exception as e:
            logger.error(f"[SmartDownload] ❌ HTTP download failed: {e}")
            raise Exception(f"Failed to download image: {str(e)}")
