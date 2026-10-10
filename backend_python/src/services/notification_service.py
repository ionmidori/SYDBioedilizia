"""
NotificationService: account-lifecycle emails (GDPR inactivity warning).

Quote emails (client delivery, admin notification) moved to the transactional
outbox in Phase 128 (`src/services/email/outbox.py`): they are recorded with the
business change and retried, instead of being fired and forgotten. n8n is no
longer part of the quote path.

This service sends through the configured provider (`EMAIL_PROVIDER`) and, if
sending fails, leaves a `pending_notifications` flag for follow-up. Logs never
contain email addresses.

Pattern: Service Layer (no HTTP logic, pure domain behavior).
"""
import logging

from src.db.firebase_client import get_async_firestore_client
from src.services.email import get_email_provider
from src.services.email.types import Attachment, OutboundEmail, ProviderError
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

_PRIVACY_MAILBOX = "privacy@sydbioedilizia.com"


class NotificationService:
    """Account lifecycle notifications (provider → Firestore flag)."""

    async def send_inactivity_warning(
        self,
        email: str,
        display_name: str,
        disable_in_days: int,
    ) -> str:
        """
        Sends a GDPR inactivity warning to a user informing them that their
        account will be disabled in N days unless they log in again.

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
            f"{_PRIVACY_MAILBOX}\n\n"
            f"Cordiali saluti,\n"
            f"SYD Bioedilizia"
        )
        try:
            await self._send_email(to=email, subject=subject, body=body, list_unsubscribe_email=_PRIVACY_MAILBOX)
            return "✅ Inactivity warning sent"
        except ProviderError as exc:
            logger.warning(
                "[Notification] Inactivity warning not sent.",
                extra={"permanent": exc.permanent, "status_code": exc.status_code},
            )
        return await self._firestore_flag_notification(
            event_type="account_inactivity_warning",
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
        """Send through the configured provider. Raises ProviderError."""
        await get_email_provider().send(
            OutboundEmail(
                to=to,
                subject=subject,
                text=body,
                html=html,
                attachments=tuple(Attachment(name, content) for name, content in attachments or []),
                list_unsubscribe=list_unsubscribe_email,
            )
        )

    async def _firestore_flag_notification(self, event_type: str, metadata: dict | None = None) -> str:
        """
        Last resort: a `pending_notifications` document for follow-up and a
        structured log (without the metadata: it holds contact data) that
        Cloud Monitoring can alert on.
        """
        try:
            db = get_async_firestore_client()
            await db.collection("pending_notifications").add({
                "event_type": event_type,
                "metadata": metadata or {},
                "created_at": utc_now(),
                "status": "pending",
            })
        except Exception:  # noqa: BLE001 — the flag is the last resort, never raise
            logger.error("[Notification] Firestore flag write failed.", exc_info=True)

        logger.warning(
            "[Notification] Email not sent. Firestore flag written.",
            extra={"event_type": event_type, "notification_pending": True},
        )
        return "⚠️ Notifica salvata in coda (invio email non riuscito)."
