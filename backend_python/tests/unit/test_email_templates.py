"""Email templates v2 (Phase 128 PR 3.2): no ids, escaped, single-line headers."""
import datetime
import re

from src.core.brand import BRAND
from src.core.company import COMPANY
from src.services.email_templates import (
    RequestDigest,
    admin_client_followup_email,
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


def _web_links(html: str) -> list[str]:
    """Distinct http(s) links of an email (the footer's tel:/mailto: are not web pages)."""
    return sorted(set(re.findall(r'href="(https?://[^"]+)"', html)))


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
    assert f"Area riservata: {dashboard_quotes_url()}" in mail.text
    assert _web_links(mail.html) == [dashboard_quotes_url()]
    assert dashboard_quotes_url() == f"{COMPANY.url}/dashboard/quotes"
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
    assert "<img src=x" not in mail.html and "&lt;img src=x" in mail.html
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
    # The console link is the whole last line of the text and the only href of the HTML.
    assert mail.text.splitlines()[-1] == "https://admin.example/"
    assert _web_links(mail.html) == ["https://admin.example/"]


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


def test_admin_email_marks_a_new_revision_of_a_sent_quote():
    sent_before = digest_from_quote({"quote_number": "PRV-2026-0042", "sent_at": "2026-10-05T08:00:00Z"})
    assert sent_before.is_revision
    mail = admin_new_requests_email(requests=[_digest(is_revision=True)], admin_url="https://a/")
    assert mail.subject == "[SYD] Nuova revisione PRV-2026-0042 da Mario Rossi (€ 816,91)"
    assert "PRV-2026-0042 (nuova revisione) · Mario Rossi" in mail.text
    assert not digest_from_quote({"quote_number": "PRV-2026-0042"}).is_revision
    # A revision of a quote the team rejected before ever sending it.
    assert digest_from_quote({"quote_number": "PRV-2026-0042", "client_revision": True}).is_revision


def test_admin_email_for_a_change_asked_in_the_chat():
    mail = admin_client_followup_email(digest=_digest(), status_label="in revisione dal team", admin_url="https://a/")
    assert mail.subject == "[SYD] PRV-2026-0042: Mario Rossi chiede modifiche in chat"
    assert "Mario Rossi ha chiesto in chat altre modifiche al preventivo PRV-2026-0042" in mail.text
    assert "Stato attuale: in revisione dal team." in mail.text
    assert mail.text.splitlines()[-1] == "https://a/"
    assert _web_links(mail.html) == ["https://a/"]
    hostile = admin_client_followup_email(
        digest=_digest(client_name="<i>x</i>\nBcc: e@x.it"), status_label="approvato", admin_url="https://a/"
    )
    assert "\n" not in hostile.subject and "<i>x</i>" not in hostile.html


# ── Layout v3: brand roles, email-client-safe markup ─────────────────────────

def _all_emails():
    return [
        _client(),
        admin_new_requests_email(requests=[_digest(), _digest(quote_number="PRV-2026-0043")], admin_url="https://a/"),
        admin_client_followup_email(digest=_digest(), status_label="in revisione", admin_url="https://a/"),
    ]


def test_every_email_is_a_light_italian_document_with_the_logo():
    for mail in _all_emails():
        html = mail.html
        assert html.startswith("<!DOCTYPE html>") and '<html lang="it"' in html
        assert '<meta name="color-scheme" content="light">' in html
        assert '<meta name="supported-color-schemes" content="light">' in html
        logo = BRAND.email_logo
        assert f'<img src="{logo.url}" width="{logo.width}" height="{logo.height}" alt="{COMPANY.name}"' in html
        # Gmail drops <body> styles: the canvas is painted by the outer table too.
        assert f'bgcolor="{BRAND.color("canvas")}"' in html and f'bgcolor="{BRAND.color("surface")}"' in html
        # Preheader: hidden from every client, Outlook included.
        assert "mso-hide:all" in html
        # Layout tables are announced as presentation only.
        assert "<table" in html and '<table role="presentation"' in html
        assert html.count("<table") == html.count('<table role="presentation"')


def test_footer_links_call_and_write_to_the_company():
    phone = "".join(c for c in COMPANY.phone if c.isdigit() or c == "+")
    for mail in _all_emails():
        assert f'href="tel:{phone}"' in mail.html
        assert f'href="mailto:{COMPANY.email}"' in mail.html
        assert f"color:{BRAND.color('ink-muted')}" in mail.html


def test_the_button_is_brand_primary_with_its_contrast_pair():
    for mail in _all_emails():
        assert f'bgcolor="{BRAND.color("primary")}"' in mail.html
        assert f"color:{BRAND.color('on-primary')}" in mail.html


def test_client_email_says_draft_right_above_the_amount():
    html = _client().html
    label = html.index("Bozza · da confermare con il tecnico")
    amount = html.index("€ 1.234,56")
    assert label < amount
    assert f"background-color:{BRAND.color('warning-subtle')}" in html
    assert f"color:{BRAND.color('warning-ink')}" in html
    assert "IVA inclusa · valida fino al 10/11/2026" in html
    assert html.index("Apri la bozza nell'area riservata") > amount


def test_client_email_says_what_happens_next_in_three_steps():
    mail = _client()
    for part in (mail.html, mail.text):
        assert "Cosa succede ora" in part
        assert "sopralluogo" in part and "conferma" in part and "firmi" in part
    assert [line[:2] for line in mail.text.splitlines() if re.match(r"^\d\. ", line)] == ["1.", "2.", "3."]


def test_team_message_keeps_its_line_breaks_and_comes_before_the_notice():
    html = _client(admin_message="Riga uno\nRiga <due>").html
    assert "Riga uno<br>Riga &lt;due&gt;" in html
    assert html.index("Riga uno") < html.index("bozza generata automaticamente")


def test_admin_digest_has_one_row_per_request_with_the_amount_apart():
    mail = admin_new_requests_email(
        requests=[_digest(), _digest(quote_number="PRV-2026-0043", grand_total=12480.5, client_email=None)],
        admin_url="https://a/",
    )
    html = mail.html
    assert html.count('data-request="') == 2
    # The amount is a cell of its own that never wraps ("€" and "12.480,50" stay together).
    assert re.search(r'<td[^>]*white-space:nowrap[^>]*>€ 12\.480,50</td>', html)
    assert 'href="mailto:mario@example.it"' in html
