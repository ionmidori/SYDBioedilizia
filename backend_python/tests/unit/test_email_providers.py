"""Email providers (Phase 128 — Fase 4): SMTP MIME + error classification,
Brevo payload/errors/webhooks, Console, provider selection."""
import base64
import json
from datetime import UTC, datetime
from email import message_from_bytes
from email.header import decode_header, make_header
from unittest.mock import AsyncMock, patch

import aiosmtplib
import httpx
import pytest
from src.services import email as email_pkg
from src.services.email import brevo as brevo_mod
from src.services.email.brevo import BrevoProvider, parse_webhook, verify_webhook_token
from src.services.email.console import ConsoleProvider
from src.services.email.smtp import SmtpProvider, build_mime
from src.services.email.types import Attachment, OutboundEmail, ProviderError

EMAIL = OutboundEmail(
    to="mario@example.it",
    cc=("socio@example.it",),
    subject="Bozza di preventivo PRV-2026-0042 – SYD Bioedilizia",
    text="testo",
    html="<p>html</p>",
    attachments=(Attachment("Bozza_preventivo_PRV-2026-0042.pdf", b"%PDF"),),
    list_unsubscribe="privacy@sydbioedilizia.com",
    reference="d1",
    tags=("quote",),
)


@pytest.fixture
def smtp(monkeypatch):
    s = email_pkg.settings
    monkeypatch.setattr(s, "SMTP_HOST", "smtp.test.local")
    monkeypatch.setattr(s, "SMTP_USER", "sender@test.local")
    monkeypatch.setattr(s, "SMTP_PASSWORD", "secret")
    monkeypatch.setattr(s, "SMTP_FROM_EMAIL", "sender@test.local")
    monkeypatch.setattr(s, "EMAIL_FROM_ADDRESS", None)
    monkeypatch.setattr(s, "EMAIL_REPLY_TO", None)


# ── SMTP ──────────────────────────────────────────────────────────────────────

def test_mime_has_alternatives_attachment_and_headers():
    msg = message_from_bytes(build_mime(EMAIL, "SYD Bioedilizia", "sender@test.local", "info@syd.it").as_bytes())
    assert msg["From"] == "SYD Bioedilizia <sender@test.local>"
    assert msg["To"] == "mario@example.it" and msg["Cc"] == "socio@example.it"
    assert str(make_header(decode_header(msg["Subject"]))) == EMAIL.subject
    assert msg["Reply-To"] == "info@syd.it" and msg["Message-ID"].endswith("@test.local>")
    assert msg["List-Unsubscribe"] == "<mailto:privacy@sydbioedilizia.com?subject=unsubscribe>"
    types = [p.get_content_type() for p in msg.walk()]
    assert "text/plain" in types and "text/html" in types and "application/pdf" in types
    pdf = next(p for p in msg.walk() if p.get_content_type() == "application/pdf")
    assert pdf.get_filename() == "Bozza_preventivo_PRV-2026-0042.pdf" and pdf.get_payload(decode=True) == b"%PDF"


async def test_smtp_returns_the_message_id(smtp):
    with patch("src.services.email.smtp.aiosmtplib.send", new=AsyncMock()) as send:
        result = await SmtpProvider().send(EMAIL)
    sent = send.await_args.args[0]
    assert result.provider == "smtp" and result.message_id == sent["Message-ID"]
    assert send.await_args.kwargs["start_tls"] is True


@pytest.mark.parametrize(
    "error,permanent",
    [
        (aiosmtplib.SMTPRecipientsRefused([]), True),
        (aiosmtplib.SMTPAuthenticationError(535, "bad credentials"), True),
        (aiosmtplib.SMTPResponseException(550, "mailbox unavailable"), True),
        (aiosmtplib.SMTPResponseException(451, "try later"), False),
        (aiosmtplib.SMTPServerDisconnected("bye"), False),
        (OSError("network"), False),
        (TimeoutError(), False),
    ],
)
async def test_smtp_classifies_failures(smtp, error, permanent):
    with patch("src.services.email.smtp.aiosmtplib.send", new=AsyncMock(side_effect=error)):
        with pytest.raises(ProviderError) as exc:
            await SmtpProvider().send(EMAIL)
    assert exc.value.permanent is permanent


async def test_smtp_not_configured_is_permanent(monkeypatch):
    monkeypatch.setattr(email_pkg.settings, "SMTP_HOST", None)
    with pytest.raises(ProviderError) as exc:
        await SmtpProvider().send(EMAIL)
    assert exc.value.permanent


# ── Brevo ─────────────────────────────────────────────────────────────────────

