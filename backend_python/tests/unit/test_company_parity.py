"""The backend company identity must match web_client/lib/company.ts."""
import re
from pathlib import Path

from src.core.company import COMPANY

COMPANY_TS = Path(__file__).resolve().parents[3] / "web_client" / "lib" / "company.ts"


def _ts_value(source: str, key: str) -> str:
    match = re.search(rf"\b{key}:\s*'([^']*)'", source)
    assert match, f"{key} not found in company.ts"
    return match.group(1)


def test_identity_matches_the_site():
    ts = COMPANY_TS.read_text(encoding="utf-8")
    assert COMPANY.name == _ts_value(ts, "name")
    assert COMPANY.legal_name == _ts_value(ts, "legalName")
    assert COMPANY.vat_id == _ts_value(ts, "vatId")
    assert COMPANY.address.street == _ts_value(ts, "street")
    assert COMPANY.address.postal_code == _ts_value(ts, "postalCode")
    assert COMPANY.address.city == _ts_value(ts, "city")
    assert COMPANY.address.region == _ts_value(ts, "region")
    assert COMPANY.address.country == _ts_value(ts, "country")
    assert COMPANY.phone == _ts_value(ts, "phone")
    assert COMPANY.email == _ts_value(ts, "email")
    assert COMPANY.url == _ts_value(ts, "url")


def test_derived_lines_match_the_site_helpers():
    assert COMPANY.legal_line == "SYD Bioedilizia S.r.l. - P.IVA 15714991005"
    assert COMPANY.full_address == "Via Quero, 132 - 00123 Roma (RM)"
