"""contracts/money/golden_vectors.json: src/core/money.py gives the expected amount for every case.

The same file is checked by the frontend (web_client/lib/__tests__/money.golden.test.ts),
so a quote shows the same cents in the admin preview, in the API and in the PDF.
"""
import importlib.util
import json
from decimal import Decimal
from pathlib import Path

import pytest
from src.core.money import compute_totals, line_total, to_cents, vat_amount

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_VECTORS_PATH = _BACKEND_ROOT.parent / "contracts" / "money" / "golden_vectors.json"
VECTORS = json.loads(_VECTORS_PATH.read_text(encoding="utf-8"))

_SPEC = importlib.util.spec_from_file_location(
    "generate_money_vectors", _BACKEND_ROOT / "scripts" / "generate_money_vectors.py"
)
assert _SPEC and _SPEC.loader
generator = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(generator)


def test_the_vectors_file_is_what_the_generator_produces():
    # Compared as data, not text: a formatter may rewrite the JSON layout.
    assert VECTORS == generator.build_vectors(), (
        "contracts/money/golden_vectors.json is stale or edited by hand: "
        "run `uv run python scripts/generate_money_vectors.py`"
    )


@pytest.mark.parametrize("case", VECTORS["to_cents"], ids=lambda c: repr(c["value"]))
def test_to_cents(case):
    assert str(to_cents(case["value"])) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["line_total"], ids=lambda c: f'{c["qty"]}x{c["unit_price"]}')
def test_line_total(case):
    assert str(line_total(case["qty"], case["unit_price"])) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["vat_amount"], ids=lambda c: f'{c["subtotal"]}@{c["vat_rate"]}')
def test_vat_amount(case):
    assert str(vat_amount(case["subtotal"], case["vat_rate"])) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["compute_totals"], ids=lambda c: f'{len(c["items"])}items@{c["vat_rate"]}')
def test_compute_totals(case):
    lines = [line_total(item["qty"], item["unit_price"]) for item in case["items"]]
    totals = compute_totals(lines, case["vat_rate"])
    expected = case["expected"]
    assert [str(line) for line in lines] == expected["lines"]
    assert str(totals.subtotal) == expected["subtotal"]
    assert str(totals.vat_amount) == expected["vat_amount"]
    assert str(totals.grand_total) == expected["grand_total"]
    assert totals.grand_total == totals.subtotal + totals.vat_amount
    assert isinstance(totals.grand_total, Decimal)
