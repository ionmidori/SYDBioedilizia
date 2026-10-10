"""Email templates v2 (Phase 128 PR 3.2): no ids, escaped, single-line headers."""
import datetime

from src.core.company import COMPANY
from src.services.email_templates import (
    RequestDigest,
    admin_new_requests_email,
    attachment_filename,
    client_quote_email,
    dashboard_quotes_url,
    digest_from_quote,
    one_line,
)

UID = "LRYkEAr1fPe9xuhV7XKvoDM5JYN2"
PROJECT_ID = "9de20502-0eb6-4075-99f1-14ad188150af"
VALID = datetime.date(2026, 11, 10)


def _client(**overrides):
    args = {"client_name": "Mario Rossi", "quote_number": "PRV-2026-0042", "grand_total": 1234.56, "valid_until": VALID}
    args.update(overrides)
    return client_quote_email(**args)


def test_client_email_content():
    mail = _client()
    assert mail.subject == "Bozza di preventivo PRV-2026-0042 – SYD Bioedilizia"
    assert "Gentile Mario Rossi," in mail.text and "Gentile Mario Rossi," in mail.html
    assert "bozza di preventivo PRV-2026-0042" in mail.text
    assert "€ 1.234,56" in mail.text and "Valida fino al: 10/11/2026" in mail.text
    assert "in allegato (PDF)" in mail.text
    # what the document is: an automatic draft confirmed by a technician
    assert "bozza generata automaticamente" in mail.text
    assert "sopralluogo" in mail.text and "contatto telefonico" in mail.text
    assert f"{COMPANY.url}/dashboard/quotes" in mail.text and dashboard_quotes_url() in mail.html
    assert COMPANY.phone in mail.text and COMPANY.legal_line in mail.html


def test_client_email_without_a_name_or_attachment_or_number():
    mail = client_quote_email(client_name=None, quote_number=None, grand_total=50.0, has_attachment=False)
    assert mail.subject == "Bozza di preventivo – SYD Bioedilizia"
    assert "Gentile Cliente," in mail.text and "in allegato" not in mail.text and "area riservata" in mail.text


def test_revision_is_mentioned_only_after_the_first():
    assert "(rev. 2)" in _client(revision=2).text
    assert "rev." not in _client(revision=1).text


def test_client_email_carries_no_ids_and_no_signed_links():
    mail = _client()
    blob = mail.subject + mail.text + mail.html
    assert UID not in blob and PROJECT_ID not in blob and "9de20502" not in blob
    assert "storage.googleapis.com" not in blob and "X-Goog" not in blob


def test_dynamic_values_are_html_escaped_and_headers_single_line():
    mail = _client(client_name='Mario <img src=x onerror=alert(1)> "Rossi"\r\nBcc: evil@x.it')
    assert "<img" not in mail.html and "&lt;img" in mail.html
    assert "\r" not in mail.subject and "\n" not in mail.subject
    assert "Bcc:" not in mail.subject
    assert "\r" not in mail.text.splitlines()[0]  # greeting is one line
    assert "\n" not in one_line("a\r\nb\tc")


def test_attachment_filename_has_the_number_only():
    assert attachment_filename("PRV-2026-0042") == "Bozza_preventivo_PRV-2026-0042.pdf"
    assert attachment_filename(None) == "Bozza_preventivo_SYD.pdf"
    assert attachment_filename("../../etc/passwd") == "Bozza_preventivo_etcpasswd.pdf"


def _digest(**overrides):
    args = {"quote_number": "PRV-2026-0042", "client_name": "Mario Rossi", "client_email": "mario@example.it",
            "client_is_guest": False, "grand_total": 816.91, "summary": "Pittura cucina"}
    args.update(overrides)
    return RequestDigest(**args)


def test_admin_email_for_one_request():
    mail = admin_new_requests_email(requests=[_digest()], admin_url="https://admin.example/")
    assert mail.subject == "[SYD] Nuova richiesta PRV-2026-0042 da Mario Rossi (€ 816,91)"
    assert "PRV-2026-0042 · Mario Rossi <mario@example.it> · € 816,91 — Pittura cucina" in mail.text
    assert "https://admin.example/" in mail.text and "https://admin.example/" in mail.html


def test_admin_email_for_a_batch():
    mail = admin_new_requests_email(
        requests=[_digest(), _digest(quote_number="PRV-2026-0043", summary="Bagno")], admin_url="https://a/"
    )
    assert mail.subject == "[SYD] 2 nuove richieste di preventivo da Mario Rossi"
    assert mail.text.count("•") == 2
    other = admin_new_requests_email(requests=[_digest(), _digest(client_name="Anna")], admin_url="https://a/")
    assert other.subject.endswith("da più clienti")


def test_admin_email_for_guests_and_unknowns_has_no_identifiers():
    guest = admin_new_requests_email(requests=[_digest(client_name=None, client_email=None, client_is_guest=True)],
                                     admin_url="https://a/")
    assert "da un cliente ospite" in guest.subject
    unknown = admin_new_requests_email(
        requests=[_digest(quote_number=None, client_name=None, client_email=None, summary="")], admin_url="https://a/"
    )
    assert unknown.subject == "[SYD] Nuova richiesta di preventivo da un cliente (€ 816,91)"
    assert "Preventivo · un cliente · € 816,91" in unknown.text


def test_admin_email_escapes_and_truncates():
    mail = admin_new_requests_email(
        requests=[_digest(client_name="<b>x</b>\nBcc: e@x.it", summary="s" * 500)], admin_url="https://a/"
    )
    assert "<b>x</b>" not in mail.html and "&lt;b&gt;" in mail.html
    assert "\n" not in mail.subject
    assert "…" in mail.text and "s" * 201 not in mail.text


def test_digest_from_a_stored_quote():
    quote = {
        "quote_number": "PRV-2026-0042",
        "client_snapshot": {"display_name": "Mario Rossi", "email": "m@x.it", "is_guest": False},
        "financials": {"grand_total": 99.5},
        "request": {"summary": "Pittura"},
        "user_id": UID,
    }
    digest = digest_from_quote(quote)
    assert (digest.quote_number, digest.client_name, digest.grand_total, digest.summary) == (
        "PRV-2026-0042", "Mario Rossi", 99.5, "Pittura")
    legacy = digest_from_quote({"user_id": UID})
    assert legacy.quote_number is None and legacy.client_name is None and legacy.grand_total == 0.0
