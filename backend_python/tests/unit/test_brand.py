"""Brand colours and logos of the quote emails and PDF come from the generated
files in src/brand (scripts/brand/build-*.mjs, held fresh by `npm run brand:check`)."""
import re
from pathlib import Path

import pytest
from src.core.brand import BRAND
from src.core.company import COMPANY

SERVICES = Path(__file__).resolve().parents[2] / "src" / "services"
HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")
# ReportLab's named colours (colors.white, colors.grey, ...) are colours written by hand too.
NAMED = re.compile(r"\bcolors\.(?!HexColor\b)[a-z]+\b")


def test_roles_resolve_to_hex_on_every_surface():
    assert BRAND.theme == "light"
    for surface in ("default", "inverse"):
        for role in ("canvas", "surface", "ink", "ink-muted", "line", "primary", "on-primary", "accent-ink"):
            assert re.fullmatch(r"#[0-9a-f]{6}", BRAND.color(role, surface)), (surface, role)
    assert BRAND.color("ink") != BRAND.color("ink", "inverse")


def test_an_unknown_role_or_surface_fails_loudly():
    with pytest.raises(KeyError, match="gold"):
        BRAND.color("gold")
    with pytest.raises(KeyError, match="dark"):
        BRAND.color("ink", "dark")


def test_email_logo_is_served_by_the_site_at_a_third_of_its_pixels():
    logo = BRAND.email_logo
    assert logo.url.startswith(f"{COMPANY.url}/brand/") and logo.url.endswith(".png")
    assert (logo.width, logo.height) == (222, 40)


def test_pdf_logo_is_a_png_inside_the_backend():
    logo = BRAND.pdf_logo
    assert logo.path.is_file() and logo.path.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
    assert logo.aspect == pytest.approx(1600 / 288)


@pytest.mark.parametrize("module", ["email_templates.py", "pdf_service.py"])
def test_quote_documents_write_no_colour_by_hand(module):
    source = (SERVICES / module).read_text(encoding="utf-8")
    assert HEX.findall(source) == [], f"{module}: use BRAND.color(<role>)"
    assert NAMED.findall(source) == [], f"{module}: use BRAND.color(<role>)"
