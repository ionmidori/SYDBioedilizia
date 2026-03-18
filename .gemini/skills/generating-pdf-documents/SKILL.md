---
name: generating-pdf-documents
description: Generates branded A4 PDF quotes using ReportLab Platypus in async FastAPI. Covers threadpool offloading, Firebase Storage signed URLs, and multi-room layout. Use when implementing PDF generation, quote export, or document delivery features.
---

# PDF Generation: ReportLab Platypus

## Quick Reference

Implementation: [pdf_service.py](backend_python/src/services/pdf_service.py)

```
PdfService
├── generate_pdf_bytes(quote_data) → bytes     [SYNC, CPU-bound]
├── upload_pdf(pdf_bytes, project_id) → str    [SYNC, Firebase SDK]
├── generate_and_deliver(quote_data) → str     [SYNC orchestrator]
└── async_generate_and_deliver(quote_data)     [ASYNC via asyncio.to_thread]
```

## Critical Rules

1. **Never call ReportLab in async context directly.** Always use `asyncio.to_thread()`:
   ```python
   await asyncio.to_thread(self.generate_and_deliver, quote_data)
   ```

2. **Signed URL expiry: 1 hour** (security audit FU-04). Do not increase.

3. **Firebase upload is sync.** `upload_from_string()` must also go through `asyncio.to_thread()`.

## SYD Brand Constants

```python
_GOLD = colors.HexColor("#C9A84C")       # Accent / HR lines
_DARK = colors.HexColor("#2C3E50")       # Headers + body text
_LIGHT_GRAY = colors.HexColor("#F8F9FA") # Alternating table rows
```

## Multi-Room Layout

When `quote_data["rooms"]` is non-empty, the PDF renders:
1. Per-room headings with type, floor_mq, walls_mq, item count, subtotal
2. Aggregation adjustments section (`quote_data["aggregation_adjustments"]`) with per-line savings
3. Pre/post optimization totals in financials

## Dependencies

```toml
"reportlab>=4.0"   # Pure Python — no system deps (unlike WeasyPrint)
```
