"""Company info schema (Phase 141): what the admin console may save and the AI and the site read."""
import copy

import pytest
from pydantic import ValidationError
from src.schemas.company_info import BUILTIN_SECTION_SLUGS, MAX_BYTES, CompanyInfo


def _valid() -> dict:
    """The smallest company info that may be saved: every builtin section, empty."""
    return {
        "identity": {
            "name": "SYD Bioedilizia",
            "legal_name": "SYD Bioedilizia S.r.l.",
            "vat_id": "15714991005",
            "address": {"street": "Via Quero, 132", "postal_code": "00123", "city": "Roma", "region": "RM", "country": "IT"},
            "phone": "+39 375 5463599",
            "email": "sydbioedilizia@gmail.com",
        },
        "service_area": {"summary": "Roma e provincia", "places": ["Roma", "Fiumicino"]},
        "services": {"summary": "Ristrutturazioni di interni", "items": [{"title": "Ristrutturazione bagni"}]},
        "site_visit": [{"type": "lead", "text": "Il sopralluogo è gratuito."}],
        "quote_terms": {
            "validity_days": 30,
            "payment_terms": ["30% alla firma"],
            "short_notice": "Bozza.",
            "disclaimer_title": "Natura del documento",
            "disclaimer": "Bozza non vincolante.",
            "signature_label": "Per presa visione",
        },
        "home_services": [
            {"id": "design-ai", "title": "Design AI", "description": "Render.", "icon": "Wand2", "action": "chat"}
        ],
        "sections": [{"slug": slug, "title": slug, "blocks": [], "builtin": True} for slug in BUILTIN_SECTION_SLUGS],
        "faq_categories": [{"name": "Servizi SYD", "icon": "Wrench"}],
        "faq": [
            {
                "slug": "zone",
                "question": "In quali zone operate?",
                "category": "Servizi SYD",
                "answer": [{"type": "p", "text": "Roma e provincia."}],
            }
        ],
        "about": {
            "title": "Chi Siamo",
            "subtitle": "Energia Giovane",
            "intro": [{"type": "p", "text": "Intro."}],
            "philosophy_title": "La Nostra Filosofia",
            "philosophy": [{"type": "p", "text": "CAM."}],
            "excellences_title": "Eccellenze",
            "excellences": [{"title": "Cappotto", "text": "UNI 11716.", "icon": "Award"}],
            "services_title": "Cosa Facciamo:",
            "services_subtitle": "Ristrutturazioni Chiavi in Mano",
            "services_intro": [{"type": "p", "text": "Interni."}],
            "why_title": "Perché Scegliere SYD",
            "why_choose": [{"type": "p", "text": "Bonus."}],
            "cta_label": "Richiedi un preventivo",
            "cta_note": "Il sopralluogo è gratuito.",
        },
    }


def _invalid(data: dict, *fragments: str) -> None:
    with pytest.raises(ValidationError) as exc:
        CompanyInfo.model_validate(data)
    message = str(exc.value)
    for fragment in fragments:
        assert fragment in message


def test_a_minimal_valid_info_parses():
    info = CompanyInfo.model_validate(_valid())
    assert [s.slug for s in info.sections] == list(BUILTIN_SECTION_SLUGS)
    assert info.hours == [] and info.hours_note == ""
    assert info.identity.whatsapp is None


def test_builtin_section_cannot_be_removed():
    data = _valid()
    data["sections"] = [s for s in data["sections"] if s["slug"] != "garanzie"]
    _invalid(data, "garanzie")


def test_builtin_flag_must_match_the_slug():
    data = _valid()
    data["sections"][0]["builtin"] = False
    _invalid(data, "builtin")

    data = _valid()
    data["sections"].append({"slug": "nuova", "title": "Nuova", "blocks": [], "builtin": True})
    _invalid(data, "builtin")


def test_a_new_section_may_be_added():
    data = _valid()
    data["sections"].append({"slug": "nuova", "title": "Nuova", "blocks": [{"type": "p", "text": "Testo."}]})
    assert CompanyInfo.model_validate(data).sections[-1].builtin is False


def test_duplicate_slugs_are_rejected():
    data = _valid()
    data["sections"].append({"slug": "extra", "title": "A"})
    data["sections"].append({"slug": "extra", "title": "B"})
    _invalid(data, "extra")

    data = _valid()
    data["faq"].append(copy.deepcopy(data["faq"][0]))
    _invalid(data, "zone")


def test_an_uppercase_slug_is_rejected():
    data = _valid()
    data["sections"].append({"slug": "Extra", "title": "A"})
    _invalid(data)


def test_duplicate_places_are_rejected_case_insensitively():
    data = _valid()
    data["service_area"]["places"] = ["Roma", "roma"]
    _invalid(data, "roma")


def test_locality_must_belong_to_a_listed_comune():
    data = _valid()
    data["service_area"]["places"] = ["Roma"]
    data["service_area"]["localities"] = [{"name": "Ostia", "comune": "Fiumicino"}]
    _invalid(data, "Fiumicino")


def test_faq_category_and_section_must_exist():
    data = _valid()
    data["faq"][0]["category"] = "Inesistente"
    _invalid(data, "Inesistente")

    data = _valid()
    data["faq"][0]["section_slug"] = "inesistente"
    _invalid(data, "inesistente")

    data = _valid()
    data["faq"][0]["section_slug"] = "garanzie"
    assert CompanyInfo.model_validate(data).faq[0].section_slug == "garanzie"


def test_opening_hours_must_close_after_opening():
    data = _valid()
    data["hours"] = [{"days": "Lun-Ven", "opens": "18:00", "closes": "09:00"}]
    _invalid(data)

    data = _valid()
    data["hours"] = [{"days": "Lun-Ven", "opens": "09:00", "closes": "24:00"}]
    _invalid(data)

    data = _valid()
    data["hours"] = [{"days": "Lun-Ven", "opens": "09:00", "closes": "18:00"}]
    assert CompanyInfo.model_validate(data).hours[0].closes == "18:00"


def test_unknown_block_type_and_unknown_field_are_rejected():
    data = _valid()
    data["site_visit"] = [{"type": "html", "text": "<b>x</b>"}]
    _invalid(data)

    data = _valid()
    data["identity"]["fax"] = "06 123"
    _invalid(data)


def test_invalid_vat_and_email_are_rejected():
    data = _valid()
    data["identity"]["vat_id"] = "IT15714991005"
    _invalid(data)

    data = _valid()
    data["identity"]["email"] = "non una email"
    _invalid(data)


def test_text_is_stripped():
    data = _valid()
    data["identity"]["phone"] = "  +39 375 5463599  "
    assert CompanyInfo.model_validate(data).identity.phone == "+39 375 5463599"


def test_too_large_info_is_rejected():
    data = _valid()
    paragraph = {"type": "p", "text": "x" * 2000}
    per_section = 50
    sections_needed = MAX_BYTES // (2000 * per_section) + 1
    for n in range(sections_needed):
        data["sections"].append({"slug": f"extra-{n}", "title": "X", "blocks": [paragraph] * per_section})
    _invalid(data, "too large")
