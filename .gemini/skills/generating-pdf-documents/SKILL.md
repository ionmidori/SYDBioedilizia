---
name: generating-pdf-documents
description: Generates professional PDF documents from Jinja2 HTML templates using WeasyPrint in FastAPI async context. Covers run_in_threadpool offloading (CPU-bound), Jinja2 template design, Firebase Storage upload, and signed URL generation. Use when implementing PDF generation for quotes, invoices, reports, or any document export feature.
---

# PDF Generation: Jinja2 + WeasyPrint in FastAPI

## ⚠️ Critical Rule: WeasyPrint is Synchronous (CPU-bound)

NEVER call `HTML(...).write_pdf()` directly in an async route. Use `run_in_threadpool`.

```python
from fastapi.concurrency import run_in_threadpool
from weasyprint import HTML
from jinja2 import Environment, FileSystemLoader
from pathlib import Path

TEMPLATES_DIR = Path(__file__).parent.parent / "templates"

async def generate_quote_pdf(quote: QuoteSchema) -> bytes:
    """Renders Jinja2 template → WeasyPrint PDF (offloaded to threadpool)."""
    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))
    template = env.get_template("quote.html.jinja2")
    html_str = template.render(quote=quote.model_dump())

    def _render() -> bytes:
        return HTML(string=html_str, base_url=str(TEMPLATES_DIR)).write_pdf()

    return await run_in_threadpool(_render)
```

## Template Structure

```
backend_python/
  src/
    templates/
      quote.html.jinja2    ← Main template
      _partials/
        items_table.html   ← Included via Jinja2 include
      static/
        quote.css          ← Embedded CSS for PDF
```

### Minimal `quote.html.jinja2`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 2cm; }
    body { font-family: 'Arial', sans-serif; font-size: 11pt; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px; border: 1px solid #ddd; }
    .total { font-weight: bold; font-size: 13pt; }
  </style>
</head>
<body>
  <h1>Preventivo #{{ quote.id }}</h1>
  <p>Progetto: {{ quote.project_id }} | Data: {{ quote.created_at | datetimeformat }}</p>
  <table>
    <thead><tr><th>SKU</th><th>Descrizione</th><th>Qtà</th><th>€/Unit</th><th>Totale</th></tr></thead>
    <tbody>
    {% for item in quote.items %}
      <tr>
        <td>{{ item.sku }}</td>
        <td>{{ item.description }}</td>
        <td>{{ item.qty }} {{ item.unit }}</td>
        <td>{{ "%.2f"|format(item.unit_price) }}</td>
        <td>{{ "%.2f"|format(item.total) }}</td>
      </tr>
    {% endfor %}
    </tbody>
  </table>
  <p class="total">Subtotale: € {{ "%.2f"|format(quote.financials.subtotal) }}</p>
  <p class="total">IVA ({{ (quote.financials.vat_rate * 100)|int }}%): € {{ "%.2f"|format(quote.financials.vat_amount) }}</p>
  <p class="total">Totale: € {{ "%.2f"|format(quote.financials.grand_total) }}</p>
</body>
</html>
```

## Upload su Firebase Storage

```python
import tempfile
from firebase_admin import storage

async def save_pdf_to_storage(pdf_bytes: bytes, quote_id: str) -> str:
    """Salva PDF su Firebase Storage, ritorna URL firmato (7 giorni)."""
    bucket = storage.bucket()
    blob = bucket.blob(f"quotes/{quote_id}/preventivo.pdf")

    def _upload():
        blob.upload_from_string(pdf_bytes, content_type="application/pdf")
        return blob.generate_signed_url(expiration=604800)  # 7 giorni

    return await run_in_threadpool(_upload)
```

## FastAPI Route Pattern

```python
@router.post("/quote/{quote_id}/pdf", response_model=PdfGeneratedResponse)
async def generate_pdf_endpoint(quote_id: str, background_tasks: BackgroundTasks):
    quote = await get_quote_from_firestore(quote_id)
    pdf_bytes = await generate_quote_pdf(quote)
    pdf_url = await save_pdf_to_storage(pdf_bytes, quote_id)
    return PdfGeneratedResponse(pdf_url=pdf_url, quote_id=quote_id)
```

> Usa `BackgroundTasks` solo per operazioni fire-and-forget DOPO la response (e.g. notifica n8n). La generazione PDF deve completarsi prima di rispondere.

## Dependencies

```toml
# pyproject.toml
"weasyprint>=60.0",
"jinja2>=3.1.0",
"cairocffi>=1.6.0",   # WeasyPrint dependency su Windows
```

## Windows Setup

WeasyPrint richiede GTK su Windows. Installare [GTK for Windows Runtime](https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer).
In alternativa, eseguire la generazione PDF solo in Docker/Linux in produzione.
