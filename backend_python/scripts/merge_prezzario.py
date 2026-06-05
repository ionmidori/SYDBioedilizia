"""
Merge prezzario_lazio_2023_part1.json + part2.json + part3.json into
data/prezzario_lazio_2023_structured.json.

Deduplication key: 'codice' field (keeps first occurrence).
Prints per-category counts on completion.

Usage:
    uv run python scripts/merge_prezzario.py
"""
import json
import sys
from collections import Counter
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
INPUT_FILES = [
    DATA_DIR / "prezzario_lazio_2023_part1.json",
    DATA_DIR / "prezzario_lazio_2023_part2.json",
    DATA_DIR / "prezzario_lazio_2023_part3.json",
]
OUTPUT_FILE = DATA_DIR / "prezzario_lazio_2023_structured.json"


def main() -> None:
    seen_codes: set[str] = set()
    merged: list[dict] = []
    source_counts: list[int] = []

    for path in INPUT_FILES:
        if not path.exists():
            print(f"  [WARN] {path.name} not found — skipping.")
            source_counts.append(0)
            continue

        with open(path, encoding="utf-8") as f:
            articles: list[dict] = json.load(f)

        added = 0
        for art in articles:
            codice = (art.get("codice") or "").strip()
            if not codice or codice in seen_codes:
                continue
            seen_codes.add(codice)
            merged.append(art)
            added += 1

        source_counts.append(added)
        print(f"  {path.name}: {len(articles)} total, {added} unique added")

    print(f"\nMerge result: {len(merged)} unique articles")

    # Per-category breakdown
    category_counts: Counter[str] = Counter(
        art.get("categoria", "Sconosciuta") for art in merged
    )
    print("\nPer-category breakdown:")
    for cat, count in sorted(category_counts.items(), key=lambda x: -x[1]):
        print(f"  {count:4d}  {cat}")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    print(f"\nSaved → {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
