"""
PdfService: branded A4 "bozza di preventivo" (Phase 128 — PDF v2, layout v3) + upload.

Uses ReportLab Platypus (pure Python, zero system deps). The document is an
AUTOMATIC DRAFT quote that a SYD technician approves after a site visit or a
phone contact: the title, the status box, the "BOZZA" watermark, the legal
box and the acknowledgement label say so (texts in
`src/core/company.py::quote_terms()`, from the company info).

Rules this module guarantees (tests: tests/unit/test_pdf_service_v2.py):
- the client is identified by NAME from the quote's `client_snapshot`
  (or `client_name`), never by Firebase uid or project id;
- every user-controlled string is XML-escaped before reaching a Paragraph
  (an "&" or "<b>" in a description must not break or style the layout);
- amounts and quantities use Italian formatting ("1.234,56");
- the issue date is the approval date (`review.approved_at`) when present, so
  re-rendering the same revision yields the same document;
- colours are semantic roles of the site's light theme (`BRAND.color`,
  generated from web_client/brand), never literals; the logo is the brand's
  generated PNG.

Pattern: generating-pdf-documents skill (CPU-bound work → asyncio.to_thread).
"""
import asyncio
import datetime
import logging
from io import BytesIO
from typing import Any
from xml.sax.saxutils import escape

from firebase_admin import storage
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    Flowable,
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from src.core.brand import BRAND
from src.core.company import company, quote_terms
from src.core.money import sum_amounts
from src.schemas.room import DEFAULT_ROOM_ID, DEFAULT_ROOM_LABEL
from src.utils.format_it import format_date, format_eur, format_number, format_qty

logger = logging.getLogger(__name__)


def _role(role: str, surface: str = "default") -> Color:
    return HexColor(BRAND.color(role, surface))


# ─── Layout constants ──────────────────────────────────────────────────────────
_PAGE_W, _PAGE_H = A4
_MARGIN = 20 * mm
_USABLE_W = _PAGE_W - 2 * _MARGIN
_LOGO_W = 52 * mm

_SURFACE = _role("surface")
_CANVAS = _role("canvas")
_SURFACE_MUTED = _role("surface-muted")
_INK = _role("ink")
_INK_MUTED = _role("ink-muted")
_LINE = _role("line")
_LINE_STRONG = _role("line-strong")
_ACCENT = _role("accent")  # decorative rules only (no contrast requirement)
_ACCENT_INK = _role("accent-ink")
_STATUS_BG = _role("warning-subtle")
_STATUS_INK = _role("warning-ink")
# The items table header sits on the brand's night-blue band (the site's footer).
_BAND = _role("canvas", "inverse")
_ON_BAND = _role("ink", "inverse")

# Signed URL expiration: 7 days — the URL is embedded in the client delivery
# email and must outlive the inbox turnaround (the on-demand /quote/{id}/pdf
# endpoint keeps its own short 15-minute TTL for interactive use).
_SIGNED_URL_EXPIRY = datetime.timedelta(days=7)

_DOC_TITLE = "Bozza di preventivo"
_WATERMARK = "BOZZA"


# ─── Formatting helpers ────────────────────────────────────────────────────────

def room_sections(quote_data: dict[str, Any]) -> list[tuple[dict[str, Any], list[dict[str, Any]]]]:
    """The sections of a multi-room quote that have lines, each with its lines
    (a line of an unknown room counts in "Generale", like its subtotal)."""
    rooms = [r for r in quote_data.get("rooms") or [] if r.get("room_id")]
    if not rooms:
        return []
    known = {r["room_id"] for r in rooms}
    lines: dict[str, list[dict[str, Any]]] = {}
    for item in quote_data.get("items") or []:
        room_id = item.get("room_id") if item.get("room_id") in known else DEFAULT_ROOM_ID
        lines.setdefault(room_id, []).append(item)
    if DEFAULT_ROOM_ID in lines and DEFAULT_ROOM_ID not in known:
        rooms.append({
            "room_id": DEFAULT_ROOM_ID, "room_label": DEFAULT_ROOM_LABEL, "room_type": "altro",
            "room_subtotal": sum_amounts(item.get("total") or 0 for item in lines[DEFAULT_ROOM_ID]),
        })
    return [(room, lines[room["room_id"]]) for room in rooms if lines.get(room["room_id"])]


