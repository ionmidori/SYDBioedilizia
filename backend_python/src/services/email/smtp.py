"""SMTP provider (Gmail app password today). Also the MIME builder shared with
NotificationService (account lifecycle emails)."""
from __future__ import annotations

import logging
import ssl
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, make_msgid

import aiosmtplib

from src.core.config import settings
from src.services.email.types import OutboundEmail, ProviderError, ProviderResult

logger = logging.getLogger(__name__)


def build_mime(email: OutboundEmail, from_name: str, from_address: str, reply_to: str | None) -> MIMEMultipart:
    """multipart/mixed: (text + optional HTML alternative) + attachments."""
    msg = MIMEMultipart("mixed")
    msg["From"] = formataddr((from_name, from_address))
    msg["To"] = email.to
    if email.cc:
        msg["Cc"] = ", ".join(email.cc)
    msg["Subject"] = email.subject
    msg["Reply-To"] = reply_to or from_address
    domain = from_address.rsplit("@", 1)[-1] if "@" in from_address else None
    msg["Message-ID"] = make_msgid(domain=domain)
    if email.list_unsubscribe:
        # List-Unsubscribe-Post (RFC 8058 one-click) only applies to an https
        # POST target, not a mailto: link, so it is omitted.
        msg["List-Unsubscribe"] = f"<mailto:{email.list_unsubscribe}?subject=unsubscribe>"
    if email.reference:
        msg["X-SYD-Reference"] = email.reference

    if email.html:
        alternative = MIMEMultipart("alternative")
        alternative.attach(MIMEText(email.text, "plain", "utf-8"))
        alternative.attach(MIMEText(email.html, "html", "utf-8"))
        msg.attach(alternative)
    else:
        msg.attach(MIMEText(email.text, "plain", "utf-8"))

    for attachment in email.attachments:
        subtype = attachment.mime_type.split("/", 1)[-1]
        part = MIMEApplication(attachment.content, _subtype=subtype)
        part.add_header("Content-Disposition", "attachment", filename=attachment.filename)
        msg.attach(part)
    return msg


class SmtpProvider:
    """STARTTLS SMTP. Classifies failures: rejected recipients / auth are
    permanent (retrying cannot help), network and 4xx are transient."""

    name = "smtp"

    async def send(self, email: OutboundEmail) -> ProviderResult:
        if not settings.SMTP_HOST:
            raise ProviderError("SMTP is not configured (SMTP_HOST).", permanent=True)
        msg = build_mime(email, settings.email_from_name, settings.email_from_address, settings.email_reply_to)
        try:
            await aiosmtplib.send(
                msg,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
                start_tls=True,
                timeout=20,
            )
        except (aiosmtplib.SMTPRecipientsRefused, aiosmtplib.SMTPSenderRefused) as exc:
            raise ProviderError("SMTP rejected the sender or a recipient.", permanent=True) from exc
        except aiosmtplib.SMTPAuthenticationError as exc:
            raise ProviderError("SMTP authentication failed.", permanent=True) from exc
        except aiosmtplib.SMTPResponseException as exc:
            # 5xx = permanent, 4xx = temporary (greylisting, rate limit…)
            raise ProviderError(f"SMTP error {exc.code}.", permanent=exc.code >= 500, status_code=exc.code) from exc
        except (aiosmtplib.SMTPException, OSError, TimeoutError, ssl.SSLError) as exc:
            raise ProviderError("SMTP transport error.", extra={"type": type(exc).__name__}) from exc
        message_id = str(msg["Message-ID"])
        logger.info("[Email/SMTP] Accepted by the SMTP server.", extra={"reference": email.reference or "-"})
        return ProviderResult(provider=self.name, message_id=message_id)
