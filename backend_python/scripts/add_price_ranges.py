"""
Add customer-facing price ranges (range_min / range_max) to the master
price book SKUs, derived from unit_price with category-aware bands.

These are SENSIBLE STARTING DEFAULTS for the admin to refine — the band
width reflects how much each category varies in the real world (a window
swing far more than a m² of demolition). Re-run is idempotent.

Usage:
    cd backend_python && uv run python scripts/add_price_ranges.py
"""
import json
import math
from pathlib import Path

PRICE_BOOK = Path(__file__).parent.parent / "src" / "data" / "master_price_book.json"

# (min_multiplier, max_multiplier) per category — wider where real-world
# price depends heavily on size/brand/finish.
HIGH_VARIANCE = {"Infissi", "Cucina", "Bagno", "Climatizzazione",
                 "Riscaldamento", "Sicurezza Cantiere"}
LOW_VARIANCE = {"Demolizioni", "Tinteggiature", "Pavimentazioni", "Smaltimento"}

BAND_HIGH = (0.75, 1.50)
BAND_LOW = (0.90, 1.20)
BAND_MED = (0.85, 1.30)


def band_for(category: str) -> tuple[float, float]:
    if category in HIGH_VARIANCE:
        return BAND_HIGH
    if category in LOW_VARIANCE:
        return BAND_LOW
    return BAND_MED


def round_price(v: float) -> float:
    """Round to a clean figure: nearest 5 under 100, nearest 10 above."""
    step = 5 if v < 100 else 10
    return float(int(round(v / step) * step))


def main() -> None:
    data = json.loads(PRICE_BOOK.read_text(encoding="utf-8"))
    changed = 0
    for item in data["items"]:
        price = item.get("unit_price")
        if not isinstance(price, (int, float)) or price <= 0:
            continue
        lo_mult, hi_mult = band_for(item.get("category", ""))
        rmin = round_price(price * lo_mult)
        rmax = round_price(price * hi_mult)
        # Guard: keep the real unit_price inside the band and min < max.
        rmin = min(rmin, round_price(price))
        rmax = max(rmax, round_price(price))
        if item.get("range_min") != rmin or item.get("range_max") != rmax:
            changed += 1
        item["range_min"] = rmin
        item["range_max"] = rmax

    PRICE_BOOK.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Updated {changed} of {len(data['items'])} items with range_min/range_max.")


if __name__ == "__main__":
    main()
