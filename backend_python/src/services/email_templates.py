"""
Email templates for the quote flow (Phase 128 — template v2, layout v3).

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

Layout v3 follows the site's brand: colours are semantic roles of the light
theme (`BRAND.color`, generated from web_client/brand), never literals. The
markup is what email clients render reliably: nested 600 px tables with their
own background (Gmail drops `<body>` styles), inline styles, a hidden
preheader, `lang="it"` and a light-only colour scheme.
"""
from __future__ import annotations

import datetime
import re
from dataclasses import dataclass
from decimal import Decimal
from html import escape
from typing import Any

from src.core.brand import BRAND
from src.core.company import COMPANY
from src.core.money import Amount, to_cents
from src.utils.format_it import format_date, format_eur

_CONTROL = re.compile(r"[\x00-\x1f\x7f]+")
_FILENAME_UNSAFE = re.compile(r"[^A-Za-z0-9-]+")
# An address safe in a mailto: link (no ?, & or spaces that would add headers or a body).
_PLAIN_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Web fonts are unreliable in mail clients: Georgia stands in for the site's
# serif (Playfair Display) on headings and the amount, Arial for Lato.
_SERIF = "Georgia,'Times New Roman',Times,serif"
_SANS = "Arial,Helvetica,sans-serif"
_WIDTH = 600
_GUTTER = 32

DRAFT_LABEL = "Bozza · da confermare con il tecnico"
NEXT_STEPS = (
    "Un nostro tecnico ti contatta per un sopralluogo o una telefonata.",
    "Verifica con te misure e lavorazioni e conferma il preventivo con gli importi definitivi.",
    "Se ti convince, firmi l'accettazione e concordiamo l'inizio dei lavori.",
)


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
    grand_total: Decimal
    summary: str
    # A new revision of a quote the client already received.
    is_revision: bool = False


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
        grand_total=to_cents((quote.get("financials") or {}).get("grand_total") or 0),
        summary=str((quote.get("request") or {}).get("summary") or ""),
        # Sent before, or a revision opened from the chat (a rejected quote too).
        is_revision=bool(quote.get("sent_at") or quote.get("client_revision")),
    )


# ── HTML building blocks ──────────────────────────────────────────────────────

def _c(role: str) -> str:
    return BRAND.color(role)


def _t(value: str) -> str:
    """Text node: escaped, quotes left readable."""
    return escape(value, quote=False)


def _attr(value: str) -> str:
    return escape(value, quote=True)


def _table(rows: str, *, width: str = "100%", style: str = "") -> str:
    return (
        f'<table role="presentation" width="{width}" cellpadding="0" cellspacing="0" border="0"'
        f'{f" style={chr(34)}{style}{chr(34)}" if style else ""}>{rows}</table>'
    )


def _p(inner: str, style: str = "") -> str:
    return f'<p style="margin:0 0 16px;{style}">{inner}</p>'


def _h2(text: str) -> str:
    return (
        f'<h2 style="margin:28px 0 12px;font-family:{_SERIF};font-size:20px;line-height:1.3;'
        f'font-weight:normal;color:{_c("ink")};">{_t(text)}</h2>'
    )


def _link(href: str, label: str, color: str) -> str:
    # nowrap: a phone number or an address must not break across lines.
    return (
        f'<a href="{_attr(href)}" style="color:{color};text-decoration:underline;white-space:nowrap;">'
        f"{_t(label)}</a>"
    )


def _button(url: str, label: str) -> str:
    """A filled cell around the link: Outlook paints the cell (and its
    mso-padding-alt) where it ignores the link's own padding."""
    primary = _c("primary")
    cell = (
        f'<td align="center" bgcolor="{primary}" style="border-radius:6px;background-color:{primary};'
        f'mso-padding-alt:14px 28px;">'
        f'<a href="{_attr(url)}" style="display:inline-block;padding:14px 28px;font-family:{_SANS};'
        f'font-size:16px;line-height:20px;font-weight:bold;color:{_c("on-primary")};text-decoration:none;'
        f'border-radius:6px;">{_t(label)}</a></td>'
    )
    return _table(f"<tr>{cell}</tr>", width="auto", style="margin:8px 0 24px;")


