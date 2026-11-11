"""Quote emails and PDFs read the company identity and terms from the company info (Phase 141)."""
from datetime import UTC, datetime

import pytest
from src.core.company import SITE_URL, company, quote_terms
from src.services import company_info
from src.services.company_info_service import CompanyInfoService

NOW = datetime(2026, 11, 11, 10, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _fresh_cache():
    CompanyInfoService.reset_cache()
    yield
    CompanyInfoService.reset_cache()


def test_without_firestore_the_seed_identity_is_used():
    current = company()
    assert current.legal_name == "SYD Bioedilizia S.r.l."
    assert current.legal_line == "SYD Bioedilizia S.r.l. - P.IVA 15714991005"
    assert current.full_address == "Via Quero, 132 - 00123 Roma (RM)"
    assert current.url == SITE_URL == "https://sydbioedilizia.vercel.app"


def test_company_reads_the_snapshot():
    info = company_info.seed_info()
    info.identity.phone = "06 999 000"
    CompanyInfoService.apply(info, 1, NOW)
    assert company().phone == "06 999 000"
    assert company().url == SITE_URL


def test_quote_terms_read_the_snapshot():
    assert quote_terms().payment_terms == (
        "30% alla firma dell'accettazione",
        "40% a metà lavori (stato di avanzamento)",
        "30% a fine lavori",
    )
    info = company_info.seed_info()
    info.quote_terms.validity_days = 45
    info.quote_terms.payment_terms = ["50% alla firma", "50% a fine lavori"]
    CompanyInfoService.apply(info, 1, NOW)
    assert quote_terms().validity_days == 45
    assert quote_terms().payment_terms == ("50% alla firma", "50% a fine lavori")
