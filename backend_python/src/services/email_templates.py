"""
Email templates for the quote flow (Phase 128 — template v2).

Pure functions returning `EmailContent(subject, text, html)`: no I/O, so the
same content is used by today's SMTP path and by the Phase 4 outbox/Brevo
provider. Rules (tests: tests/unit/test_email_templates.py):

- no UUIDs or uids anywhere: quotes are identified by their PRV number and
  clients by name ("Gentile Cliente" only when the name is unknown);
- the client email never carries a signed Storage link: the PDF is attached
  and the body points to the login-protected `/dashboard/quotes` page, so a
  forwarded email cannot leak the document;
- every dynamic value is HTML-escaped and subjects/headers are single-line
  (a client name with a newline cannot inject headers);
- the wording says what the document is: an AUTOMATIC DRAFT confirmed by a
  technician after a site visit or phone contact (`QUOTE_TERMS`).
"""
from __future__ import annotations

import datetime
import re
from dataclasses import dataclass
from html import escape
from typing import Any

from src.core.company import COMPANY
from src.utils.format_it import format_date, format_eur

_DARK = "#2C3E50"
_GOLD = "#C9A84C"
_CONTROL = re.compile(r"[\x00-\x1f\x7f]+")
_FILENAME_UNSAFE = re.compile(r"[^A-Za-z0-9-]+")


@dataclass(frozen=True)
class EmailContent:
    subject: str
    text: str
    html: str


@dataclass(frozen=True)
class RequestDigest:
    """One quote request as the admin notification shows it."""
    quote_number: str | None
    client_name: str | None
    client_email: str | None
    client_is_guest: bool
    grand_total: float
    summary: str


def one_line(value: Any) -> str:
    """Collapse control characters (CR/LF/tab…) so the value is header-safe."""
    return _CONTROL.sub(" ", str(value if value is not None else "")).strip()


def attachment_filename(quote_number: str | None) -> str:
    """`Bozza_preventivo_PRV-2026-0042.pdf` — number only, no personal data."""
    stem = _FILENAME_UNSAFE.sub("", quote_number or "") or "SYD"
    return f"Bozza_preventivo_{stem}.pdf"


def dashboard_quotes_url() -> str:
    return f"{COMPANY.url}/dashboard/quotes"


def digest_from_quote(quote: dict[str, Any]) -> RequestDigest:
    snapshot = quote.get("client_snapshot") or {}
    return RequestDigest(
        quote_number=quote.get("quote_number"),
        client_name=snapshot.get("display_name"),
        client_email=snapshot.get("email"),
        client_is_guest=bool(snapshot.get("is_guest")),
        grand_total=float((quote.get("financials") or {}).get("grand_total", 0.0)),
        summary=str((quote.get("request") or {}).get("summary") or ""),
    )


# ── HTML building blocks ──────────────────────────────────────────────────────

def _layout(inner: str, preheader: str) -> str:
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;'
        f'color:{_DARK};">'
        f'<span style="display:none;max-height:0;overflow:hidden;">{escape(preheader)}</span>'
        f'<div style="background:{_DARK};padding:22px;text-align:center;">'
        f'<h1 style="color:{_GOLD};margin:0;font-size:22px;">{escape(COMPANY.name)}</h1></div>'
        f'<div style="padding:24px;font-size:15px;line-height:1.5;">{inner}</div>'
        '<div style="padding:16px 24px;border-top:1px solid #dee2e6;font-size:12px;color:#777;">'
        f"{escape(COMPANY.legal_line)} · {escape(COMPANY.full_address)}<br>"
        f"{escape(COMPANY.phone)} · {escape(COMPANY.email)}</div></div>"
    )


def _button(url: str, label: str) -> str:
    return (
        '<p style="text-align:center;margin:24px 0;">'
        f'<a href="{escape(url, quote=True)}" style="background:{_GOLD};color:#ffffff;'
        'padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold;">'
        f"{escape(label)}</a></p>"
    )


# ── Client: the draft quote, after the admin's approval ───────────────────────

