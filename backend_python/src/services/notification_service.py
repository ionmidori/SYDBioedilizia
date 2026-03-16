"""
NotificationService: Native email notifications with n8n webhook fallback.

Replaces n8n as primary notification channel when n8n hosting is unavailable.
Fallback chain: n8n webhook (if configured) → SMTP email → Firestore flag + structured log.

Pattern: Service Layer (no HTTP logic, pure domain behavior).
"""
import asyncio
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import aiosmtplib

from src.core.config import settings
from src.db.firebase_client import get_async_firestore_client
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Native notification service for the quote pipeline.

    Delivery chain (tries in order, stops at first success):
    1. n8n webhook — if N8N_WEBHOOK_NOTIFY_ADMIN / N8N_WEBHOOK_DELIVER_QUOTE is set
    2. SMTP email — if SMTP_HOST is configured
    3. Firestore flag + structured log — always works (for Cloud Monitoring alerting)
    """

    # ── Admin Notification: quote draft ready for review ──────────────────────

    async def notify_admin_quote_ready(
        self,
        project_id: str,
        grand_total: float,
        user_id: str,
    ) -> str:
        """
        Notify admin that a new quote draft is ready for review.

        Returns a status message describing the notification result.
        Never raises — all failures are logged and handled gracefully.
        """
        # 1. Try n8n first (if configured)
        if settings.N8N_WEBHOOK_NOTIFY_ADMIN:
            try:
                from src.tools.n8n_mcp_tools import notify_admin_wrapper

                result = await notify_admin_wrapper(
                    project_id=project_id,
                    estimated_value=grand_total,
                    client_name=user_id,
                    urgency="normal",
                )
                if "✅" in result:
                    return result
                logger.warning("[Notification] n8n notify returned non-success: %s", result)
            except Exception:
                logger.warning("[Notification] n8n admin notify failed, falling back to SMTP.", exc_info=True)

        # 2. Try SMTP email
        if settings.SMTP_HOST and settings.ADMIN_EMAIL:
            try:
                subject = f"[SYD] Nuovo preventivo da revisionare — {project_id} (€{grand_total:,.2f})"
                body = (
                    f"Un nuovo preventivo è pronto per la revisione.\n\n"
                    f"Progetto: {project_id}\n"
                    f"Totale stimato: €{grand_total:,.2f} (IVA inclusa)\n"
                    f"Cliente/Utente: {user_id}\n\n"
                    f"Accedi alla dashboard admin per approvare o modificare:\n"
                    f"{settings.ADMIN_DASHBOARD_URL}/quotes/{project_id}\n"
                )
                await self._send_email(
                    to=settings.ADMIN_EMAIL,
                    subject=subject,
                    body=body,
                )
                return f"✅ Notifica admin inviata via email a {settings.ADMIN_EMAIL}"
            except Exception:
                logger.warning("[Notification] SMTP admin notify failed, falling back to Firestore flag.", exc_info=True)

        # 3. Firestore flag + structured log (always works)
        return await self._firestore_flag_notification(
            event_type="quote_ready_for_review",
            project_id=project_id,
            metadata={"grand_total": grand_total, "user_id": user_id},
        )

    # ── Client Delivery: send approved quote PDF ─────────────────────────────

    async def deliver_quote_to_client(
        self,
        project_id: str,
        pdf_url: str,
        client_email: str,
        quote_total: float,
    ) -> str:
        """
        Deliver the approved quote PDF to the client.

        Returns a status message. Never raises.
        """
        # 1. Try n8n first
        if settings.N8N_WEBHOOK_DELIVER_QUOTE:
            try:
                from src.tools.n8n_mcp_tools import deliver_quote_wrapper

                result = await deliver_quote_wrapper(
                    project_id=project_id,
                    client_email=client_email,
                    pdf_url=pdf_url,
                    quote_total=quote_total,
                    delivery_channel="email",
                )
                if "✅" in result:
                    return result
                logger.warning("[Notification] n8n delivery returned non-success: %s", result)
            except Exception:
                logger.warning("[Notification] n8n delivery failed, falling back to SMTP.", exc_info=True)

        # 2. SMTP email with PDF link
        if settings.SMTP_HOST and client_email:
            try:
                subject = f"Il tuo preventivo SYD Bioedilizia — €{quote_total:,.2f}"
                body = (
                    f"Gentile Cliente,\n\n"
                    f"Il tuo preventivo per il progetto {project_id} è stato approvato.\n\n"
                    f"Totale: €{quote_total:,.2f} (IVA inclusa)\n\n"
                    f"Puoi scaricare il PDF del preventivo dal seguente link (valido 15 minuti):\n"
                    f"{pdf_url}\n\n"
                    f"Per qualsiasi domanda, rispondi a questa email o contattaci.\n\n"
                    f"Cordiali saluti,\n"
                    f"SYD Bioedilizia — Architetto Personale AI"
                )
                await self._send_email(
                    to=client_email,
                    subject=subject,
                    body=body,
                )
                return f"✅ Preventivo inviato a {client_email} via email"
            except Exception:
                logger.warning("[Notification] SMTP delivery failed, falling back to Firestore flag.", exc_info=True)

        # 3. Firestore flag
        return await self._firestore_flag_notification(
            event_type="quote_delivery_pending",
            project_id=project_id,
            metadata={
                "client_email": client_email,
                "pdf_url": pdf_url,
                "quote_total": quote_total,
            },
        )

    # ── Internal helpers ─────────────────────────────────────────────────────

    async def _send_email(self, to: str, subject: str, body: str) -> None:
        """
        Send a plain-text email via SMTP (async, non-blocking).

        Raises on failure — caller is responsible for fallback.
        """
        msg = MIMEMultipart()
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain", "utf-8"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
            timeout=15,
        )
        logger.info("[Notification] Email sent.", extra={"to": to, "subject": subject[:60]})

    async def _firestore_flag_notification(
        self,
        event_type: str,
        project_id: str,
        metadata: Optional[dict] = None,
    ) -> str:
        """
        Last-resort notification: writes a flag document to Firestore
        and emits a structured log for Cloud Monitoring alerting.

        The admin_tool Streamlit dashboard polls pending_notifications for display.
        """
        try:
            db = get_async_firestore_client()
            await db.collection("pending_notifications").add({
                "event_type": event_type,
                "project_id": project_id,
                "metadata": metadata or {},
                "created_at": utc_now(),
                "status": "pending",
            })
        except Exception:
            logger.error("[Notification] Firestore flag write failed.", exc_info=True)

        logger.warning(
            "[Notification] All delivery channels failed. Firestore flag written.",
            extra={
                "event_type": event_type,
                "project_id": project_id,
                "notification_pending": True,  # Cloud Monitoring can alert on this
                **(metadata or {}),
            },
        )
        return f"⚠️ Notifica salvata in coda (nessun canale email configurato). Controlla la dashboard admin."