def _phone_href() -> str:
    return "tel:" + "".join(ch for ch in COMPANY.phone if ch.isdigit() or ch == "+")


def _document(inner: str, *, title: str, preheader: str) -> str:
    canvas, surface, line, ink, muted = _c("canvas"), _c("surface"), _c("line"), _c("ink"), _c("ink-muted")
    logo = BRAND.email_logo
    # Fills the inbox preview after the preheader, so the body text does not leak into it.
    spacer = "&#x34F;&zwnj;&nbsp;" * 40
    head = (
        '<meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="x-apple-disable-message-reformatting">'
        '<meta name="color-scheme" content="light">'
        '<meta name="supported-color-schemes" content="light">'
        f"<title>{_t(title)}</title>"
        "<style>:root{color-scheme:light;supported-color-schemes:light}"
        "body{margin:0;padding:0;-webkit-text-size-adjust:100%}"
        "a[x-apple-data-detectors]{color:inherit!important;text-decoration:inherit!important}"
        f"@media (max-width:{_WIDTH}px){{.syd-gutter{{padding-left:20px!important;padding-right:20px!important}}}}"
        "</style>"
    )
    header = (
        f'<tr><td class="syd-gutter" style="padding:28px {_GUTTER}px 20px;">'
        f'<img src="{_attr(logo.url)}" width="{logo.width}" height="{logo.height}" alt="{_attr(COMPANY.name)}" '
        f'style="display:block;width:{logo.width}px;height:{logo.height}px;border:0;outline:0;text-decoration:none;'
        f'font-family:{_SERIF};font-size:20px;line-height:{logo.height}px;color:{ink};"></td></tr>'
        # Decorative sand rule, the brand's accent (not information: no contrast requirement).
        f'<tr><td class="syd-gutter" style="padding:0 {_GUTTER}px;">'
        + _table(
            f'<tr><td height="2" bgcolor="{_c("accent")}" style="height:2px;line-height:2px;font-size:0;'
            f'background-color:{_c("accent")};">&nbsp;</td></tr>'
        )
        + "</td></tr>"
    )
    body = (
        f'<tr><td class="syd-gutter" style="padding:28px {_GUTTER}px 12px;font-family:{_SANS};font-size:16px;'
        f'line-height:1.6;color:{ink};">{inner}</td></tr>'
    )
    footer = (
        f'<tr><td class="syd-gutter" style="padding:20px {_GUTTER}px 28px;border-top:1px solid {line};'
        f'font-family:{_SANS};font-size:13px;line-height:1.6;color:{muted};">'
        f"{_t(COMPANY.legal_line)} · {_t(COMPANY.full_address)}<br>"
        f"{_link(_phone_href(), COMPANY.phone, muted)} · {_link(f'mailto:{COMPANY.email}', COMPANY.email, muted)}"
        "</td></tr>"
    )
    card = (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{surface}" '
        f'style="max-width:{_WIDTH}px;background-color:{surface};border:1px solid {line};border-radius:8px;">'
        f"{header}{body}{footer}</table>"
    )
    page = (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{canvas}" '
        f'style="background-color:{canvas};"><tr><td align="center" style="padding:24px 12px;">'
        # Outlook (Word) ignores max-width: it gets a fixed-width wrapper instead.
        f'<!--[if mso]><table role="presentation" width="{_WIDTH}" cellpadding="0" cellspacing="0" border="0">'
        "<tr><td><![endif]-->"
        f"{card}"
        "<!--[if mso]></td></tr></table><![endif]-->"
        "</td></tr></table>"
    )
    return (
        "<!DOCTYPE html>"
        '<html lang="it" xmlns="http://www.w3.org/1999/xhtml">'
        f"<head>{head}</head>"
        f'<body style="margin:0;padding:0;background-color:{canvas};">'
        f'<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;'
        f'font-size:1px;line-height:1px;color:{canvas};">{_t(preheader)}{spacer}</div>'
        f"{page}</body></html>"
    )


