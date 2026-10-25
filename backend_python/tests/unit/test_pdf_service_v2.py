"""Quote PDF v2 (Phase 128 PR 3.2): content read back from the generated PDF."""
import re
from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO

import pytest
from pypdf import PdfReader
from src.core.company import COMPANY, QUOTE_TERMS
from src.services.pdf_service import (
    PdfService,
    quote_pdf_blob_path,
    resolve_client,
    resolve_validity,
)
from src.utils.format_it import format_eur, format_number, format_qty

PROJECT_ID = "9de20502-0eb6-4075-99f1-14ad188150af"
UID = "LRYkEAr1fPe9xuhV7XKvoDM5JYN2"
APPROVED = datetime(2026, 10, 11, 9, 30, tzinfo=UTC)


def _item(desc="Tinteggiatura pareti", qty=40.7, price=12.0):
    return {"sku": "PIT-001", "description": desc, "unit": "mq", "qty": qty, "unit_price": price,
            "total": round(qty * price, 2)}


def _quote(**overrides):
    data = {
        "project_id": PROJECT_ID,
        "user_id": UID,
        "quote_number": "PRV-2026-0042",
        "version": 3,
        "project_name": "Cucina via Roma",
        "client_snapshot": {"uid": UID, "display_name": "Mario Rossi", "email": "mario@example.it",
                            "phone": "+39 333 1234567"},
        "request": {"summary": "Rifacimento cucina", "address": "Via Roma 1, 00184 Roma", "footage_sqm": 14.5,
                    "technical_notes": "Secondo piano senza ascensore"},
        "items": [_item()],
        "financials": {"subtotal": 488.4, "vat_rate": 0.22, "vat_amount": 107.45, "grand_total": 595.85},
        "admin_notes": "Sopralluogo concordato martedì.",
        "review": {"approved_at": APPROVED},
    }
    data.update(overrides)
    return data


def _text(pdf: bytes) -> str:
    reader = PdfReader(BytesIO(pdf))
    return "\n".join(page.extract_text() for page in reader.pages)


def _flat(pdf: bytes) -> str:
    return re.sub(r"\s+", " ", _text(pdf))


def test_pdf_has_the_identity_the_admin_and_client_need():
    text = _flat(PdfService().generate_pdf_bytes(_quote()))
    assert "BOZZA DI PREVENTIVO" in text
    assert "N° PRV-2026-0042" in text and "Rev. 3" in text
    assert "Mario Rossi" in text and "mario@example.it" in text
    assert "Cucina via Roma" in text and "Via Roma 1, 00184 Roma" in text
    assert "Rifacimento cucina" in text and "Secondo piano senza ascensore" in text
    assert "Sopralluogo concordato martedì." in text
    assert COMPANY.legal_name in text and f"P.IVA {COMPANY.vat_id}" in text and COMPANY.full_address in text
    assert "Pagina 1 di 1" in text


def test_pdf_never_shows_the_uid_or_the_project_id():
    text = _flat(PdfService().generate_pdf_bytes(_quote()))
    assert UID not in text and PROJECT_ID not in text and "9de20502" not in text
    anonymous = _flat(PdfService().generate_pdf_bytes(_quote(client_snapshot=None, project_name=None)))
    assert "Cliente" in anonymous and UID not in anonymous and PROJECT_ID not in anonymous


def test_pdf_states_it_is_an_automatic_draft_and_the_terms():
    text = _flat(PdfService().generate_pdf_bytes(_quote()))
    assert _flat_text(QUOTE_TERMS.short_notice) in text
    assert _flat_text(QUOTE_TERMS.disclaimer) in text
    assert "sopralluogo" in text and "contatto telefonico" in text
    assert "Validità: 30 giorni, fino al 10/11/2026" in text
    for term in QUOTE_TERMS.payment_terms:
        assert _flat_text(term) in text
    assert QUOTE_TERMS.signature_label in text


def _flat_text(value: str) -> str:
    return re.sub(r"\s+", " ", value)


def test_amounts_use_italian_formatting():
    text = _flat(PdfService().generate_pdf_bytes(_quote(
        items=[_item("Demolizione", qty=1234.5, price=1234.5)],
        financials={"subtotal": 1524230.25, "vat_rate": 0.22, "vat_amount": 335330.66, "grand_total": 1859560.91},
    )))
    assert "1.234,5" in text and "€ 1.234,50" in text
    assert "€ 1.859.560,91" in text and "IVA (22%)" in text


def test_user_text_is_escaped_not_interpreted():
    hostile = "Posa <b>grassetto</b> & <macerie> 5 < 6 </para>"
    text = _flat(PdfService().generate_pdf_bytes(_quote(
        items=[_item(hostile)],
        admin_notes="<script>alert(1)</script> & note",
        request={"summary": "Tutto <i>subito</i> & bene"},
    )))
    assert hostile in text
    assert "<script>alert(1)</script> & note" in text
    assert "Tutto <i>subito</i> & bene" in text


def test_long_quotes_paginate_with_numbered_footer_and_repeated_header():
    pdf = PdfService().generate_pdf_bytes(_quote(items=[_item(f"Voce {i}") for i in range(90)]))
    pages = PdfReader(BytesIO(pdf)).pages
    total = len(pages)
    assert total >= 3
    for number, page in enumerate(pages, start=1):
        assert f"Pagina {number} di {total}" in re.sub(r"\s+", " ", page.extract_text())
    assert "Descrizione" in pages[1].extract_text()  # table header repeated


