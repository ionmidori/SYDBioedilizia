"""
NotificationService: Native email notifications with n8n webhook fallback.

Replaces n8n as primary notification channel when n8n hosting is unavailable.
Fallback chain: n8n webhook (if configured) → SMTP email → Firestore flag + structured log.

Pattern: Service Layer (no HTTP logic, pure domain behavior).
"""
import datetime
import logging
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

import aiosmtplib

from src.core.config import settings
from src.db.firebase_client import get_async_firestore_client
from src.services.email_templates import (
    RequestDigest,
    admin_new_requests_email,
    attachment_filename,
    client_quote_email,
)
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
        quotes: list[RequestDigest] | None = None,
    ) -> str:
        """
        Notify admin that new quote request(s) are ready for review.

        `quotes` carries the PRV number / client name / summary of each request
        (built by batch_service); without it the email still sends, with no
        identifiers (never the batch id or the uid).

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
            except Exception:  # noqa: BLE001
                logger.warning("[Notification] n8n admin notify failed, falling back to SMTP.", exc_info=True)

        # 2. Try SMTP email
        if settings.SMTP_HOST and settings.ADMIN_EMAIL:
            try:
                digests = quotes or [
                    RequestDigest(
                        quote_number=None,
                        client_name=None,
                        client_email=None,
                        client_is_guest=False,
                        grand_total=grand_total,
                        summary="",
                    )
                ]
                content = admin_new_requests_email(requests=digests, admin_url=settings.ADMIN_DASHBOARD_URL)
                await self._send_email(
                    to=settings.ADMIN_EMAIL,
                    subject=content.subject,
                    body=content.text,
                    html=content.html,
                )
                return f"✅ Notifica admin inviata via email a {settings.ADMIN_EMAIL}"
            except Exception:  # noqa: BLE001
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
        pdf_bytes: bytes | None = None,
        quote_number: str | None = None,
        client_name: str | None = None,
        revision: int = 1,
        valid_until: datetime.date | datetime.datetime | None = None,
    ) -> str:
        """
        Deliver the approved draft quote to the client.

        The PDF is attached when `pdf_bytes` is given. The body never carries
        the signed Storage link (a forwarded email must not leak the file): it
        points to the login-protected client area instead. `pdf_url` is only
        used by the n8n branch.

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
            except Exception:  # noqa: BLE001
                logger.warning("[Notification] n8n delivery failed, falling back to SMTP.", exc_info=True)

        # 2. SMTP email with PDF link
        if settings.SMTP_HOST and client_email:
            try:
                content = client_quote_email(
                    client_name=client_name,
                    quote_number=quote_number,
                    grand_total=quote_total,
                    valid_until=valid_until,
                    revision=revision,
                    has_attachment=bool(pdf_bytes),
                )
                attachments = (
                    [(attachment_filename(quote_number), pdf_bytes)] if pdf_bytes else None
                )
                await self._send_email(
                    to=client_email,
                    subject=content.subject,
                    body=content.text,
                    html=content.html,
                    attachments=attachments,
                    list_unsubscribe_email="privacy@sydbioedilizia.com",
                )
                return f"✅ Preventivo inviato a {client_email} via email"
            except Exception:  # noqa: BLE001
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

    # ── Account Lifecycle: inactivity warning ────────────────────────────────

    async def send_inactivity_warning(
        self,
        email: str,
        display_name: str,
        disable_in_days: int,
    ) -> str:
        """
        Sends a GDPR inactivity warning to a user informing them that their
        account will be disabled in N days unless they log in again.

        Fallback chain: SMTP → Firestore flag.
        Returns a status message. Never raises.
        """
        subject = "Il tuo account SYD Bioedilizia verrà disattivato"
        body = (
            f"Gentile {display_name},\n\n"
            f"Non rileviamo attività sul tuo account SYD Bioedilizia da oltre 12 mesi.\n\n"
            f"In conformità alla nostra politica sulla privacy e al GDPR (Regolamento UE 2016/679),\n"
            f"il tuo account verrà disattivato automaticamente tra {disable_in_days} giorni.\n\n"
            f"Per mantenere attivo il tuo account, è sufficiente accedere a:\n"
            f"https://sydbioedilizia.vercel.app/dashboard\n\n"
            f"Se non desideri mantenere il tuo account, non è necessaria alcuna azione.\n"
            f"I tuoi dati verranno conservati per 24 mesi e poi anonimizzati in modo sicuro.\n\n"
            f"Per esercitare i tuoi diritti GDPR (accesso, rettifica, cancellazione) contattaci:\n"
            f"privacy@sydbioedilizia.com\n\n"
            f"Cordiali saluti,\n"
            f"SYD Bioedilizia — Architetto Personale AI"
        )

        if settings.SMTP_HOST:
            try:
                await self._send_email(
                    to=email,
                    subject=subject,
                    body=body,
                    list_unsubscribe_email="privacy@sydbioedilizia.com",
                )
                return f"✅ Inactivity warning sent to {email}"
            except Exception:  # noqa: BLE001
                logger.warning("[Notification] SMTP inactivity warning failed.", exc_info=True)

        # Firestore flag fallback
        return await self._firestore_flag_notification(
            event_type="account_inactivity_warning",
            project_id=email,
            metadata={"email": email, "disable_in_days": disable_in_days},
        )

    # ── Internal helpers ─────────────────────────────────────────────────────

    async def _send_email(
        self,
        to: str,
        subject: str,
        body: str,
        html: str | None = None,
        attachments: list[tuple[str, bytes]] | None = None,
        list_unsubscribe_email: str | None = None,
    ) -> None:
        """
        Send an email via SMTP (async, non-blocking).

        Plain-text always; optional HTML alternative and PDF attachments
        (list of (filename, raw_bytes)). Existing plain-only callers are
        unaffected.

        `list_unsubscribe_email`, when given, adds List-Unsubscribe /
        List-Unsubscribe-Post headers (mailto-based) — recommended by
        Gmail/Yahoo bulk-sender guidelines and a deliverability signal for
        any automated client-facing email. Omitted for internal admin
        notifications, where it isn't meaningful.

        Raises on failure — caller is responsible for fallback.
        """
        msg = MIMEMultipart("mixed")
        msg["From"] = formataddr((settings.SMTP_FROM_NAME, settings.SMTP_FROM_EMAIL))
        msg["To"] = to
        msg["Subject"] = subject
        msg["Reply-To"] = settings.SMTP_FROM_EMAIL
        if list_unsubscribe_email:
            # List-Unsubscribe-Post (RFC 8058 one-click) is omitted: it only
            # applies to an https POST target, not a mailto: link.
            msg["List-Unsubscribe"] = f"<mailto:{list_unsubscribe_email}?subject=unsubscribe>"

        if html:
            alternative = MIMEMultipart("alternative")
            alternative.attach(MIMEText(body, "plain", "utf-8"))
            alternative.attach(MIMEText(html, "html", "utf-8"))
            msg.attach(alternative)
        else:
            msg.attach(MIMEText(body, "plain", "utf-8"))

        for filename, content in attachments or []:
            part = MIMEApplication(content, _subtype="pdf")
            part.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(part)

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
        metadata: dict | None = None,
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
        return "⚠️ Notifica salvata in coda (nessun canale email configurato). Controlla la dashboard admin."
