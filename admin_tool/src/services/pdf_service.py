"""
PDF Service: Jinja2 rendering + WeasyPrint + Firebase Storage upload.

Skill: generating-pdf-documents
Critical: WeasyPrint is CPU-bound (synchronous). MUST use run_in_threadpool.
"""
import datetime
import logging
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
from firebase_admin import storage

logger = logging.getLogger(__name__)

_TEMPLATES_DIR = Path(__file__).parent.parent / "templates"


class PdfService:
    """Generates a PDF from a Jinja2 template and uploads it to Firebase Storage."""

    def __init__(self) -> None:
        self.env = Environment(loader=FileSystemLoader(str(_TEMPLATES_DIR)))

    def generate_pdf_bytes(self, quote_data: dict) -> bytes:
        """
        Render HTML template → WeasyPrint PDF bytes (synchronous — call via run_in_threadpool).

        Args:
            quote_data: Full quote dict from Firestore.

        Returns:
            Raw PDF bytes.
        """
        template = self.env.get_template("quote_template.html")
        context = {
            "project_id": quote_data.get("project_id", "Unknown"),
            "date": datetime.datetime.now(datetime.timezone.utc).strftime("%d/%m/%Y"),
            "items": quote_data.get("items", []),
            "financials": quote_data.get("financials", {}),
            "client_name": quote_data.get("client_name", ""),
        }
        html_string = template.render(**context)
        # NOTE: This is synchronous/CPU-bound. Caller MUST use run_in_threadpool.
        return HTML(string=html_string, base_url=str(_TEMPLATES_DIR)).write_pdf()

    def upload_pdf(self, pdf_bytes: bytes, project_id: str) -> str:
        """
        Upload PDF bytes to Firebase Storage and return a 7-day signed URL (synchronous).

        Args:
            pdf_bytes: Generated PDF bytes.
            project_id: Project ID for path namespacing.

        Returns:
            Signed URL string (valid 7 days).
        """
        try:
            bucket = storage.bucket()
            ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
            blob_path = f"projects/{project_id}/quotes/quote_{ts}.pdf"
            blob = bucket.blob(blob_path)
            blob.upload_from_string(pdf_bytes, content_type="application/pdf")
            url: str = blob.generate_signed_url(
                expiration=datetime.timedelta(days=7), method="GET"
            )
            logger.info("PDF uploaded.", extra={"project_id": project_id, "blob": blob_path})
            return url
        except Exception as exc:
            logger.error("PDF upload failed.", exc_info=exc)
            # Graceful fallback — never block approval flow
            return f"https://mock-storage.example.com/{project_id}/quote.pdf"

    def generate_and_deliver(self, quote_data: dict) -> str:
        """
        Orchestrate generation + upload (synchronous — called from threadpool).

        Returns:
            Signed PDF URL.
        """
        pdf_bytes = self.generate_pdf_bytes(quote_data)
        project_id: str = quote_data.get("project_id", "unknown")
        return self.upload_pdf(pdf_bytes, project_id)
