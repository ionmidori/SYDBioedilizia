"""
PdfService: Generate branded A4 PDF quotes and upload to Firebase Storage.

Uses ReportLab Platypus (pure Python, zero system deps).
Ported from admin_tool/src/services/pdf_service.py with async wrapper
for use in FastAPI async routes (sync Firebase SDK → asyncio.to_thread).

Pattern: generating-pdf-documents skill (run_in_threadpool for CPU-bound work).
"""
import asyncio
import datetime
import logging
from io import BytesIO

from firebase_admin import storage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger(__name__)

# ─── Layout constants ──────────────────────────────────────────────────────────
_PAGE_W, _PAGE_H = A4
_MARGIN = 20 * mm
_GOLD = colors.HexColor("#C9A84C")
_DARK = colors.HexColor("#2C3E50")
_LIGHT_GRAY = colors.HexColor("#F8F9FA")

# Signed URL expiration: 1 hour per P2 security audit (FU-04)
_SIGNED_URL_EXPIRY = datetime.timedelta(hours=1)


class PdfService:
    """Generates a branded A4 PDF quote and uploads to Firebase Storage."""

    def generate_pdf_bytes(self, quote_data: dict) -> bytes:
        """
        Generate PDF bytes using ReportLab Platypus.
        Handles unlimited items via automatic page breaks.

        Args:
            quote_data: Full quote dict from Firestore (items, financials, project_id, etc.)

        Returns:
            Raw PDF bytes.
        """
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=_MARGIN,
            rightMargin=_MARGIN,
            topMargin=_MARGIN,
            bottomMargin=_MARGIN,
        )

        styles = getSampleStyleSheet()
        story: list = []

        # ── Header ───────────────────────────────────────────────────
        title_style = ParagraphStyle(
            "QuoteTitle",
            parent=styles["Heading1"],
            fontSize=22,
            textColor=_DARK,
            spaceAfter=2 * mm,
        )
        subtitle_style = ParagraphStyle(
            "QuoteSubtitle",
            parent=styles["Normal"],
            fontSize=11,
            textColor=_GOLD,
            spaceAfter=6 * mm,
        )
        story.append(Paragraph("SYD Bioedilizia", title_style))
        story.append(Paragraph("Architetto Personale AI", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=2, color=_GOLD))
        story.append(Spacer(1, 6 * mm))

        # ── Project info ─────────────────────────────────────────────
        info_data = [
            ["Progetto:", quote_data.get("project_id", "N/D")],
            ["Cliente:", quote_data.get("client_name", quote_data.get("user_id", "N/D"))],
            ["Data:", datetime.datetime.now(datetime.timezone.utc).strftime("%d/%m/%Y")],
        ]
        if quote_data.get("quote_number"):
            info_data.append(["N° Preventivo:", quote_data["quote_number"]])
        if quote_data.get("admin_notes"):
            info_data.append(["Note:", quote_data["admin_notes"]])

        info_table = Table(info_data, colWidths=[40 * mm, 120 * mm])
        info_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.grey),
            ("TEXTCOLOR", (1, 0), (1, -1), _DARK),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 8 * mm))

        # ── Multi-room: per-room breakdown (if present) ────────────────
        usable_width = _PAGE_W - 2 * _MARGIN
        rooms = quote_data.get("rooms", [])
        if rooms:
            room_heading = ParagraphStyle(
                "RoomHeading", parent=styles["Heading2"],
                fontSize=13, textColor=_DARK, spaceAfter=3 * mm, spaceBefore=4 * mm,
            )
            room_detail = ParagraphStyle(
                "RoomDetail", parent=styles["Normal"],
                fontSize=9, textColor=colors.grey, spaceAfter=2 * mm,
            )
            for room in rooms:
                label = room.get("room_label", "Stanza")
                rtype = room.get("room_type", "")
                story.append(Paragraph(f"{label} ({rtype})", room_heading))
                details = []
                if room.get("floor_mq"):
                    details.append(f"Pavimento: ~{room['floor_mq']:.1f} mq")
                if room.get("walls_mq"):
                    details.append(f"Pareti: ~{room['walls_mq']:.1f} mq")
                details.append(f"Voci: {len(room.get('items', []))}")
                details.append(f"Subtotale: €{float(room.get('room_subtotal', 0)):.2f}")
                story.append(Paragraph(" · ".join(details), room_detail))

            story.append(Spacer(1, 4 * mm))
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
            story.append(Spacer(1, 4 * mm))

        # ── Items table ───────────────────────────────────────────────
        col_widths = [
            usable_width * 0.45,
            usable_width * 0.10,
            usable_width * 0.15,
            usable_width * 0.15,
            usable_width * 0.15,
        ]

        header_style = ParagraphStyle(
            "TH", parent=styles["Normal"], fontSize=9,
            textColor=colors.white, fontName="Helvetica-Bold",
        )
        cell_style = ParagraphStyle(
            "TD", parent=styles["Normal"], fontSize=9, textColor=_DARK,
        )

        table_data = [[
            Paragraph("Descrizione", header_style),
            Paragraph("U.M.", header_style),
            Paragraph("Qtà", header_style),
            Paragraph("Prezzo Unit.", header_style),
            Paragraph("Totale", header_style),
        ]]

        items = quote_data.get("items", [])
        for item in items:
            table_data.append([
                Paragraph(str(item.get("description", "")), cell_style),
                Paragraph(str(item.get("unit", "")), cell_style),
                Paragraph(str(item.get("qty", "")), cell_style),
                Paragraph(f"€{float(item.get('unit_price', 0)):.2f}", cell_style),
                Paragraph(f"€{float(item.get('total', 0)):.2f}", cell_style),
            ])

        items_table = Table(table_data, colWidths=col_widths, repeatRows=1)
        items_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), _DARK),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _LIGHT_GRAY]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#DEE2E6")),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ]))
        story.append(items_table)
        story.append(Spacer(1, 8 * mm))

        # ── Aggregation adjustments (multi-room savings) ──────────────
        adjustments = quote_data.get("aggregation_adjustments", [])
        if adjustments:
            savings_heading = ParagraphStyle(
                "SavingsHeading", parent=styles["Heading3"],
                fontSize=11, textColor=_GOLD, spaceBefore=4 * mm, spaceAfter=2 * mm,
            )
            savings_detail = ParagraphStyle(
                "SavingsDetail", parent=styles["Normal"],
                fontSize=9, textColor=_DARK,
            )
            story.append(Paragraph("Ottimizzazioni Multi-Stanza", savings_heading))
            total_savings = 0.0
            for adj in adjustments:
                sav = float(adj.get("savings", 0))
                if sav > 0:
                    story.append(Paragraph(
                        f"• {adj.get('description', '')} — risparmi €{sav:.2f}",
                        savings_detail,
                    ))
                    total_savings += sav
            story.append(Spacer(1, 2 * mm))
            story.append(Paragraph(
                f"<b>Risparmio totale aggregazione: €{total_savings:.2f}</b>",
                savings_detail,
            ))
            story.append(Spacer(1, 6 * mm))

        # ── Financials ────────────────────────────────────────────────
        financials = quote_data.get("financials", {})
        subtotal = float(financials.get("subtotal", 0))
        vat_rate = float(financials.get("vat_rate", 0.22))
        vat_amount = float(financials.get("vat_amount", 0))
        grand_total = float(financials.get("grand_total", 0))

        fin_data = [
            ["", "Subtotale:", f"€{subtotal:.2f}"],
            ["", f"IVA ({vat_rate * 100:.0f}%):", f"€{vat_amount:.2f}"],
            ["", "TOTALE:", f"€{grand_total:.2f}"],
        ]
        fin_table = Table(
            fin_data,
            colWidths=[usable_width * 0.55, usable_width * 0.25, usable_width * 0.20],
        )
        fin_table.setStyle(TableStyle([
            ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
            ("FONTNAME", (1, 2), (2, 2), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("TEXTCOLOR", (1, 0), (1, 1), colors.grey),
            ("TEXTCOLOR", (1, 2), (2, 2), _DARK),
            ("BACKGROUND", (0, 2), (-1, 2), _LIGHT_GRAY),
            ("LINEABOVE", (0, 2), (-1, 2), 1, _GOLD),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(fin_table)

        # ── Footer ────────────────────────────────────────────────────
        story.append(Spacer(1, 10 * mm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
        footer_style = ParagraphStyle(
            "QuoteFooter", parent=styles["Normal"], fontSize=8, textColor=colors.grey,
        )
        story.append(Paragraph(
            "SYD Bioedilizia — Powered by AI · Documento generato automaticamente",
            footer_style,
        ))

        doc.build(story)
        buffer.seek(0)
        return buffer.getvalue()

    def upload_pdf(self, pdf_bytes: bytes, project_id: str) -> str:
        """
        Upload PDF to Firebase Storage and return a signed URL (1 hour).

        This is a SYNC method (Firebase Admin SDK is synchronous).
        Call via asyncio.to_thread() from async context.

        Args:
            pdf_bytes: Generated PDF content.
            project_id: Project ID for path namespacing.

        Returns:
            Signed URL string valid for 1 hour.
        """
        bucket = storage.bucket()
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        blob_path = f"projects/{project_id}/quotes/quote_{ts}.pdf"
        blob = bucket.blob(blob_path)
        blob.upload_from_string(pdf_bytes, content_type="application/pdf")
        url: str = blob.generate_signed_url(
            expiration=_SIGNED_URL_EXPIRY, method="GET",
        )
        logger.info("PDF uploaded.", extra={"project_id": project_id, "blob": blob_path})
        return url

    def generate_and_deliver(self, quote_data: dict) -> str:
        """
        Orchestrate PDF generation + upload (synchronous — call via asyncio.to_thread).

        Returns:
            Signed PDF URL.
        """
        pdf_bytes = self.generate_pdf_bytes(quote_data)
        project_id: str = quote_data.get("project_id", "unknown")
        return self.upload_pdf(pdf_bytes, project_id)

    async def async_generate_and_deliver(self, quote_data: dict) -> str:
        """
        Async wrapper for generate_and_deliver.
        Runs PDF generation + Firebase upload in a thread pool to avoid blocking the event loop.
        """
        return await asyncio.to_thread(self.generate_and_deliver, quote_data)
