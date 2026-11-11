"""
Company tools (Phase 141): what the agents read about SYD Bioedilizia beyond
the SCHEDA SYD block, decided by code on the company info, never by the model.

- `company_section`: the text of one section of the company info (garanzie,
  pagamenti, ..., the FAQ, Chi siamo), with the FAQ linked to it. A section
  with no text and no FAQ answers SEZIONE_VUOTA: the information is missing
  and the prompt tells the user so, with phone and email (user rule 4).
- `service_area`: SERVITA / NON_SERVITA for a place, on the list of comuni of
  the company info (user rule 1). The model may name the comune a district
  belongs to (Garbatella → Roma): the list still decides.

Fixed answers are constants: the prompt (src/prompts/components/company.py)
branches on them, and tests/unit/test_company_prompts.py keeps the two in step.
"""
from __future__ import annotations

import re
import unicodedata

from src.adk.company_context import ABOUT_SLUG, FAQ_SLUG, blocks_to_text, section_is_empty
from src.schemas.company_info import CompanyInfo, FaqItem

SECTION_EMPTY = "SEZIONE_VUOTA"
SECTION_UNKNOWN = "SEZIONE_INESISTENTE"
AREA_SERVED = "SERVITA"
AREA_NOT_SERVED = "NON_SERVITA"

_FAQ_ALIASES = frozenset({FAQ_SLUG, "domande-frequenti"})


def _plain(text: str) -> str:
    """Lowercase, no accents."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", _plain(text)).strip("-")


def _faq_text(items: list[FaqItem]) -> str:
    return "\n".join(f"D: {f.question}\nR: {blocks_to_text(f.answer).replace(chr(10), ' ')}" for f in items)


def _all_faq(info: CompanyInfo) -> str:
    parts = ["SEZIONE: Domande frequenti"]
    for category in info.faq_categories:
        items = [f for f in info.faq if f.category == category.name]
        if items:
            parts.append(f"\n{category.name}:\n{_faq_text(items)}")
    return "\n".join(parts)


def _about(info: CompanyInfo) -> str:
    about = info.about
    excellences = "\n".join(f"- {e.title}: {e.text}" for e in about.excellences)
    parts = [
        f"SEZIONE: {about.title} — {about.subtitle}",
        blocks_to_text(about.intro),
        f"{about.philosophy_title}\n{blocks_to_text(about.philosophy)}",
        f"{about.excellences_title}\n{excellences}" if excellences else "",
        f"{about.services_title} {about.services_subtitle}\n{blocks_to_text(about.services_intro)}",
        f"{about.why_title}\n{blocks_to_text(about.why_choose)}",
    ]
    return "\n\n".join(p for p in parts if p.strip())


def company_section(info: CompanyInfo, sezione: str) -> str:
    """The text of a section of the company info, or SEZIONE_VUOTA / SEZIONE_INESISTENTE."""
    asked = _slug(sezione)
    if asked in _FAQ_ALIASES:
        return _all_faq(info)
    if asked == ABOUT_SLUG:
        return _about(info)
    section = next((s for s in info.sections if asked in (s.slug, _slug(s.title))), None)
    if section is None:
        available = [s.slug for s in info.sections] + [FAQ_SLUG, ABOUT_SLUG]
        return f"{SECTION_UNKNOWN}: «{sezione.strip()}». Sezioni disponibili: {', '.join(available)}"
    if section_is_empty(info, section.slug):
        who = info.identity
        return (
            f"{SECTION_EMPTY}: la sezione «{section.title}» non ha contenuti nella scheda. "
            f"Telefono: {who.phone} · Email: {who.email}"
        )
    text = f"SEZIONE: {section.title}\n{blocks_to_text(section.blocks)}".rstrip()
    linked = [f for f in info.faq if f.section_slug == section.slug]
    if linked:
        text += f"\n\nFAQ collegate:\n{_faq_text(linked)}"
    return text


def _place_key(text: str) -> str:
    """"Sant'Angelo Romano", "sant angelo romano (RM)", "Comune di X, Lazio" → comparable keys."""
    head = re.split(r"[,(]", text, maxsplit=1)[0]
    key = " ".join(re.sub(r"[^a-z0-9]+", " ", _plain(head)).split())
    return key.removeprefix("comune di ").strip()


def service_area(info: CompanyInfo, localita: str, comune: str = "") -> str:
    """SERVITA / NON_SERVITA for a place, on the comuni (and their districts) of the company info."""
    if not _place_key(localita):
        return "Indica la località da verificare."
    area = info.service_area
    places = {_place_key(p): p for p in area.places}
    found = places.get(_place_key(localita))
    if found is None:
        locality = next((loc for loc in area.localities if _place_key(loc.name) == _place_key(localita)), None)
        found = places.get(_place_key(locality.comune)) if locality is not None else None
    if found is None and comune:
        found = places.get(_place_key(comune))
    name = localita.strip()
    if found is None:
        return f"{AREA_NOT_SERVED}: {name} non è tra i comuni della zona servita ({area.summary})."
    return f"{AREA_SERVED}: {name} (comune di {found}) rientra nella zona servita ({area.summary})."
