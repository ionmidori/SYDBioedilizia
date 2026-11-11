"""
Company info ("scheda società", Phase 141) — the true facts about SYD Bioedilizia.

One document, edited only from the admin console, read by the site (contacts,
FAQ, Chi siamo, legal pages, JSON-LD), by the AI (contacts, hours, served
area, services, site visit, sections) and by quote emails and PDFs. Nothing
here is hardcoded elsewhere: the bundled seed (src/data/company_info.seed.json)
is only the first content and the fallback when Firestore cannot be read.

Golden Sync: web_client/types/company-info.ts (1:1).
"""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# The sections every company info has (they can be emptied, never removed):
# the AI tool and the site address them by these slugs.
BUILTIN_SECTION_SLUGS: tuple[str, ...] = (
    "garanzie",
    "pagamenti",
    "pratiche-permessi",
    "bonus-fiscali",
    "tempi-lavori",
    "chi-lavora",
    "certificazioni-materiali",
    "social",
)
# A Firestore document holds 1 MiB; the JSON size over-estimates the stored size.
MAX_BYTES = 800 * 1024

SLUG_PATTERN = r"^[a-z0-9]+(-[a-z0-9]+)*$"
TIME_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"
# Same rule as the mailto: links of the quote emails (src/services/email_templates.py).
EMAIL_PATTERN = r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"

IconName = Literal[
    "Coins", "FileText", "Sparkles", "Wrench", "Award", "Shield", "Leaf", "LayoutDashboard",
    "Wand2", "HardHat", "CheckCircle", "Phone", "Clock", "MapPin", "Hammer", "Home",
]

Text = Annotated[str, Field(min_length=1, max_length=2000)]
Line = Annotated[str, Field(min_length=1, max_length=1000)]
Title = Annotated[str, Field(min_length=1, max_length=120)]
Slug = Annotated[str, Field(pattern=SLUG_PATTERN, max_length=60)]


