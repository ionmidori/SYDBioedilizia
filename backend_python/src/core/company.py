"""
Company identity and quote terms printed on quote PDFs and emails.

Both come from the company info edited in the admin console (Phase 141,
`app_config/company_info`, see src/services/company_info_service.py): never
hardcode a contact or a term here. Only the site URL is a constant: it is
where the site is deployed (links, email logo), not a company fact.
"""
from __future__ import annotations

from dataclasses import dataclass

from src.services.company_info_service import CompanyInfoService

SITE_URL = "https://sydbioedilizia.vercel.app"


@dataclass(frozen=True)
class CompanyAddress:
    street: str
    postal_code: str
    city: str
    region: str
    country: str


@dataclass(frozen=True)
class Company:
    name: str
    legal_name: str
    vat_id: str
    address: CompanyAddress
    phone: str
    email: str
    url: str

    @property
    def legal_line(self) -> str:
        """"SYD Bioedilizia S.r.l. - P.IVA 15714991005"."""
        return f"{self.legal_name} - P.IVA {self.vat_id}"

    @property
    def full_address(self) -> str:
        """"Via Quero, 132 - 00123 Roma (RM)"."""
        a = self.address
        return f"{a.street} - {a.postal_code} {a.city} ({a.region})"


@dataclass(frozen=True)
class QuoteTerms:
    validity_days: int
    payment_terms: tuple[str, ...]
    short_notice: str
    disclaimer_title: str
    disclaimer: str
    signature_label: str


def company() -> Company:
    """The company identity being served now (the seed until Firestore is read)."""
    identity = CompanyInfoService.snapshot().identity
    a = identity.address
    return Company(
        name=identity.name,
        legal_name=identity.legal_name,
        vat_id=identity.vat_id,
        address=CompanyAddress(
            street=a.street, postal_code=a.postal_code, city=a.city, region=a.region, country=a.country
        ),
        phone=identity.phone,
        email=identity.email,
        url=SITE_URL,
    )


def quote_terms() -> QuoteTerms:
    """The terms of the AUTOMATIC DRAFT quotes, as the owner set them in the console."""
    terms = CompanyInfoService.snapshot().quote_terms
    return QuoteTerms(
        validity_days=terms.validity_days,
        payment_terms=tuple(terms.payment_terms),
        short_notice=terms.short_notice,
        disclaimer_title=terms.disclaimer_title,
        disclaimer=terms.disclaimer,
        signature_label=terms.signature_label,
    )