def client_quote_email(
    *,
    client_name: str | None,
    quote_number: str | None,
    grand_total: float,
    valid_until: datetime.date | datetime.datetime | None = None,
    revision: int = 1,
    has_attachment: bool = True,
) -> EmailContent:
    name = one_line(client_name)
    greeting = f"Gentile {name}," if name else "Gentile Cliente,"
    number = one_line(quote_number)
    ref = f"{number} (rev. {revision})" if number and revision > 1 else number
    subject = f"Bozza di preventivo {number} – {COMPANY.name}" if number else f"Bozza di preventivo – {COMPANY.name}"
    where = (
        "la trovi in allegato (PDF) e nella tua area riservata"
        if has_attachment
        else "la trovi nella tua area riservata"
    )
    total = format_eur(grand_total)
    validity = f"Valida fino al: {format_date(valid_until)}" if valid_until else ""
    notice = (
        "Si tratta di una bozza generata automaticamente, non di un preventivo definitivo: "
        "verrà confermata da un nostro tecnico dopo un sopralluogo o un contatto telefonico, "
        "e importi e lavorazioni possono variare."
    )
    url = dashboard_quotes_url()

    text = "\n".join(
        [
            greeting,
            "",
            f"abbiamo preparato la bozza di preventivo{f' {ref}' if ref else ''} per il tuo progetto: {where}.",
            "",
            f"Importo indicativo: {total} (IVA inclusa)",
            *([validity] if validity else []),
            "",
            f"IMPORTANTE: {notice}",
            "",
            f"Area riservata: {url}",
            "",
            f"Per qualsiasi domanda rispondi a questa email o chiamaci al {COMPANY.phone}.",
            "",
            "Cordiali saluti,",
            COMPANY.name,
        ]
    )
    html = _layout(
        f"<p>{escape(greeting)}</p>"
        f"<p>abbiamo preparato la <strong>bozza di preventivo{escape(f' {ref}') if ref else ''}</strong> "
        f"per il tuo progetto: {escape(where)}.</p>"
        f'<p style="font-size:20px;margin:16px 0;">Importo indicativo: <strong>{escape(total)}</strong> '
        '<span style="font-size:13px;">(IVA inclusa)</span>'
        + (f'<br><span style="font-size:13px;">{escape(validity)}</span>' if validity else "")
        + "</p>"
        '<p style="background:#FFF8E1;border:1px solid #C9A84C;border-radius:6px;padding:12px;font-size:13px;">'
        f"<strong>Importante:</strong> {escape(notice)}</p>"
        + _button(url, "Apri la tua area riservata")
        + f"<p>Per qualsiasi domanda rispondi a questa email o chiamaci al {escape(COMPANY.phone)}.</p>"
        f"<p>Cordiali saluti,<br>{escape(COMPANY.name)}</p>",
        preheader=f"Bozza di preventivo {number} — importo indicativo {total}",
    )
    return EmailContent(subject=subject, text=text, html=html)


# ── Admin: new quote request(s) to review ─────────────────────────────────────

def _who(digest: RequestDigest) -> str:
    name = one_line(digest.client_name)
    if name:
        return name
    return "un cliente ospite" if digest.client_is_guest else "un cliente"


def admin_new_requests_email(*, requests: list[RequestDigest], admin_url: str) -> EmailContent:
    first = requests[0]
    if len(requests) == 1:
        number = one_line(first.quote_number)
        subject = (
            f"Nuova richiesta {number} da {_who(first)} ({format_eur(first.grand_total)})"
            if number
            else f"Nuova richiesta di preventivo da {_who(first)} ({format_eur(first.grand_total)})"
        )
    else:
        who = {_who(r) for r in requests}
        by = _who(first) if len(who) == 1 else "più clienti"
        subject = f"{len(requests)} nuove richieste di preventivo da {by}"
    subject = f"[SYD] {subject}"

    def line(r: RequestDigest) -> str:
        contact = f" <{one_line(r.client_email)}>" if r.client_email else ""
        label = one_line(r.quote_number) or "Preventivo"
        summary = one_line(r.summary)
        summary = f" — {summary[:200]}{'…' if len(summary) > 200 else ''}" if summary else ""
        return f"{label} · {_who(r)}{contact} · {format_eur(r.grand_total)}{summary}"

    text = "\n".join(
        [
            "Hai nuove richieste di preventivo da revisionare:",
            "",
            *[f"• {line(r)}" for r in requests],
            "",
            "Apri la console admin per approvare o modificare:",
            admin_url,
        ]
    )
    rows = "".join(f'<li style="margin-bottom:8px;">{escape(line(r))}</li>' for r in requests)
    html = _layout(
        "<p>Hai nuove richieste di preventivo da revisionare:</p>"
        f'<ul style="padding-left:18px;">{rows}</ul>'
        + _button(admin_url, "Apri la console admin"),
        preheader=subject,
    )
    return EmailContent(subject=subject, text=text, html=html)
