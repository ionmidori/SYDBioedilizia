"""Guards: amounts are rounded only by src/core/money.py, and no Decimal reaches Firestore."""
import ast
from decimal import Decimal
from pathlib import Path

import pytest
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

BACKEND_ROOT = Path(__file__).resolve().parents[2]

# Files whose `round(x, 2)` is not an amount: durations in milliseconds for logs and metrics.
_NOT_MONEY = {
    BACKEND_ROOT / "src" / "middleware" / "metrics.py",
    BACKEND_ROOT / "src" / "core" / "telemetry.py",
}


def _round_to_cents_calls(path: Path) -> list[int]:
    lines = []
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"), filename=str(path))):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "round"):
            continue
        ndigits = node.args[1] if len(node.args) > 1 else next(
            (kw.value for kw in node.keywords if kw.arg == "ndigits"), None
        )
        if isinstance(ndigits, ast.Constant) and ndigits.value == 2:
            lines.append(node.lineno)
    return lines


def test_no_round_to_cents_outside_the_money_module():
    offenders = []
    for path in [*(BACKEND_ROOT / "src").rglob("*.py"), BACKEND_ROOT / "main.py"]:
        if path in _NOT_MONEY or path == BACKEND_ROOT / "src" / "core" / "money.py":
            continue
        offenders += [f"{path.relative_to(BACKEND_ROOT)}:{line}" for line in _round_to_cents_calls(path)]
    assert not offenders, (
        "Amounts are rounded by src/core/money.py (Decimal, ROUND_HALF_UP), never by round(…, 2), "
        "which rounds half-even on the binary value (0.5 x 22.25 -> 11.12):\n" + "\n".join(offenders)
    )


def test_the_not_money_allowlist_is_still_needed():
    stale = [str(p.relative_to(BACKEND_ROOT)) for p in _NOT_MONEY if not p.exists() or not _round_to_cents_calls(p)]
    assert not stale, f"remove from _NOT_MONEY: {stale}"


@pytest.mark.parametrize(
    "write",
    [
        lambda db: db.put("quotes", "q1", {"total": Decimal("1.00")}),
        lambda db: db.apply_set(("quotes", "q1"), {"financials": {"grand_total": Decimal("1.00")}}, merge=False),
        lambda db: db.apply_set(("quotes", "q1"), {"items": [{"total": Decimal("1.00")}]}, merge=True),
        lambda db: db.apply_update(("quotes", "q0"), {"financials.subtotal": Decimal("1.00")}),
        lambda db: FakeTransaction(db).set(db.collection("quotes").document("q1"), {"total": Decimal("1")}),
        lambda db: FakeTransaction(db).update(db.collection("quotes").document("q0"), {"total": Decimal("1")}),
        lambda db: db.batch().set(db.collection("quotes").document("q1"), {"total": Decimal("1")}),
    ],
)
def test_fake_firestore_rejects_decimal_values_like_the_real_client(write):
    db = FakeDb()
    db.put("quotes", "q0", {"total": 1.0})
    with pytest.raises(AssertionError, match="Decimal"):
        write(db)
