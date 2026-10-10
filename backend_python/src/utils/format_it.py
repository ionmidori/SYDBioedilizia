"""Italian formatting shared by quote PDFs and emails (1.234,56 · 11/10/2026)."""
import datetime
from typing import Any


def format_number(value: float, decimals: int = 2) -> str:
    """Italian number format: 1234.5 → "1.234,50"."""
    text = f"{float(value):,.{decimals}f}"
    return text.replace(",", "§").replace(".", ",").replace("§", ".")


def format_eur(value: float) -> str:
    return f"€ {format_number(value)}"


def format_qty(value: Any) -> str:
    """40.0 → "40", 40.7 → "40,7", 0.25 → "0,25" (no trailing zeros)."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value or "")
    text = format_number(number, 2).rstrip("0").rstrip(",")
    return text or "0"


def format_date(value: datetime.datetime | datetime.date) -> str:
    return value.strftime("%d/%m/%Y")