def _txt(value: Any) -> str:
    """User-controlled text → safe Paragraph markup."""
    return escape(str(value if value is not None else "")).replace("\n", "<br/>")


def resolve_issue_date(quote_data: dict) -> datetime.datetime:
    """Approval date when known (stable across re-renders), else now (UTC)."""
    approved_at = (quote_data.get("review") or {}).get("approved_at")
    if isinstance(approved_at, datetime.datetime):
        return approved_at
    return datetime.datetime.now(datetime.UTC)


def resolve_validity(quote_data: dict) -> tuple[datetime.datetime, int, datetime.datetime]:
    """(issue date, validity days, valid-until date) — shared by the PDF and the email."""
    issue_date = resolve_issue_date(quote_data)
    days = int(quote_data.get("validity_days") or quote_terms().validity_days)
    return issue_date, days, issue_date + datetime.timedelta(days=days)


def resolve_client(quote_data: dict) -> dict[str, str]:
    """Client block from the snapshot / client_* fields. Never the uid."""
    snapshot = quote_data.get("client_snapshot") or {}
    return {
        "name": snapshot.get("display_name") or quote_data.get("client_name") or "Cliente",
        "email": snapshot.get("email") or quote_data.get("client_email") or "",
        "phone": snapshot.get("phone") or quote_data.get("client_phone") or "",
    }


def quote_pdf_blob_path(project_id: str, quote_number: str | None, version: int | None) -> str:
    """`projects/{pid}/quotes/PRV-2026-0042_r3.pdf` — no personal data in the name."""
    if quote_number:
        return f"projects/{project_id}/quotes/{quote_number}_r{int(version or 1)}.pdf"
    ts = int(datetime.datetime.now(datetime.UTC).timestamp())
    return f"projects/{project_id}/quotes/quote_{ts}.pdf"


def status_box(text: str) -> Table:
    """The document's status as a compact right-aligned label, sized to its text
    (a Table cell without a width would stretch to the whole column)."""
    label = text.upper()
    font, size, pad = "Helvetica-Bold", 10, 8
    box = Table(
        [[label]],
        colWidths=[stringWidth(label, font, size) + 2 * pad],
        hAlign="RIGHT",
    )
    box.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font), ("FONTSIZE", (0, 0), (-1, -1), size),
        ("TEXTCOLOR", (0, 0), (-1, -1), _STATUS_INK), ("BACKGROUND", (0, 0), (-1, -1), _STATUS_BG),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), pad), ("RIGHTPADDING", (0, 0), (-1, -1), pad),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return box


# ─── Page decoration: watermark and footer on every page, "Pagina x di y" ──────

