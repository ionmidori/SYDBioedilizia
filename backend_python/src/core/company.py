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


def _format_address(address: CompanyAddress) -> str:
    return f"{address.street} - {address.postal_code} {address.city} ({address.region})"


@dataclass(frozen=True)
class Company:
    name: str
    legal_name: str
    vat_id: str
    address: CompanyAddress
    phone: str
    email: str
    url: str
    legal_address: CompanyAddress | None = None

    @property
    def legal_line(self) -> str:
        """"SYD Bioedilizia S.r.l. - P.IVA 15714991005"."""
        return f"{self.legal_name} - P.IVA {self.vat_id}"

    @property
    def full_address(self) -> str:
        """"Via Quero, 132 - 00123 Roma (RM)"."""
        return _format_address(self.address)

    @property
    def full_legal_address(self) -> str | None:
        """"Via Venticinque Aprile, 119/A - 00034 Colleferro (RM)" if set."""
        return _format_address(self.legal_address) if self.legal_address else None

    @property
    def addresses_line(self) -> str:
        """Human-readable summary carrying both legal (registered) and operational addresses."""
        if self.full_legal_address:
            return f"Sede legale: {self.full_legal_address} · Sede operativa: {self.full_address}"
        return f"Sede operativa: {self.full_address}"


@dataclass(frozen=True)
class QuoteTerms:
    validity_days: int
    payment_terms: tuple[str, ...]
    short_notice: str
    disclaimer_title: str
    disclaimer: str
    signature_label: str


def _to_company_address(address) -> CompanyAddress:
    return CompanyAddress(
        street=address.street,
        postal_code=address.postal_code,
        city=address.city,
        region=address.region,
        country=address.country,
    )


def company() -> Company:
    """The company identity being served now (the seed until Firestore is read)."""
    identity = CompanyInfoService.snapshot().identity
    return Company(
        name=identity.name,
        legal_name=identity.legal_name,
        vat_id=identity.vat_id,
        address=_to_company_address(identity.address),
        legal_address=_to_company_address(identity.legal_address) if identity.legal_address else None,
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
