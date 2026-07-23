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
from unittest.mock import AsyncMock, MagicMock, patch

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
        with patch("src.services.notification_service.aiosmtplib.send", new=AsyncMock()) as mock_send:
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
        with patch("src.services.notification_service.aiosmtplib.send", new=AsyncMock()) as mock_send:
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
        with patch("src.services.notification_service.aiosmtplib.send", new=AsyncMock()) as mock_send:
            await service._send_email(to="a@b.c", subject="Test", body="Ciao")

        parsed = _sent_message(mock_send)
        assert parsed["From"] == "SYD Bioedilizia <sender@test.local>"
        assert parsed["Reply-To"] == "sender@test.local"

    async def test_list_unsubscribe_omitted_by_default(self, smtp_settings):
        service = NotificationService()
        with patch("src.services.notification_service.aiosmtplib.send", new=AsyncMock()) as mock_send:
            await service._send_email(to="a@b.c", subject="Test", body="Ciao")

        parsed = _sent_message(mock_send)
        assert parsed["List-Unsubscribe"] is None

    async def test_list_unsubscribe_present_when_requested(self, smtp_settings):
        service = NotificationService()
        with patch("src.services.notification_service.aiosmtplib.send", new=AsyncMock()) as mock_send:
            await service._send_email(
                to="a@b.c",
                subject="Test",
                body="Ciao",
                list_unsubscribe_email="privacy@sydbioedilizia.com",
            )

        parsed = _sent_message(mock_send)
        assert parsed["List-Unsubscribe"] == "<mailto:privacy@sydbioedilizia.com?subject=unsubscribe>"


# ─── deliver_quote_to_client ─────────────────────────────────────────────────

class TestDeliverQuoteToClient:
    async def test_attaches_pdf_and_declares_7_day_link(self, smtp_settings):
        service = NotificationService()
        with patch("src.services.notification_service.aiosmtplib.send", new=AsyncMock()) as mock_send:
            result = await service.deliver_quote_to_client(
                project_id="p1",
                pdf_url="https://signed.example/q.pdf",
                client_email="cliente@example.com",
                quote_total=1234.56,
                pdf_bytes=PDF_BYTES,
            )

        assert "✅" in result
        parsed = _sent_message(mock_send)
        assert parsed["To"] == "cliente@example.com"
        parts = _parts_by_type(parsed)
        plain = parts["text/plain"].get_payload(decode=True).decode("utf-8")
        assert "https://signed.example/q.pdf" in plain
        assert "7 giorni" in plain
        assert "15 minuti" not in plain
        assert "text/html" in parts
        pdf_part = parts.get("application/pdf")
        assert pdf_part is not None
        assert pdf_part.get_payload(decode=True) == PDF_BYTES

    async def test_without_pdf_bytes_still_sends_link(self, smtp_settings):
        """pdf_bytes optional: link-only email keeps working."""
        service = NotificationService()
        with patch("src.services.notification_service.aiosmtplib.send", new=AsyncMock()) as mock_send:
            result = await service.deliver_quote_to_client(
                project_id="p1",
                pdf_url="https://signed.example/q.pdf",
                client_email="cliente@example.com",
                quote_total=100.0,
            )

        assert "✅" in result
        parsed = _sent_message(mock_send)
        parts = _parts_by_type(parsed)
        assert "https://signed.example/q.pdf" in parts["text/plain"].get_payload(decode=True).decode("utf-8")
        assert "application/pdf" not in parts


# ─── PdfService signed URL expiry ────────────────────────────────────────────

def test_signed_url_expiry_is_7_days():
    from src.services.pdf_service import _SIGNED_URL_EXPIRY

    assert _SIGNED_URL_EXPIRY == datetime.timedelta(days=7)


# ─── Approve pipeline: recipient = project owner ─────────────────────────────

@pytest.fixture
def client():
    """TestClient with quote routes and an admin user injected (same pattern
    as tests/unit/test_quote_routes.py)."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from src.api.routes.quote_routes import router
    from src.auth.jwt_handler import verify_token
    from src.schemas.internal import UserSession

    app = FastAPI()
    app.include_router(router)

    async def override_verify_token():
        return UserSession(uid="admin-test-uid", email="admin@test.com", claims={"role": "admin"})

    app.dependency_overrides[verify_token] = override_verify_token
    return TestClient(app)


class TestApproveRecipient:
    async def test_resolve_project_owner_uid(self):
        from src.api.routes import quote_routes

        doc = MagicMock()
        doc.exists = True
        doc.to_dict.return_value = {"userId": "client-uid-123"}
        db = MagicMock()
        db.collection.return_value.document.return_value.get = AsyncMock(return_value=doc)

        with patch("src.api.routes.quote_routes.get_async_firestore_client", return_value=db):
            uid = await quote_routes._resolve_project_owner_uid("p1")

        assert uid == "client-uid-123"
        db.collection.assert_called_with("projects")

    async def test_resolve_project_owner_uid_missing_project(self):
        from src.api.routes import quote_routes

        doc = MagicMock()
        doc.exists = False
        db = MagicMock()
        db.collection.return_value.document.return_value.get = AsyncMock(return_value=doc)

        with patch("src.api.routes.quote_routes.get_async_firestore_client", return_value=db):
            uid = await quote_routes._resolve_project_owner_uid("missing")

        assert uid is None

    def test_approve_delivers_to_project_owner_not_admin(
        self, mock_quote_graph, client
    ):
        """The delivery email goes to the project owner's address, not the approving admin's."""
        mock_quote_graph.approve.return_value = {"status": "completed"}

        # Firestore: quote doc + project doc owned by client-uid-123
        quote_doc = MagicMock()
        quote_doc.exists = True
        quote_doc.to_dict.return_value = {
            "financials": {"grand_total": 500.0},
            "items": [],
        }
        quote_ref = MagicMock()
        quote_ref.get = AsyncMock(return_value=quote_doc)
        quote_ref.update = AsyncMock()

        mock_pdf = MagicMock()
        mock_pdf.generate_pdf_bytes.return_value = PDF_BYTES
        mock_pdf.upload_pdf.return_value = (
            "https://signed.example/q.pdf",
            "projects/test-project-001/quotes/quote_1.pdf",
        )

        async def fake_profile(uid):
            return {
                "client-uid-123": {"name": "Cliente", "email": "cliente@example.com", "phone": ""},
                "admin-test-uid": {"name": "Admin", "email": "admin@test.com", "phone": ""},
            }[uid]

        deliver_mock = AsyncMock(return_value="✅ ok")

        with (
            patch("src.adk.hitl.approve_quote_hitl", mock_quote_graph.approve),
            patch("src.api.routes.quote_routes._quote_doc_ref", return_value=quote_ref),
            patch("src.api.routes.quote_routes.PdfService", return_value=mock_pdf),
            patch("src.api.routes.quote_routes._resolve_project_owner_uid",
                  new=AsyncMock(return_value="client-uid-123")),
            patch("src.api.routes.quote_routes._get_user_profile", side_effect=fake_profile),
            patch("src.services.notification_service.NotificationService.deliver_quote_to_client",
                  new=deliver_mock),
        ):
            response = client.post(
                "/api/quote/test-project-001/approve",
                json={"decision": "approve", "notes": "ok"},
            )

        assert response.status_code == 200
        deliver_mock.assert_called_once()
        kwargs = deliver_mock.call_args.kwargs
        assert kwargs["client_email"] == "cliente@example.com"
        assert kwargs["pdf_bytes"] == PDF_BYTES
        assert kwargs["pdf_url"] == "https://signed.example/q.pdf"