class _NumberedCanvas(canvas.Canvas):
    """Two-pass canvas so each page can print the total page count."""

    def __init__(self, *args: Any, footer_left: str = "", **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._saved_pages: list[dict] = []
        self._footer_left = footer_left

    def showPage(self) -> None:  # noqa: N802 — ReportLab API
        self._saved_pages.append(dict(self.__dict__))
        self._startPage()  # pyright: ignore[reportAttributeAccessIssue]  # ReportLab internal

    def save(self) -> None:
        total = len(self._saved_pages)
        for state in self._saved_pages:
            self.__dict__.update(state)
            self._draw_watermark()
            self._draw_footer(total)
            super().showPage()
        super().save()

    def _draw_watermark(self) -> None:
        """"BOZZA" across the page, drawn over the content in Multiply mode:
        the light role darkens white paper and leaves the text as dark as it was
        (table cells have opaque backgrounds, so a watermark under them would vanish)."""
        self.saveState()
        self.setBlendMode("Multiply")
        self.setFillColor(_LINE)
        self.setFillAlpha(0.6)
        self.setFont("Helvetica-Bold", 120)
        self.translate(_PAGE_W / 2, _PAGE_H / 2)
        self.rotate(35)
        self.drawCentredString(0, -42, _WATERMARK)
        self.restoreState()

    def _draw_footer(self, total: int) -> None:
        self.setStrokeColor(_LINE)
        self.setLineWidth(0.5)
        self.line(_MARGIN, 14 * mm, _PAGE_W - _MARGIN, 14 * mm)
        self.setFont("Helvetica", 8.5)
        self.setFillColor(_INK_MUTED)
        self.drawString(_MARGIN, 9.5 * mm, self._footer_left)
        self.drawRightString(_PAGE_W - _MARGIN, 9.5 * mm, f"Pagina {self.getPageNumber()} di {total}")


class PdfService:
    """Generates the branded A4 draft-quote PDF and uploads it to Firebase Storage."""

    def generate_pdf_bytes(self, quote_data: dict) -> bytes:
        """
        Generate PDF bytes using ReportLab Platypus (automatic page breaks).

        Args:
            quote_data: Full quote dict from Firestore (items, financials,
                quote_number, version, client_snapshot, request, admin_notes,
                review...). `project_name` / `client_name` are optional.

        Returns:
            Raw PDF bytes.
        """
        # Read once: the company info could be refreshed while the PDF is built.
        firm, qt = company(), quote_terms()
        issue_date, validity_days, valid_until = resolve_validity(quote_data)
        quote_number = quote_data.get("quote_number") or ""
        version = int(quote_data.get("version") or 1)
        client = resolve_client(quote_data)

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=_MARGIN,
            rightMargin=_MARGIN,
            topMargin=14 * mm,
            bottomMargin=20 * mm,
            title=f"{_DOC_TITLE} {quote_number}".strip(),
            author=firm.legal_name,
            subject="Bozza di preventivo generata automaticamente",
        )

        styles = getSampleStyleSheet()
        normal = ParagraphStyle("N", parent=styles["Normal"], fontSize=9.5, leading=13, textColor=_INK)
        small = ParagraphStyle("S", parent=normal, fontSize=8.5, leading=11.5, textColor=_INK_MUTED)
        label = ParagraphStyle(
            "L", parent=small, fontName="Helvetica-Bold", textColor=_ACCENT_INK, spaceAfter=1.5 * mm
        )
        h2 = ParagraphStyle(
            "H2", parent=styles["Heading2"], fontSize=12, leading=15, textColor=_INK,
            spaceBefore=3 * mm, spaceAfter=1.5 * mm,
        )
        story: list = []

        # ── Header: logo + company (left), document status and identity (right) ─
        meta_style = ParagraphStyle("Meta", parent=normal, alignment=2, fontSize=9, leading=12.5)  # right-aligned
        logo = BRAND.pdf_logo
        header_left = [
            Image(str(logo.path), width=_LOGO_W, height=_LOGO_W / logo.aspect, hAlign="LEFT"),
            Spacer(1, 3 * mm),
            Paragraph(
                f"{_txt(firm.legal_name)}<br/>{_txt(firm.full_address)}<br/>P.IVA {_txt(firm.vat_id)}",
                small,
            ),
        ]
        revision = f" · Rev. {version}" if version > 1 else ""
        header_right = [
            status_box(_DOC_TITLE),
            Spacer(1, 2.5 * mm),
            Paragraph(
                (f"<b>N° {_txt(quote_number)}</b>{revision}<br/>" if quote_number else "")
                + f"Data: {format_date(issue_date)}<br/>Valida fino al: {format_date(valid_until)}",
                meta_style,
            ),
        ]
        header = Table([[header_left, header_right]], colWidths=[_USABLE_W * 0.58, _USABLE_W * 0.42])
        # ALIGN, not the flowables' hAlign, places them inside a cell: the status box goes right.
        header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                    ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
        story.append(header)
        story.append(Spacer(1, 3 * mm))
        # Sand rule across the full content width, like the tables (the frame insets
        # plain flowables by 6 pt, so an HRFlowable would stop short of their edges).
        rule = Table([[""]], colWidths=[_USABLE_W], rowHeights=[0])
        rule.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, -1), 1.2, _ACCENT)]))
        story.append(rule)
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(f"<i>{_txt(qt.short_notice)}</i>", small))
        story.append(Spacer(1, 4 * mm))

        # ── Client + site ────────────────────────────────────────────────────
        request = quote_data.get("request") or {}
        client_lines = [f"<b>{_txt(client['name'])}</b>"]
        if client["email"]:
            client_lines.append(_txt(client["email"]))
        if client["phone"]:
            client_lines.append(_txt(client["phone"]))
        site_lines = []
        if quote_data.get("project_name"):
            site_lines.append(f"<b>{_txt(quote_data['project_name'])}</b>")
        if request.get("address"):
            site_lines.append(_txt(request["address"]))
        if request.get("footage_sqm"):
            site_lines.append(f"Superficie: circa {format_number(request['footage_sqm'], 1)} mq")
        if not site_lines:
            site_lines.append("Da definire con sopralluogo")
        parties = Table(
            [[
                [Paragraph("CLIENTE", label), Paragraph("<br/>".join(client_lines), normal)],
                [Paragraph("CANTIERE", label), Paragraph("<br/>".join(site_lines), normal)],
            ]],
            colWidths=[_USABLE_W * 0.5, _USABLE_W * 0.5],
        )
        parties.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, _LINE),
            ("LINEAFTER", (0, 0), (0, 0), 0.5, _LINE),
            ("BACKGROUND", (0, 0), (-1, -1), _CANVAS),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(parties)

        # ── What the client asked for ────────────────────────────────────────
        if request.get("summary") or request.get("technical_notes"):
            story.append(Paragraph("Richiesta del cliente", h2))
            if request.get("summary"):
                story.append(Paragraph(_txt(request["summary"]), normal))
            if request.get("technical_notes"):
                story.append(Spacer(1, 1.5 * mm))
                story.append(Paragraph(f"<b>Note tecniche:</b> {_txt(request['technical_notes'])}", normal))

        # ── Multi-room: per-room breakdown (if present) ──────────────────────
        sections = room_sections(quote_data)
        if sections:
            room_heading = ParagraphStyle("RH", parent=styles["Heading3"], fontSize=11, textColor=_INK,
                                          spaceBefore=3 * mm, spaceAfter=1.5 * mm)
            story.append(Paragraph("Dettaglio per ambiente", h2))
            for room, lines in sections:
                room_type = room.get("room_type")
                kind = f" ({_txt(room_type)})" if room_type and room_type != "altro" else ""
                story.append(Paragraph(f"{_txt(room.get('room_label', 'Stanza'))}{kind}", room_heading))
                details = []
                if room.get("floor_mq"):
                    details.append(f"Pavimento: ~{format_number(room['floor_mq'], 1)} mq")
                if room.get("walls_mq"):
                    details.append(f"Pareti: ~{format_number(room['walls_mq'], 1)} mq")
                details.append(f"Voci: {len(lines)}")
                details.append(f"Subtotale: {format_eur(room.get('room_subtotal') or 0)}")
                story.append(Paragraph(" · ".join(details), small))

        # ── Items table ──────────────────────────────────────────────────────
        story.append(Paragraph("Lavorazioni", h2))
        header_style = ParagraphStyle("TH", parent=normal, fontSize=8.5, textColor=_ON_BAND, fontName="Helvetica-Bold")
        header_right_style = ParagraphStyle("THR", parent=header_style, alignment=2)
        cell = ParagraphStyle("TD", parent=normal, fontSize=8.8, leading=11.5)
        cell_right = ParagraphStyle("TDR", parent=cell, alignment=2)
        table_data: list[list] = [[
            Paragraph("Descrizione", header_style),
            Paragraph("U.M.", header_style),
            Paragraph("Quantità", header_right_style),
            Paragraph("Prezzo unit.", header_right_style),
            Paragraph("Totale", header_right_style),
        ]]
        section_style = ParagraphStyle("TSEC", parent=cell, fontName="Helvetica-Bold", textColor=_INK)
        section_rows: list[int] = []
        subtotal_rows: list[int] = []

        def add_rows(lines: list[dict[str, Any]]) -> None:
            for item in lines:
                table_data.append([
                    Paragraph(_txt(item.get("description", "")), cell),
                    Paragraph(_txt(item.get("unit", "")), cell),
                    Paragraph(format_qty(item.get("qty", "")), cell_right),
                    Paragraph(format_eur(item.get("unit_price") or 0), cell_right),
                    Paragraph(format_eur(item.get("total") or 0), cell_right),
                ])

        if sections:
            # One block per room: its name, its lines, its subtotal.
            for room, lines in sections:
                room_label = _txt(room.get("room_label", "Stanza"))
                section_rows.append(len(table_data))
                table_data.append([Paragraph(room_label, section_style), "", "", "", ""])
                add_rows(lines)
                subtotal_rows.append(len(table_data))
                table_data.append([
                    Paragraph(f"Subtotale {room_label}", section_style), "", "", "",
                    Paragraph(f"<b>{format_eur(room.get('room_subtotal') or 0)}</b>", cell_right),
                ])
        else:
            add_rows(quote_data.get("items", []))
        col_widths = [_USABLE_W * w for w in (0.43, 0.08, 0.13, 0.18, 0.18)]
        items_table = Table(table_data, colWidths=col_widths, repeatRows=1)
        items_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), _BAND),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [_SURFACE, _CANVAS]),
            ("LINEBELOW", (0, 1), (-1, -1), 0.5, _LINE),
            ("BOX", (0, 0), (-1, -1), 0.5, _LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
            *(cmd for row in section_rows for cmd in (
                ("SPAN", (0, row), (-1, row)), ("BACKGROUND", (0, row), (-1, row), _SURFACE_MUTED),
            )),
            *(cmd for row in subtotal_rows for cmd in (
                ("SPAN", (0, row), (3, row)), ("BACKGROUND", (0, row), (-1, row), _SURFACE),
            )),
        ]))
        story.append(items_table)
        story.append(Spacer(1, 3 * mm))

        # ── Financials ───────────────────────────────────────────────────────
        financials = quote_data.get("financials", {})
        vat_rate = float(financials.get("vat_rate", 0.22))
        fin_data = [
            ["", "Imponibile:", format_eur(financials.get("subtotal") or 0)],
            ["", f"IVA ({vat_rate * 100:.0f}%):", format_eur(financials.get("vat_amount") or 0)],
            ["", "TOTALE (IVA inclusa):", format_eur(financials.get("grand_total") or 0)],
        ]
        fin_table = Table(fin_data, colWidths=[_USABLE_W * 0.46, _USABLE_W * 0.32, _USABLE_W * 0.22])
        fin_table.setStyle(TableStyle([
            ("FONTNAME", (1, 0), (-1, 1), "Helvetica"),
            ("FONTNAME", (1, 2), (2, 2), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 1), 9.5),
            ("FONTSIZE", (0, 2), (-1, 2), 11),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("TEXTCOLOR", (1, 0), (-1, 1), _INK_MUTED),
            ("TEXTCOLOR", (1, 2), (2, 2), _INK),
            ("BACKGROUND", (1, 2), (-1, 2), _SURFACE_MUTED),
            ("LINEABOVE", (1, 2), (-1, 2), 1, _ACCENT),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 2), (-1, 2), 6),
            ("BOTTOMPADDING", (0, 2), (-1, 2), 6),
        ]))
        story.append(KeepTogether([fin_table]))

        # ── Admin notes (printed on the document) ────────────────────────────
        if quote_data.get("admin_notes"):
            story.append(Paragraph("Note", h2))
            story.append(Paragraph(_txt(quote_data["admin_notes"]), normal))

        # ── Conditions (left) and the nature of the document (right) ─────────
        conditions: list[Flowable] = [
            Paragraph("Condizioni", ParagraphStyle("H2C", parent=h2, spaceBefore=0)),
            Paragraph(f"<b>Validità:</b> {validity_days} giorni, fino al {format_date(valid_until)}.", normal),
            Paragraph("<b>Pagamento:</b>", normal),
            *[Paragraph(f"• {_txt(term)}", normal) for term in qt.payment_terms],
        ]
        legal = [
            Paragraph(_txt(qt.disclaimer_title.upper()), ParagraphStyle("LT", parent=label, textColor=_STATUS_INK)),
            Paragraph(_txt(qt.disclaimer), small),
        ]
        terms = Table([[conditions, legal]], colWidths=[_USABLE_W * 0.46, _USABLE_W * 0.54])
        terms.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (0, 0), 6), ("RIGHTPADDING", (0, 0), (0, 0), 12),
            ("BACKGROUND", (1, 0), (1, 0), _STATUS_BG),
            ("LEFTPADDING", (1, 0), (1, 0), 9), ("RIGHTPADDING", (1, 0), (1, 0), 9),
            ("TOPPADDING", (1, 0), (1, 0), 7), ("BOTTOMPADDING", (1, 0), (1, 0), 9),
        ]))
        story.append(Spacer(1, 4 * mm))
        story.append(KeepTogether([terms]))

        # ── Acknowledgement: the client signs that they saw the draft ────────
        sig_style = ParagraphStyle("Sig", parent=small, fontSize=8.5)
        signatures = Table(
            [
                [Paragraph("Per SYD Bioedilizia (tecnico incaricato)", sig_style), "",
                 Paragraph(_txt(f"{qt.signature_label} — {client['name']}"), sig_style)],
                ["", "", ""],
                [Paragraph("Data e firma", sig_style), "", Paragraph("Data e firma", sig_style)],
            ],
            # The middle column keeps the two signature lines apart.
            colWidths=[_USABLE_W * 0.46, _USABLE_W * 0.08, _USABLE_W * 0.46],
            rowHeights=[None, 9 * mm, None],
        )
        signatures.setStyle(TableStyle([
            ("LINEABOVE", (0, 2), (0, 2), 0.6, _LINE_STRONG),
            ("LINEABOVE", (2, 2), (2, 2), 0.6, _LINE_STRONG),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(Spacer(1, 4 * mm))
        story.append(KeepTogether([signatures]))

        footer = f"{firm.legal_line} · {firm.email} · {firm.phone}"
        doc.build(story, canvasmaker=lambda *a, **k: _NumberedCanvas(*a, footer_left=footer, **k))
        buffer.seek(0)
        return buffer.getvalue()

    def upload_pdf(
        self,
        pdf_bytes: bytes,
        project_id: str,
        quote_number: str | None = None,
        version: int | None = None,
    ) -> tuple[str, str]:
        """
        Upload PDF to Firebase Storage and return (signed URL valid 7 days,
        storage blob path).

        With a `quote_number` the object is `{number}_r{version}.pdf` (no
        personal data in the name); without one the legacy timestamp name is used.

        The blob path is persisted on the quote document (pdf_blob_path) so the
        client area can mint fresh short-lived signed URLs on demand
        (GET /quote/{id}/pdf) without re-uploading.

        This is a SYNC method (Firebase Admin SDK is synchronous).
        Call via asyncio.to_thread() from async context.
        """
        bucket = storage.bucket()
        blob_path = quote_pdf_blob_path(project_id, quote_number, version)
        blob = bucket.blob(blob_path)
        blob.upload_from_string(pdf_bytes, content_type="application/pdf")
        url: str = blob.generate_signed_url(
            expiration=_SIGNED_URL_EXPIRY, method="GET",
        )
        logger.info("PDF uploaded.", extra={"quote_number": quote_number or "-", "blob": blob_path})
        return url, blob_path

    def generate_and_deliver(self, quote_data: dict) -> str:
        """
        Orchestrate PDF generation + upload (synchronous — call via asyncio.to_thread).

        Returns:
            Signed PDF URL.
        """
        pdf_bytes = self.generate_pdf_bytes(quote_data)
        project_id: str = quote_data.get("project_id", "unknown")
        url, _ = self.upload_pdf(pdf_bytes, project_id, quote_data.get("quote_number"), quote_data.get("version"))
        return url

    async def async_generate_and_deliver(self, quote_data: dict) -> str:
        """
        Async wrapper for generate_and_deliver.
        Runs PDF generation + Firebase upload in a thread pool to avoid blocking the event loop.
        """
        return await asyncio.to_thread(self.generate_and_deliver, quote_data)
