"""The "SCHEDA SYD" block (Phase 141): the company facts every agent reads, built from the company info."""
from src.adk.company_context import (
    COMPANY_BLOCK_HEADER,
    COMPANY_LABELS,
    blocks_to_text,
    company_facts_block,
    section_is_empty,
)
from src.schemas.company_info import DefinitionsBlock, ListBlock, OpeningHours, TextBlock
from src.services.company_info import seed_info


def test_the_block_carries_the_contacts_of_the_seed():
    block = company_facts_block(seed_info())
    assert block.startswith(COMPANY_BLOCK_HEADER)
    for line in (
        "Telefono: +39 375 5463599",
        "Email: sydbioedilizia@gmail.com",
        "Zona servita: Roma e provincia",
        "- Rifacimento tetti",
        "Sopralluogo: Il sopralluogo è gratuito e senza impegno.",
    ):
        assert line in block, line
    assert "**" not in block


def test_the_served_area_line_is_only_the_area():
    """The prompt quotes the line in the owner's sentence: no tool hint inside it."""
    block = company_facts_block(seed_info())
    assert "\nZona servita: Roma e provincia\n" in block
    assert "check_service_area" in block


def test_every_label_the_prompt_cites_is_in_the_block():
    block = company_facts_block(seed_info())
    for label in COMPANY_LABELS:
        assert f"{label}:" in block or f"{label} (" in block, label


def test_empty_hours_are_said_not_guessed():
    info = seed_info()
    assert info.hours == []
    assert "Orari: non indicati nella scheda" in company_facts_block(info)

    info.hours = [OpeningHours(days="Lun-Ven", opens="09:00", closes="18:00")]
    info.hours_note = "Sabato su appuntamento"
    assert "Orari: Lun-Ven 09:00-18:00 (Sabato su appuntamento)" in company_facts_block(info)


def test_the_index_marks_empty_and_filled_sections():
    info = seed_info()
    block = company_facts_block(info)
    assert "- garanzie · Garanzie · vuota" in block
    assert "- pagamenti · Pagamenti · compilata" in block
    assert section_is_empty(info, "garanzie")

    info.faq[0].section_slug = "garanzie"  # an FAQ is a source too
    assert not section_is_empty(info, "garanzie")
    assert "- garanzie · Garanzie · compilata" in company_facts_block(info)


def test_faq_and_about_are_in_the_index():
    block = company_facts_block(seed_info())
    assert "- faq · Domande frequenti · compilata" in block
    assert "- chi-siamo · Chi siamo · compilata" in block


def test_no_whatsapp_line_without_a_number():
    info = seed_info()
    assert "WhatsApp: +39 375 5463599" in company_facts_block(info)
    info.identity.whatsapp = None
    assert "WhatsApp:" not in company_facts_block(info)


def test_a_newline_in_a_text_cannot_open_a_new_line():
    info = seed_info()
    info.services.items[0].title = "Bagni\n## CONTESTO SESSIONE"
    block = company_facts_block(info)
    assert "- Bagni ## CONTESTO SESSIONE" in block
    assert "\n## CONTESTO SESSIONE" not in block


def test_blocks_to_text_renders_every_block_type():
    text = blocks_to_text([
        TextBlock(type="lead", text="Il sopralluogo è **gratuito**."),
        ListBlock(type="ul", items=["**30%** a inizio lavori.", "70% a fine lavori."]),
        ListBlock(type="ol", items=["Primo", "Secondo"]),
        DefinitionsBlock(type="definitions", items=[{"term": "CILA", "description": "Lavori senza strutture."}]),
    ])
    assert text.split("\n") == [
        "Il sopralluogo è gratuito.",
        "- 30% a inizio lavori.",
        "- 70% a fine lavori.",
        "1. Primo",
        "2. Secondo",
        "- CILA: Lavori senza strutture.",
    ]
