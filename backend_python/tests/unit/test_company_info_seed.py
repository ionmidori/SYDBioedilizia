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


def test_faq_matches_the_site_questions_until_pr3():
    ts = (WEB / "faq-data.ts").read_text(encoding="utf-8")
    questions = re.findall(r'question:\s*"([^"]+)"', ts)
    slugs = re.findall(r'slug:\s*"([^"]+)"', ts)
    faq = _seed()["faq"]
    assert [f["question"] for f in faq] == questions
    assert [f["slug"] for f in faq] == slugs


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


def test_quote_terms_are_today_terms():
    terms = _seed()["quote_terms"]
    assert terms["validity_days"] == 30
    assert terms["payment_terms"] == [
        "30% alla firma dell'accettazione",
        "40% a metà lavori (stato di avanzamento)",
        "30% a fine lavori",
    ]


def test_faq_sections_are_linked():
    links = {f["slug"]: f.get("section_slug") for f in _seed()["faq"]}
    assert links["pagamenti-sal"] == "pagamenti"
    assert links["bonus-ristrutturazione-2026"] == "bonus-fiscali"
    assert links["differenza-cila-scia"] == "pratiche-permessi"
    assert links["tempi-ristrutturazione-100mq"] == "tempi-lavori"
