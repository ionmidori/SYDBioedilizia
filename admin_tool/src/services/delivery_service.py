"""
Delivery Service: triggers n8n webhook to deliver an approved quote.

Skill: n8n-mcp-integration
Pattern: httpx sync POST + tenacity exponential backoff.

NOTE: Synchronous (not async) — Streamlit runs in a sync context and has its
own event loop. Using httpx.Client avoids asyncio.new_event_loop() conflicts.
"""
import os
import logging
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)

_N8N_TIMEOUT = 15.0  # seconds


class DeliveryService:
    """Triggers n8n webhook to deliver an approved quote to the client."""

    def __init__(self) -> None:
        self.webhook_url: str = os.getenv("N8N_WEBHOOK_DELIVER_QUOTE", "")

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPStatusError),
        reraise=True,
    )
    def deliver_quote(
        self,
        project_id: str,
        pdf_url: str,
        client_data: dict[str, str],
        quote_total: float = 0.0,
    ) -> bool:
        """
        Trigger n8n webhook (Mode A: FastAPI → n8n).

        Payload schema matches SKILL.md §n8n Workflow: Deliver Quote.
        Synchronous — uses httpx.Client to avoid event loop conflicts in Streamlit.

        Args:
            project_id: Firestore project ID.
            pdf_url: Signed GCS URL for the generated PDF.
            client_data: Dict with 'email', 'name', and 'address'.
            quote_total: Grand total (€) for n8n display.

        Returns:
            True on success.

        Raises:
            httpx.HTTPStatusError: after 3 retries.
        """
        if not self.webhook_url:
            logger.warning(
                "N8N_WEBHOOK_DELIVER_QUOTE not set. Mocking delivery.",
                extra={"project_id": project_id, "pdf_url": pdf_url},
            )
            return True

        payload: dict = {
            "event": "quote_approved_deliver",
            "project_id": project_id,
            "client_email": client_data.get("email", ""),
            "client_name": client_data.get("name", ""),
            "client_address": client_data.get("address", ""),
            "pdf_url": pdf_url,
            "quote_total": quote_total,
            "delivery_channel": "email",
        }

        with httpx.Client(timeout=_N8N_TIMEOUT) as client:
            response = client.post(self.webhook_url, json=payload)
            response.raise_for_status()

        logger.info("Quote delivered via n8n.", extra={"project_id": project_id})
        return True
