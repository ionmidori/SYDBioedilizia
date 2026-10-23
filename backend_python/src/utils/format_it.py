"""Italian formatting shared by quote PDFs and emails (1.234,56 · 11/10/2026)."""
import datetime
import math
from typing import Any

from src.core.money import Amount, round_half_up


def format_number(value: Amount, decimals: int = 2) -> str:
    """Italian number format: 1234.5 → "1.234,50".

    Rounded half-up like every amount (src/core/money.py), never with float
    formatting, which rounds the binary value half-even (11.125 → "11,12").
    """
    text = f"{round_half_up(value, decimals):,.{decimals}f}"
    return text.replace(",", "§").replace(".", ",").replace("§", ".")


def format_eur(value: Amount) -> str:
    return f"€ {format_number(value)}"


def format_qty(value: Any) -> str:
    """40.0 → "40", 40.7 → "40,7", 0.25 → "0,25" (no trailing zeros)."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value or "")
    if not math.isfinite(number):
        return str(value)
    text = format_number(number, 2).rstrip("0").rstrip(",")
    return text or "0"


def format_date(value: datetime.datetime | datetime.date) -> str:
    return value.strftime("%d/%m/%Y")
