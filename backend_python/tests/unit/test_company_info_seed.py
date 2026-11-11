"""The bundled company info seed (Phase 141): today's site content, with the corrections the owner decided.

Until the site reads the company info (Phase 141 PR-3), the identity and the FAQ
questions must also match web_client/lib/company.ts and faq-data.ts (this
replaces tests/unit/test_company_parity.py).
"""
import json
import re
from pathlib import Path

import src
from src.schemas.company_info import CompanyInfo

SEED = Path(src.__file__).resolve().parent / "data" / "company_info.seed.json"
WEB = Path(__file__).resolve().parents[3] / "web_client" / "lib"


def _seed() -> dict:
    return json.loads(SEED.read_text(encoding="utf-8"))["info"]


def _ts_value(source: str, key: str) -> str:
    match = re.search(rf"\b{key}:\s*'([^']*)'", source)
    assert match, f"{key} not found in company.ts"
    return match.group(1)


def test_the_seed_satisfies_the_schema():
    raw = _seed()
    info = CompanyInfo.model_validate(raw)
    # No hidden defaults: what is stored is exactly what the editor will show.
    assert info.model_dump(mode="json", exclude_none=True) == raw


def test_identity_matches_the_site_until_pr3():
    ts = (WEB / "company.ts").read_text(encoding="utf-8")
    identity = _seed()["identity"]
    assert identity["name"] == _ts_value(ts, "name")
    assert identity["legal_name"] == _ts_value(ts, "legalName")
    assert identity["vat_id"] == _ts_value(ts, "vatId")
    assert identity["address"] == {
        "street": _ts_value(ts, "street"),
        "postal_code": _ts_value(ts, "postalCode"),
        "city": _ts_value(ts, "city"),
        "region": _ts_value(ts, "region"),
        "country": _ts_value(ts, "country"),
    }
    assert identity["phone"] == _ts_value(ts, "phone")
    assert identity["email"] == _ts_value(ts, "email")


def test_service_area_is_the_whole_metropolitan_city():
    places = _seed()["service_area"]["places"]
    assert len(places) == 121
    for comune in ("Roma", "Velletri", "Civitavecchia", "Fiumicino", "Tivoli", "Guidonia Montecelio"):
        assert comune in places
    for outside in ("Viterbo", "Latina", "Rieti"):
        assert outside not in places
    assert {loc["name"] for loc in _seed()["service_area"]["localities"]} >= {"Ostia", "Acilia", "EUR"}


# What the owner changed on 11 Nov 2026: SYD does not handle tax bonuses (that FAQ
# leaves the site) and the times FAQ uses the owner's own times.
REMOVED_FAQ = {"bonus-ristrutturazione-2026"}
RENAMED_FAQ = {"tempi-ristrutturazione-100mq": "tempi-ristrutturazione"}


def test_faq_matches_the_site_questions_until_pr3():
    ts = (WEB / "faq-data.ts").read_text(encoding="utf-8")
    site = [
        (slug, question)
        for slug, question in zip(
            re.findall(r'slug:\s*"([^"]+)"', ts), re.findall(r'question:\s*"([^"]+)"', ts), strict=True
        )
        if slug not in REMOVED_FAQ
    ]
    faq = _seed()["faq"]
    assert [f["slug"] for f in faq] == [RENAMED_FAQ.get(slug, slug) for slug, _ in site]
    kept = [(slug, q) for slug, q in site if slug not in RENAMED_FAQ]
    assert [(f["slug"], f["question"]) for f in faq if f["slug"] not in RENAMED_FAQ.values()] == kept


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