def _draft_amount(total: str, note: str) -> str:
    """The status first, then the amount on a line of its own, then what it includes."""
    status = _table(
        f'<tr><td bgcolor="{_c("warning-subtle")}" style="padding:4px 10px;border-radius:4px;'
        f'background-color:{_c("warning-subtle")};font-family:{_SANS};font-size:13px;line-height:18px;'
        f'font-weight:bold;color:{_c("warning-ink")};">{_t(DRAFT_LABEL)}</td></tr>',
        width="auto",
    )
    return (
        f'<div style="margin:24px 0 20px;">{status}'
        f'<p style="margin:12px 0 4px;font-family:{_SERIF};font-size:32px;line-height:1.2;color:{_c("ink")};'
        f'white-space:nowrap;">{_t(total)}</p>'
        f'<p style="margin:0;font-size:14px;line-height:1.5;color:{_c("ink-muted")};">{_t(note)}</p></div>'
    )


def _steps(steps: tuple[str, ...]) -> str:
    rows = "".join(
        f'<tr><td width="32" valign="top" style="padding:0 0 12px;font-family:{_SERIF};font-size:18px;'
        f'line-height:24px;color:{_c("accent-ink")};">{n}</td>'
        f'<td valign="top" style="padding:0 0 12px;font-family:{_SANS};font-size:16px;line-height:24px;'
        f'color:{_c("ink")};">{_t(step)}</td></tr>'
        for n, step in enumerate(steps, start=1)
    )
    return _table(rows, style="margin:0 0 8px;")


def _note_box(title: str, body: str) -> str:
    muted = _c("surface-muted")
    return _table(
        f'<tr><td bgcolor="{muted}" style="padding:16px 20px;border-radius:6px;background-color:{muted};'
        f'font-family:{_SANS};font-size:15px;line-height:1.6;color:{_c("ink")};">'
        f"<strong>{_t(title)}</strong><br>{_t(body).replace(chr(10), '<br>')}</td></tr>",
        style="margin:8px 0 20px;",
    )


# ── Client: the draft quote, after the admin's approval ───────────────────────