def test_same_revision_renders_the_same_dates():
    first = _flat(PdfService().generate_pdf_bytes(_quote()))
    second = _flat(PdfService().generate_pdf_bytes(_quote()))
    assert "Data: 11/10/2026" in first and "Valida fino al: 10/11/2026" in first
    assert first == second


def test_validity_can_be_overridden_per_quote():
    _, days, until = resolve_validity(_quote(validity_days=45))
    assert days == 45 and until.strftime("%d/%m/%Y") == "25/11/2026"


def test_pdf_metadata_has_no_personal_data():
    meta = PdfReader(BytesIO(PdfService().generate_pdf_bytes(_quote()))).metadata
    assert meta is not None and meta.title == "Bozza di preventivo PRV-2026-0042"
    assert "Mario" not in str(dict(meta))


@pytest.mark.parametrize(
    "number,version,expected",
    [("PRV-2026-0042", 3, "projects/p1/quotes/PRV-2026-0042_r3.pdf"), ("PRV-2026-0042", None, "projects/p1/quotes/PRV-2026-0042_r1.pdf")],
)
def test_blob_path_uses_the_number(number, version, expected):
    assert quote_pdf_blob_path("p1", number, version) == expected


def test_legacy_blob_path_without_a_number_keeps_the_timestamp_name():
    assert re.fullmatch(r"projects/p1/quotes/quote_\d+\.pdf", quote_pdf_blob_path("p1", None, None))


def test_client_resolution_never_falls_back_to_the_uid():
    assert resolve_client({"user_id": UID})["name"] == "Cliente"
    assert resolve_client({"client_name": "Anna"})["name"] == "Anna"


def test_italian_formatting_helpers():
    assert format_number(1234.5) == "1.234,50"
    assert format_eur(0.5) == "€ 0,50"
    assert [format_qty(v) for v in (40.0, 40.7, 0.25, 1234.5, "x")] == ["40", "40,7", "0,25", "1.234,5", "x"]


def test_amounts_are_printed_rounded_half_up_like_they_are_computed():
    """`f"{x:.2f}"` rounds the binary value half-even: 11.125 → "11,12", 2.675 → "2,67".
    The PDF must print the cents the quote was computed with (src/core/money.py)."""
    assert format_eur(11.125) == "€ 11,13"
    assert format_number(2.675) == "2,68"
    assert format_eur(Decimal("1859560.91")) == "€ 1.859.560,91"
    assert format_number(0.25, 1) == "0,3"
    assert format_number(-0.004) == "0,00"


def test_a_non_finite_quantity_is_printed_as_is_instead_of_failing_the_pdf():
    assert format_qty(float("inf")) == "inf"
    assert format_qty("nan") == "nan"


def test_multi_room_quote_prints_each_room_with_its_lines_and_subtotal():
    rooms = [
        {"room_id": "bagno1", "room_label": "Bagno", "room_type": "bagno", "floor_mq": 6.5, "room_subtotal": 550.0},
        {"room_id": "cucina1", "room_label": "Cucina", "room_type": "cucina", "room_subtotal": 488.4},
        {"room_id": "camera1", "room_label": "Camera", "room_type": "camera", "room_subtotal": 0},
        {"room_id": "generale", "room_label": "Generale", "room_type": "altro", "room_subtotal": 380.0},
    ]
    items = [
        {**_item("Sanitari completi", 1, 550.0), "room_id": "bagno1"},
        {**_item(), "room_id": "cucina1"},
        {**_item("Smaltimento macerie", 1, 380.0), "room_id": "generale"},
    ]
    text = _flat(PdfService().generate_pdf_bytes(_quote(rooms=rooms, items=items)))
    assert "Dettaglio per ambiente" in text
    assert "Bagno (bagno)" in text and "Pavimento: ~6,5 mq" in text
    assert "Subtotale Bagno € 550,00" in text
    assert "Subtotale Cucina € 488,40" in text
    assert "Subtotale Generale € 380,00" in text
    # A room without lines is not printed; no "combined savings" for the client.
    assert "Camera" not in text
    assert "risparmio" not in text.lower()
    assert text.index("Sanitari completi") < text.index("Subtotale Bagno") < text.index("Tinteggiatura pareti")


def test_a_quote_without_rooms_has_no_room_sections():
    text = _flat(PdfService().generate_pdf_bytes(_quote()))
    assert "Dettaglio per ambiente" not in text and "Subtotale" not in text


def test_a_line_of_an_unknown_room_is_printed_under_generale():
    rooms = [{"room_id": "bagno1", "room_label": "Bagno", "room_type": "bagno", "room_subtotal": 550.0}]
    items = [{**_item("Sanitari completi", 1, 550.0), "room_id": "bagno1"}, {**_item("Voce senza stanza", 1, 80.0)}]
    text = _flat(PdfService().generate_pdf_bytes(_quote(rooms=rooms, items=items)))
    assert "Voce senza stanza" in text
    assert "Subtotale Generale € 80,00" in text