def _brevo(handler) -> BrevoProvider:
    return BrevoProvider(api_key="test-key", client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_brevo_sends_the_documented_payload():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["key"] = request.headers["api-key"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(201, json={"messageId": "<abc@smtp-relay.mailin.fr>"})

    result = await _brevo(handler).send(EMAIL)

    assert result.message_id == "<abc@smtp-relay.mailin.fr>" and result.provider == "brevo"
    body = seen["body"]
    assert seen["url"] == brevo_mod.BREVO_SEND_URL and seen["key"] == "test-key"
    assert body["to"] == [{"email": "mario@example.it"}] and body["cc"] == [{"email": "socio@example.it"}]
    assert body["subject"] == EMAIL.subject and body["htmlContent"] == "<p>html</p>" and body["textContent"] == "testo"
    assert body["attachment"] == [{"name": "Bozza_preventivo_PRV-2026-0042.pdf",
                                   "content": base64.b64encode(b"%PDF").decode()}]
    assert body["headers"]["X-Mailin-custom"] == "d1" and body["tags"] == ["quote"]


@pytest.mark.parametrize("status,permanent", [(400, True), (401, True), (429, False), (500, False), (503, False)])
async def test_brevo_classifies_http_errors(status, permanent):
    with pytest.raises(ProviderError) as exc:
        await _brevo(lambda request: httpx.Response(status, json={"code": "x"})).send(EMAIL)
    assert exc.value.permanent is permanent and exc.value.status_code == status


async def test_brevo_network_error_is_transient():
    def handler(request):
        raise httpx.ConnectError("down")

    with pytest.raises(ProviderError) as exc:
        await _brevo(handler).send(EMAIL)
    assert not exc.value.permanent and exc.value.extra["type"] == "ConnectError"


async def test_brevo_without_key_is_permanent(monkeypatch):
    monkeypatch.setattr(brevo_mod.settings, "BREVO_API_KEY", None)
    with pytest.raises(ProviderError) as exc:
        await BrevoProvider().send(EMAIL)
    assert exc.value.permanent


@pytest.mark.parametrize(
    "configured,header,ok",
    [
        (None, "Bearer anything", False),  # not configured → fail closed
        ("s" * 40, None, False),
        ("s" * 40, "Bearer wrong", False),
        ("s" * 40, "Basic " + "s" * 40, False),
        ("s" * 40, "Bearer " + "s" * 40, True),
    ],
)
def test_webhook_token(monkeypatch, configured, header, ok):
    monkeypatch.setattr(brevo_mod.settings, "BREVO_WEBHOOK_TOKEN", configured)
    assert verify_webhook_token(header) is ok


def test_webhook_events_are_mapped_and_noise_ignored():
    events = parse_webhook(
        [
            {"event": "delivered", "message-id": "<m1>", "ts_event": 1791712800, "X-Mailin-custom": "d1"},
            {"event": "hard_bounce", "message-id": "<m1>", "ts_event": 1791712900, "reason": "mailbox unknown"},
            {"event": "spam", "message-id": "<m1>", "ts_epoch": 1791713000000},
            {"event": "request", "message-id": "<m1>"},  # "sent": we know it already
            {"event": "click", "message-id": "<m1>"},
            {"event": "delivered"},  # no message id
            "garbage",
        ]
    )
    assert [(e.event, e.raw_event) for e in events] == [
        ("delivered", "delivered"), ("bounced", "hard_bounce"), ("complained", "spam"),
    ]
    assert events[0].reference == "d1" and events[0].occurred_at == datetime.fromtimestamp(1791712800, tz=UTC)
    assert events[1].detail == "mailbox unknown"
    assert events[2].occurred_at == datetime.fromtimestamp(1791713000, tz=UTC)  # ts_epoch is in ms
    assert parse_webhook({"event": "delivered", "message-id": "<m2>"})[0].message_id == "<m2>"


# ── Console + selection ───────────────────────────────────────────────────────

async def test_console_records_without_sending():
    provider = ConsoleProvider()
    result = await provider.send(EMAIL)
    assert provider.sent == [EMAIL] and result.message_id.startswith("<console-")


@pytest.mark.parametrize("name,cls", [("smtp", SmtpProvider), ("brevo", BrevoProvider), ("console", ConsoleProvider)])
def test_provider_selected_by_setting(monkeypatch, name, cls):
    monkeypatch.setattr(email_pkg.settings, "EMAIL_PROVIDER", name)
    email_pkg.get_email_provider.cache_clear()
    try:
        assert isinstance(email_pkg.get_email_provider(), cls)
    finally:
        email_pkg.get_email_provider.cache_clear()
