"""
Company identity and quote terms printed on quote PDFs and emails.

Identity mirrors `web_client/lib/company.ts` (single source of truth for the
site); `tests/unit/test_company_parity.py` fails if the two drift apart.
The commercial terms below are the ones the owner chose for the AUTOMATIC
DRAFT quotes (Phase 128): change them here only.
"""
from __future__ import annotations

from dataclasses import dataclass


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


COMPANY = Company(
    name="SYD Bioedilizia",
    legal_name="SYD Bioedilizia S.r.l.",
    vat_id="15714991005",
    address=CompanyAddress(
        street="Via Quero, 132",
        postal_code="00123",
        city="Roma",
        region="RM",
        country="IT",
    ),
    phone="+39 375 5463599",
    email="sydbioedilizia@gmail.com",
    url="https://sydbioedilizia.vercel.app",
)


@dataclass(frozen=True)
class QuoteTerms:
    validity_days: int
    payment_terms: tuple[str, ...]
    short_notice: str
    disclaimer_title: str
    disclaimer: str
    signature_label: str


QUOTE_TERMS = QuoteTerms(
    validity_days=30,
    payment_terms=(
        "30% alla firma dell'accettazione",
        "40% a metà lavori (stato di avanzamento)",
        "30% a fine lavori",
    ),
    short_notice=(
        "Bozza generata automaticamente: non è un preventivo definitivo finché non la "
        "conferma un nostro tecnico (vedi «Natura del documento»)."
    ),
    disclaimer_title="Natura del documento",
    disclaimer=(
        "Il presente documento è una BOZZA DI PREVENTIVO generata automaticamente "
        "sulla base delle informazioni fornite dal cliente. Non costituisce un preventivo "
        "definitivo né un'offerta vincolante. Diventa preventivo solo dopo la verifica e "
        "l'approvazione di un nostro tecnico, sulla base di un sopralluogo o di un contatto "
        "telefonico con il cliente. Quantità, lavorazioni e importi sono indicativi e possono "
        "variare in base a quanto verificato in cantiere."
    ),
    signature_label="Per presa visione della bozza",
)
