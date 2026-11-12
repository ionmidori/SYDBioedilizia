"""The bundled company info seed (Phase 141): today's site content, with the corrections the owner decided.

The site keeps a copy of it (web_client/lib/company-info/seed.json) as its
fallback when the backend cannot be reached: the two must stay identical.
"""
import json
from pathlib import Path

import src
from src.schemas.company_info import CompanyInfo

SEED = Path(src.__file__).resolve().parent / "data" / "company_info.seed.json"
SITE_SEED = Path(__file__).resolve().parents[3] / "web_client" / "lib" / "company-info" / "seed.json"


def _seed() -> dict:
    return json.loads(SEED.read_text(encoding="utf-8"))["info"]


def test_the_seed_satisfies_the_schema():
    raw = _seed()
    info = CompanyInfo.model_validate(raw)
    # No hidden defaults: what is stored is exactly what the editor will show.
    assert info.model_dump(mode="json", exclude_none=True) == raw


def test_service_area_is_the_whole_metropolitan_city():
    places = _seed()["service_area"]["places"]
    assert len(places) == 121
    for comune in ("Roma", "Velletri", "Civitavecchia", "Fiumicino", "Tivoli", "Guidonia Montecelio"):
        assert comune in places
    for outside in ("Viterbo", "Latina", "Rieti"):
        assert outside not in places
    assert {loc["name"] for loc in _seed()["service_area"]["localities"]} >= {"Ostia", "Acilia", "EUR"}


def test_the_site_fallback_is_the_seed():
    """The site shows its own copy when the backend is down: it must be the backend's seed."""
    assert json.loads(SITE_SEED.read_text(encoding="utf-8")) == json.loads(SEED.read_text(encoding="utf-8"))


def test_the_corrected_texts_no_longer_contradict_the_rules():
    text = SEED.read_text(encoding="utf-8")
    for contradiction in ("tutta Italia", "tramite il chatbot", "Entro 48 ore", "costruzione ex novo"):
        assert contradiction not in text
    assert "Costruzioni e Ristrutturazioni" not in json.dumps(_seed()["about"], ensure_ascii=False)
    visit = next(f for f in _seed()["faq"] if f["slug"] == "sopralluogo-gratuito")
    assert "dopo aver ricevuto il preventivo" in json.dumps(visit, ensure_ascii=False)


def test_services_keep_roofs_and_drop_new_builds():
    titles = [item["title"] for item in _seed()["services"]["items"]]
    assert "Rifacimento tetti" in titles
    assert not [t for t in titles if "ex novo" in t.lower()]


OWNER_PAYMENTS = ["30% a inizio lavori", "50% a metà lavori", "20% a fine lavori"]


def _section(slug: str) -> str:
    section = next(s for s in _seed()["sections"] if s["slug"] == slug)
    return json.dumps(section["blocks"], ensure_ascii=False)


def test_payments_are_the_owner_terms_everywhere():
    terms = _seed()["quote_terms"]
    assert terms["validity_days"] == 30
    assert terms["payment_terms"] == OWNER_PAYMENTS
    for share in ("30%", "50%", "20%"):
        assert share in _section("pagamenti")
    faq = json.dumps(next(f for f in _seed()["faq"] if f["slug"] == "pagamenti-sal"), ensure_ascii=False)
    assert "50%" in faq and "40%" not in faq and "bonifico parlante" not in faq


def test_tax_bonuses_are_not_handled():
    assert "bonus-ristrutturazione-2026" not in {f["slug"] for f in _seed()["faq"]}
    assert "non gestisce" in _section("bonus-fiscali")
    about = json.dumps(_seed()["about"], ensure_ascii=False)
    assert "Ecobonus" not in about and "detrazioni" not in about


def test_owner_sections_are_filled():
    assert "geometra" in _section("pratiche-permessi")
    times = _section("tempi-lavori")
    assert "10 giorni" in times and "5-7 giorni" in times and "70 giorni" in times
    times_faq = json.dumps(next(f for f in _seed()["faq"] if f["slug"] == "tempi-ristrutturazione"), ensure_ascii=False)
    assert "70 giorni" in times_faq and "3-4 mesi" not in times_faq
    assert "squadra interna" in _section("chi-lavora") and "collaboratori esterni" in _section("chi-lavora")
    social = _section("social")
    assert "@syd_bioedilizia" in social and "@syd.bioedilizia" in social and "Google" in social
    assert "idraulico" in _section("certificazioni-materiali")
    assert _section("garanzie") == "[]"  # not given yet: the AI says it does not know


def test_the_lapsed_insulation_certification_is_gone():
    assert "UNI 11716" not in SEED.read_text(encoding="utf-8")


def test_faq_sections_are_linked():
    links = {f["slug"]: f.get("section_slug") for f in _seed()["faq"]}
    assert links["pagamenti-sal"] == "pagamenti"
    assert links["differenza-cila-scia"] == "pratiche-permessi"
    assert links["tempi-ristrutturazione"] == "tempi-lavori"