class _Model(BaseModel):
    """Strict (unknown fields are refused) and trimmed: what is saved is what the AI reads."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ── Text blocks (same shape as FaqBlock in web_client/lib/faq-data.ts) ──────


class TextBlock(_Model):
    type: Literal["lead", "p", "note", "callout"]
    text: Text


class ListBlock(_Model):
    type: Literal["ul", "ol"]
    items: list[Line] = Field(..., min_length=1, max_length=30)


class Definition(_Model):
    term: Title
    description: Text


class DefinitionsBlock(_Model):
    type: Literal["definitions"]
    items: list[Definition] = Field(..., min_length=1, max_length=30)


Block = Annotated[TextBlock | ListBlock | DefinitionsBlock, Field(discriminator="type")]
Blocks = Annotated[list[Block], Field(max_length=60)]


# ── Facts ────────────────────────────────────────────────────────────────────


class Address(_Model):
    street: Title
    postal_code: Annotated[str, Field(min_length=1, max_length=10)]
    city: Title
    region: Annotated[str, Field(min_length=1, max_length=10)]
    country: Annotated[str, Field(min_length=2, max_length=2)]


class Identity(_Model):
    name: Title
    legal_name: Title
    vat_id: Annotated[str, Field(pattern=r"^\d{11}$")]
    address: Address
    phone: Annotated[str, Field(min_length=1, max_length=30)]
    whatsapp: Annotated[str, Field(min_length=1, max_length=30)] | None = None
    email: Annotated[str, Field(pattern=EMAIL_PATTERN, max_length=120)]


class OpeningHours(_Model):
    days: Annotated[str, Field(min_length=1, max_length=60)]
    opens: Annotated[str, Field(pattern=TIME_PATTERN)]
    closes: Annotated[str, Field(pattern=TIME_PATTERN)]

    @model_validator(mode="after")
    def _closes_after_opening(self) -> OpeningHours:
        if self.opens >= self.closes:  # "HH:MM" strings compare in time order
            raise ValueError(f"{self.days}: closing time {self.closes} is not after opening time {self.opens}.")
        return self


class Locality(_Model):
    """A district or hamlet customers name instead of its comune (e.g. Ostia → Roma)."""

    name: Title
    comune: Title


class ServiceArea(_Model):
    summary: Title
    places: list[Title] = Field(..., min_length=1, max_length=500)
    localities: list[Locality] = Field(default_factory=list, max_length=500)


class ServiceItem(_Model):
    title: Annotated[str, Field(min_length=1, max_length=80)]
    description: Annotated[str, Field(max_length=300)] = ""


class Services(_Model):
    summary: Annotated[str, Field(min_length=1, max_length=300)]
    items: list[ServiceItem] = Field(..., min_length=1, max_length=100)


class HomeService(_Model):
    id: Slug
    title: Title
    description: Text
    icon: IconName
    action: Literal["dashboard", "chat"]


class QuoteTerms(_Model):
    validity_days: int = Field(..., ge=1, le=365)
    payment_terms: list[Line] = Field(..., min_length=1, max_length=10)
    short_notice: Text
    disclaimer_title: Title
    disclaimer: Text
    signature_label: Title


class Section(_Model):
    slug: Slug
    title: Annotated[str, Field(min_length=1, max_length=80)]
    blocks: Blocks = Field(default_factory=list)
    builtin: bool = False


class FaqCategory(_Model):
    name: Annotated[str, Field(min_length=1, max_length=40)]
    icon: IconName


class FaqItem(_Model):
    slug: Slug
    question: Annotated[str, Field(min_length=1, max_length=200)]
    category: Annotated[str, Field(min_length=1, max_length=40)]
    answer: Blocks = Field(..., min_length=1)
    section_slug: Slug | None = None


class Excellence(_Model):
    title: Title
    text: Text
    icon: IconName


class About(_Model):
    title: Title
    subtitle: Title
    intro: Blocks
    philosophy_title: Title
    philosophy: Blocks
    excellences_title: Title
    excellences: list[Excellence] = Field(default_factory=list, max_length=12)
    services_title: Title
    services_subtitle: Title
    services_intro: Blocks
    why_title: Title
    why_choose: Blocks
    cta_label: Annotated[str, Field(min_length=1, max_length=60)]
    cta_note: Annotated[str, Field(max_length=300)] = ""


def _duplicates(values: list[str]) -> list[str]:
    seen: set[str] = set()
    repeated: list[str] = []
    for value in values:
        key = value.casefold()
        if key in seen:
            repeated.append(value)
        seen.add(key)
    return repeated


class CompanyInfo(_Model):
    identity: Identity
    hours: list[OpeningHours] = Field(default_factory=list, max_length=14)
    hours_note: Annotated[str, Field(max_length=300)] = ""
    service_area: ServiceArea
    services: Services
    site_visit: Blocks
    quote_terms: QuoteTerms
    home_services: list[HomeService] = Field(default_factory=list, max_length=12)
    sections: list[Section]
    faq_categories: list[FaqCategory] = Field(..., min_length=1, max_length=20)
    faq: list[FaqItem] = Field(default_factory=list, max_length=200)
    about: About

    @field_validator("sections")
    @classmethod
    def _builtin_sections(cls, sections: list[Section]) -> list[Section]:
        slugs = {s.slug for s in sections}
        missing = [slug for slug in BUILTIN_SECTION_SLUGS if slug not in slugs]
        if missing:
            raise ValueError(f"Builtin sections cannot be removed: {', '.join(missing)}.")
        wrong = [s.slug for s in sections if s.builtin != (s.slug in BUILTIN_SECTION_SLUGS)]
        if wrong:
            raise ValueError(f"Only {', '.join(BUILTIN_SECTION_SLUGS)} are builtin sections: {', '.join(wrong)}.")
        return sections

    @model_validator(mode="after")
    def _consistent(self) -> CompanyInfo:
        problems: list[str] = []
        for label, values in (
            ("section", [s.slug for s in self.sections]),
            ("FAQ", [f.slug for f in self.faq]),
            ("home service", [h.id for h in self.home_services]),
            ("FAQ category", [c.name for c in self.faq_categories]),
            ("place", self.service_area.places),
        ):
            if repeated := _duplicates(values):
                problems.append(f"Duplicate {label}: {', '.join(repeated[:10])}.")
        places = {p.casefold() for p in self.service_area.places}
        if foreign := [loc.comune for loc in self.service_area.localities if loc.comune.casefold() not in places]:
            problems.append(f"Localities must belong to a listed comune: {', '.join(foreign[:10])}.")
        categories = {c.name for c in self.faq_categories}
        if unknown := [f.category for f in self.faq if f.category not in categories]:
            problems.append(f"Unknown FAQ category: {', '.join(unknown[:10])}.")
        sections = {s.slug for s in self.sections}
        if orphan := [f.section_slug for f in self.faq if f.section_slug is not None and f.section_slug not in sections]:
            problems.append(f"FAQ linked to an unknown section: {', '.join(orphan[:10])}.")
        if problems:
            raise ValueError(" ".join(problems))
        size = len(self.model_dump_json().encode())
        if size > MAX_BYTES:
            raise ValueError(
                f"The company info is too large to store ({size // 1024} KiB, limit {MAX_BYTES // 1024} KiB)."
            )
        return self
