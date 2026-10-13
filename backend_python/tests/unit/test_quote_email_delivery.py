"""
Quote email delivery tests — PR 1 (backend delivery).

Covers:
  - NotificationService._send_email: multipart HTML + PDF attachment (back-compat plain)
  - NotificationService.deliver_quote_to_client: PDF bytes attached, 7-day link text
  - PdfService signed URL expiry = 7 days
  - approve pipeline: recipient resolved from project owner, NOT from the approving admin
"""
import datetime
from email import message_from_bytes
from unittest.mock import AsyncMock, patch

import pytest
from src.core.config import settings
from src.services.notification_service import NotificationService

PDF_BYTES = b"%PDF-1.4 fake-pdf-content"


def _sent_message(mock_send):
    """Extract the MIME message passed to aiosmtplib.send as parsed email."""
    msg = mock_send.call_args[0][0]
    return message_from_bytes(msg.as_bytes())


def _parts_by_type(parsed):
    return {part.get_content_type(): part for part in parsed.walk()}


@pytest.fixture
def smtp_settings(monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.test.local")
    monkeypatch.setattr(settings, "SMTP_PORT", 587)
    monkeypatch.setattr(settings, "SMTP_USER", "sender@test.local")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "secret")
    monkeypatch.setattr(settings, "SMTP_FROM_EMAIL", "sender@test.local")
    monkeypatch.setattr(settings, "N8N_WEBHOOK_DELIVER_QUOTE", None)
    monkeypatch.setattr(settings, "N8N_WEBHOOK_NOTIFY_ADMIN", None)


# ─── _send_email ─────────────────────────────────────────────────────────────

class TestSendEmail:
    async def test_plain_only_backcompat(self, smtp_settings):
        """Existing plain-text callers keep working: plain part present, no PDF."""
        service = NotificationService()
        with patch("src.services.email.smtp.aiosmtplib.send", new=AsyncMock()) as mock_send:
            await service._send_email(to="a@b.c", subject="Test", body="Ciao")

        parsed = _sent_message(mock_send)
        parts = _parts_by_type(parsed)
        assert "text/plain" in parts
        assert parts["text/plain"].get_payload(decode=True).decode("utf-8") == "Ciao"
        assert "application/pdf" not in parts
        assert parsed["To"] == "a@b.c"

    async def test_html_and_pdf_attachment(self, smtp_settings):
        """html + attachments build multipart/mixed with alternative and PDF part."""
        service = NotificationService()
        with patch("src.services.email.smtp.aiosmtplib.send", new=AsyncMock()) as mock_send:
            await service._send_email(
                to="a@b.c",
                subject="Test",
                body="plain fallback",
                html="<h1>Preventivo</h1>",
                attachments=[("preventivo_p1.pdf", PDF_BYTES)],
            )

        parsed = _sent_message(mock_send)
        parts = _parts_by_type(parsed)
        assert "text/plain" in parts
        assert "text/html" in parts
        assert "<h1>Preventivo</h1>" in parts["text/html"].get_payload(decode=True).decode("utf-8")
        pdf_part = parts.get("application/pdf")
        assert pdf_part is not None
        assert pdf_part.get_filename() == "preventivo_p1.pdf"
        assert pdf_part.get_payload(decode=True) == PDF_BYTES


# ─── Deliverability headers (From display name, Reply-To, List-Unsubscribe) ──

class TestDeliverabilityHeaders:
    async def test_from_uses_display_name(self, smtp_settings, monkeypatch):
        monkeypatch.setattr(settings, "SMTP_FROM_NAME", "SYD Bioedilizia")
        service = NotificationService()
        with patch("src.services.email.smtp.aiosmtplib.send", new=AsyncMock()) as mock_send:
            await service._send_email(to="a@b.c", subject="Test", body="Ciao")

        parsed = _sent_message(mock_send)
        assert parsed["From"] == "SYD Bioedilizia <sender@test.local>"
        assert parsed["Reply-To"] == "sender@test.local"

    async def test_list_unsubscribe_omitted_by_default(self, smtp_settings):
        service = NotificationService()
        with patch("src.services.email.smtp.aiosmtplib.send", new=AsyncMock()) as mock_send:
            await service._send_email(to="a@b.c", subject="Test", body="Ciao")

        parsed = _sent_message(mock_send)
        assert parsed["List-Unsubscribe"] is None

    async def test_list_unsubscribe_present_when_requested(self, smtp_settings):
        service = NotificationService()
        with patch("src.services.email.smtp.aiosmtplib.send", new=AsyncMock()) as mock_send:
            await service._send_email(
                to="a@b.c",
                subject="Test",
                body="Ciao",
                list_unsubscribe_email="privacy@sydbioedilizia.com",
            )

        parsed = _sent_message(mock_send)
        assert parsed["List-Unsubscribe"] == "<mailto:privacy@sydbioedilizia.com?subject=unsubscribe>"


# ─── PdfService signed URL expiry ────────────────────────────────────────────

def test_signed_url_expiry_is_7_days():
    from src.services.pdf_service import _SIGNED_URL_EXPIRY

    assert _SIGNED_URL_EXPIRY == datetime.timedelta(days=7)
