"""
verify_n8n_webhook: FastAPI dependency for validating inbound n8n webhook requests.

Validates HMAC-SHA256 signature using the same signing formula used by n8n_mcp_tools.py
for outbound requests:
    HMAC-SHA256(N8N_WEBHOOK_HMAC_SECRET, f"{timestamp}.{raw_body_str}")
    Header value format: "sha256={hex_signature}"

Security properties:
- Fail-secure: if N8N_WEBHOOK_HMAC_SECRET is not set -> 503 (not 200)
- Replay protection: reject requests with |now - timestamp| > 300 seconds
- Constant-time comparison: hmac.compare_digest() prevents timing attacks
- Optional API key header validation for additional auth layer
"""

import hashlib
import hmac
import json
import logging
import time

from fastapi import HTTPException, Request, status

from src.core.config import settings

logger = logging.getLogger(__name__)


async def verify_n8n_webhook(request: Request) -> dict:
    """
    FastAPI dependency that validates inbound n8n webhook HMAC-SHA256 signatures.

    Returns the parsed JSON body on success.
    Raises HTTPException on any validation failure.
    """
    body_bytes = await request.body()
    body_str = body_bytes.decode("utf-8")

    # 1. Extract required headers
    timestamp = request.headers.get("X-N8N-Timestamp")
    if not timestamp:
        logger.warning("[n8n webhook] Missing timestamp header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing timestamp header",
        )

    signature = request.headers.get("X-N8N-Signature")
    if not signature:
        logger.warning("[n8n webhook] Missing signature header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing signature header",
        )

    # 2. Fail-secure: secret must be configured
    secret = settings.N8N_WEBHOOK_HMAC_SECRET
    if secret is None:
        logger.warning("[n8n webhook] HMAC secret not configured — rejecting request")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook authentication not configured",
        )

    # 3. Validate timestamp format and replay window
    try:
        ts_int = int(timestamp)
    except ValueError:
        logger.warning(
            "[n8n webhook] Invalid timestamp format, sig=%s",
            signature[:12],
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid timestamp format",
        )

    if abs(time.time() - ts_int) > 300:
        logger.warning(
            "[n8n webhook] Request expired, ts=%s sig=%s",
            timestamp,
            signature[:12],
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Request expired",
        )

    # 4. Compute and compare HMAC
    msg = f"{timestamp}.{body_str}"
    expected = "sha256=" + hmac.new(
        secret.encode(), msg.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected, signature):
        logger.warning(
            "[n8n webhook] Invalid signature, sig=%s",
            signature[:12],
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid signature",
        )

    # 5. Optional API key validation (constant-time comparison)
    if settings.N8N_API_KEY is not None:
        api_key = request.headers.get("X-N8N-API-KEY")
        if not api_key or not hmac.compare_digest(api_key.encode(), settings.N8N_API_KEY.encode()):
            logger.warning("[n8n webhook] Invalid or missing API key")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key",
            )

    # 6. Parse JSON body
    try:
        payload = json.loads(body_str)
    except (json.JSONDecodeError, ValueError):
        logger.warning("[n8n webhook] Invalid JSON payload, sig=%s", signature[:12])
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )

    return payload
