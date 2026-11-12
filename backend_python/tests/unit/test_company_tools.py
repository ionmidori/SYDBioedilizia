"""Company tools (Phase 141): sections of the company info and the served area, decided by code, not by the model."""
from unittest.mock import AsyncMock, patch

import pytest
from src.adk import agents, tools
from src.services.company_info import seed_info
from src.tools.company_tools import (
    AREA_NOT_SERVED,
    AREA_SERVED,
    SECTION_EMPTY,
    SECTION_UNKNOWN,
    company_section,
    service_area,
)

ALL_AGENTS = (agents.syd_orchestrator, agents.triage_agent, agents.design_agent, agents.quote_agent)


def _tool_names(agent) -> set[str]:
    return {getattr(t, "name", None) or getattr(t, "__name__", "") for t in agent.tools}


# ── get_company_info ─────────────────────────────────────────────────────────

def test_a_filled_section_returns_its_text_and_linked_faq():
    out = company_section(seed_info(), "pagamenti")
    assert out.startswith("SEZIONE: Pagamenti")
    assert "- 30% a inizio lavori." in out
    assert "D: Come funzionano i pagamenti?" in out
    assert "**" not in out


def test_an_empty_section_is_the_fixed_answer_with_the_contacts():
    out = company_section(seed_info(), "garanzie")
    assert out.startswith(f"{SECTION_EMPTY}:")
    assert "+39 375 5463599" in out and "sydbioedilizia@gmail.com" in out


def test_a_section_with_only_a_linked_faq_is_not_empty():
    info = seed_info()
    info.faq[0].section_slug = "garanzie"
    out = company_section(info, "garanzie")
    assert out.startswith("SEZIONE: Garanzie") and f"D: {info.faq[0].question}" in out


@pytest.mark.parametrize("asked", [" Pratiche e Permessi ", "PAGAMENTI", "tempi_lavori", "Tempi medi dei lavori"])
def test_a_section_is_found_by_slug_title_case_and_spaces(asked):
    assert company_section(seed_info(), asked).startswith("SEZIONE:")


def test_an_unknown_section_lists_the_available_slugs():
    out = company_section(seed_info(), "piscine")
    assert out.startswith(f"{SECTION_UNKNOWN}:")
    for slug in ("garanzie", "faq", "chi-siamo"):
        assert slug in out


def test_faq_and_about_are_sections_too():
    info = seed_info()
    assert "D: In quali zone operate?" in company_section(info, "faq")
    assert "D: In quali zone operate?" in company_section(info, "Domande frequenti")
    assert info.about.title in company_section(info, "chi-siamo")


# ── check_service_area ───────────────────────────────────────────────────────

@pytest.mark.parametrize(
    ("localita", "comune", "expected"),
    [
        ("Velletri", "", AREA_SERVED),
        ("velletri (RM)", "", AREA_SERVED),
        ("Velletri, Lazio", "", AREA_SERVED),
        ("Sant Angelo Romano", "", AREA_SERVED),
        ("Ostia", "", AREA_SERVED),
        ("ROMA", "", AREA_SERVED),
        ("Comune di Fiumicino", "", AREA_SERVED),
        ("Garbatella", "Roma", AREA_SERVED),
        ("Viterbo", "", AREA_NOT_SERVED),
        ("Viterbo", "Viterbo", AREA_NOT_SERVED),
        ("Milano", "", AREA_NOT_SERVED),
        ("Latina", "Latina", AREA_NOT_SERVED),
    ],
)
def test_service_area(localita, comune, expected):
    assert service_area(seed_info(), localita, comune).startswith(expected + ":")


# Final review: common spellings of served comuni came out NON_SERVITA (a lost lead).
@pytest.mark.parametrize(
    ("localita", "comune"),
    [("Montecompatri", "Monte Compatri"), ("Guidonia", "Guidonia Montecelio"),
     ("Anguillara", "Anguillara Sabazia"), ("Monte Porzio", "Monte Porzio Catone")],
)
def test_common_spellings_of_a_served_comune_are_served(localita, comune):
    out = service_area(seed_info(), localita)
    assert out.startswith(f"{AREA_SERVED}:") and f"comune di {comune}" in out


@pytest.mark.parametrize("localita", ["Monte", "Rocca"])
def test_an_ambiguous_beginning_is_not_guessed(localita):
    assert service_area(seed_info(), localita).startswith(f"{AREA_NOT_SERVED}:")


def test_a_place_not_served_names_the_served_area():
    assert "Roma e provincia" in service_area(seed_info(), "Viterbo")


def test_a_locality_names_its_comune():
    assert "comune di Roma" in service_area(seed_info(), "Ostia")


def test_a_place_removed_in_the_console_is_no_longer_served():
    info = seed_info()
    info.service_area.places.remove("Velletri")
    assert service_area(info, "Velletri").startswith(f"{AREA_NOT_SERVED}:")


def test_an_empty_place_asks_for_it():
    out = service_area(seed_info(), "  ")
    assert not out.startswith((AREA_SERVED, AREA_NOT_SERVED))


# ── ADK wiring ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("agent", ALL_AGENTS, ids=lambda a: a.name)
def test_every_agent_has_both_company_tools(agent):
    assert {"get_company_info", "check_service_area"} <= _tool_names(agent)


async def test_a_guest_uses_the_company_tools_without_any_account_lookup():
    lookup = AsyncMock(return_value=True)
    with patch.object(tools, "is_anonymous_user", new=lookup):
        section = await tools.get_company_info("garanzie")
        area = await tools.check_service_area("Velletri")
    assert section.startswith(f"{SECTION_EMPTY}:") and area.startswith(f"{AREA_SERVED}:")
    lookup.assert_not_awaited()