def client_quote_email(
    *,
    client_name: str | None,
    quote_number: str | None,
    grand_total: Amount,
    valid_until: datetime.date | datetime.datetime | None = None,
    revision: int = 1,
    has_attachment: bool = True,
    admin_message: str | None = None,
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
    includes = f"IVA inclusa · valida fino al {format_date(valid_until)}" if valid_until else "IVA inclusa"
    notice = (
        "Si tratta di una bozza generata automaticamente, non di un preventivo definitivo: "
        "verrà confermata da un nostro tecnico dopo un sopralluogo o un contatto telefonico, "
        "e importi e lavorazioni possono variare."
    )
    url = dashboard_quotes_url()
    # Optional note typed by the admin in the Send dialog (plain text, escaped).
    note = (admin_message or "").strip()
    intro = f"abbiamo preparato la bozza di preventivo{f' {ref}' if ref else ''} per il tuo progetto: {where}."
    closing = f"Per qualsiasi domanda rispondi a questa email o chiamaci al {COMPANY.phone}."

    text = "\n".join(
        [
            greeting,
            "",
            intro,
            "",
            DRAFT_LABEL,
            f"Importo indicativo: {total} (IVA inclusa)",
            *([validity] if validity else []),
            "",
            "Cosa succede ora:",
            *[f"{n}. {step}" for n, step in enumerate(NEXT_STEPS, start=1)],
            "",
            *(["Messaggio dal nostro team:", note, ""] if note else []),
            f"IMPORTANTE: {notice}",
            "",
            f"Area riservata: {url}",
            "",
            closing,
            "",
            "Cordiali saluti,",
            COMPANY.name,
        ]
    )
    muted = _c("ink-muted")
    html = _document(
        _p(_t(greeting))
        + _p(
            f"abbiamo preparato la <strong>bozza di preventivo{_t(f' {ref}') if ref else ''}</strong> "
            f"per il tuo progetto: {_t(where)}.",
            "margin:0;",
        )
        + _draft_amount(total, includes)
        + _button(url, "Apri la bozza nell'area riservata")
        + _h2("Cosa succede ora")
        + _steps(NEXT_STEPS)
        + (_note_box("Messaggio dal nostro team", note) if note else "")
        + _p(f"<strong>Importante:</strong> {_t(notice)}", f"font-size:14px;line-height:1.6;color:{muted};")
        # The text version's sentence, with the phone number as a link.
        + _p(_t(closing).replace(_t(COMPANY.phone), _link(_phone_href(), COMPANY.phone, _c("primary-ink"))))
        + _p(f"Cordiali saluti,<br>{_t(COMPANY.name)}"),
        title=subject,
        preheader=f"{DRAFT_LABEL}: importo indicativo {total}",
    )
    return EmailContent(subject=subject, text=text, html=html)


# ── Admin: new quote request(s) to review ─────────────────────────────────────

def _who(digest: RequestDigest) -> str:
    name = one_line(digest.client_name)
    if name:
        return name
    return "un cliente ospite" if digest.client_is_guest else "un cliente"


def _summary(digest: RequestDigest) -> str:
    summary = one_line(digest.summary)
    return f"{summary[:200]}{'…' if len(summary) > 200 else ''}"


def _request_row(digest: RequestDigest) -> str:
    """One request: number and status, client and contact, request; the amount in its own cell."""
    line, ink, muted = _c("line"), _c("ink"), _c("ink-muted")
    number = one_line(digest.quote_number) or "Preventivo"
    revision = (
        f' <span style="color:{_c("accent-ink")};">· nuova revisione</span>' if digest.is_revision else ""
    )
    email = one_line(digest.client_email)
    if not email:
        contact = ""
    elif _PLAIN_EMAIL.fullmatch(email):
        contact = f" · {_link(f'mailto:{email}', email, _c('primary-ink'))}"
    else:
        contact = f" · {_t(email)}"
    summary = _summary(digest)
    cell = f"padding:14px 0;border-top:1px solid {line};font-family:{_SANS};vertical-align:top;"
    return (
        f'<tr data-request="{_attr(number)}">'
        f'<td style="{cell}font-size:15px;line-height:1.5;color:{ink};">'
        f"<strong>{_t(number)}</strong>{revision}<br>{_t(_who(digest))}{contact}"
        + (f'<br><span style="font-size:14px;color:{muted};">{_t(summary)}</span>' if summary else "")
        + "</td>"
        f'<td align="right" style="{cell}padding-left:16px;font-size:15px;line-height:1.5;font-weight:bold;'
        f'color:{ink};white-space:nowrap;">{_t(format_eur(digest.grand_total))}</td></tr>'
    )


def admin_new_requests_email(*, requests: list[RequestDigest], admin_url: str) -> EmailContent:
    first = requests[0]
    if len(requests) == 1:
        number = one_line(first.quote_number)
        kind = "Nuova revisione" if first.is_revision else "Nuova richiesta"
        subject = (
            f"{kind} {number} da {_who(first)} ({format_eur(first.grand_total)})"
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
        if r.is_revision:
            label = f"{label} (nuova revisione)"
        summary = _summary(r)
        summary = f" — {summary}" if summary else ""
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
    rows = "".join(_request_row(r) for r in requests)
    html = _document(
        _p("Hai nuove richieste di preventivo da revisionare:")
        + _table(rows, style=f"margin:0 0 24px;border-bottom:1px solid {_c('line')};")
        + _button(admin_url, "Apri la console admin"),
        title=subject,
        preheader=subject,
    )
    return EmailContent(subject=subject, text=text, html=html)


def admin_client_followup_email(*, digest: RequestDigest, status_label: str, admin_url: str) -> EmailContent:
    """The client asked for changes in the chat while the team has the quote
    (in review, or approved and about to be sent): nothing was written."""
    number = one_line(digest.quote_number) or "senza numero"
    who = _who(digest)
    subject = f"[SYD] {number}: {who} chiede modifiche in chat"
    intro = f"{who} ha chiesto in chat altre modifiche al preventivo {number}."
    status = f"Stato attuale: {one_line(status_label)}."
    text = "\n".join(
        [intro, status, "", "Leggi la chat dalla scheda del preventivo nella console admin:", admin_url]
    )
    html = _document(
        _p(_t(intro))
        + _p(_t(status), f"color:{_c('ink-muted')};")
        + _p("Leggi la chat dalla scheda del preventivo nella console admin.")
        + _button(admin_url, "Apri la console admin"),
        title=subject,
        preheader=subject,
    )
    return EmailContent(subject=subject, text=text, html=html)
