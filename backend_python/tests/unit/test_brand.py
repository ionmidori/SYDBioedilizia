"""Brand colours and logos of the quote emails and PDF come from the generated
files in src/brand (scripts/brand/build-*.mjs, held fresh in CI by
web_client/__tests__/brand-pipeline.test.ts)."""
import json
import re
from pathlib import Path

import pytest
from src.core.brand import BRAND, load_brand
from src.core.company import COMPANY

SERVICES = Path(__file__).resolve().parents[2] / "src" / "services"
# Hex, CSS rgb()/rgba(), ReportLab's named and constructed colours (colors.white,
# colors.Color(...), toColor('red')): all colours written by hand.
GUARDS = (
    re.compile(r"#[0-9a-fA-F]{3,8}\b"),
    re.compile(r"\brgba?\("),
    re.compile(r"\bcolors\.(?!HexColor\b)[A-Za-z]+\b"),
    re.compile(r"\btoColor\("),
)


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
    found = [m for p in GUARDS for m in p.findall(source)]
    assert found == [], f"{module}: use BRAND.color(<role>), found {found}"


def test_a_translucent_role_is_refused_and_every_other_role_is_opaque_hex():
    # Mail clients and colors.HexColor both misread #rrggbbaa: only opaque roles are usable here.
    with pytest.raises(ValueError, match="scrim"):
        BRAND.color("scrim")
    for surface, roles in BRAND.surfaces.items():
        for role, value in roles.items():
            if len(value) == 7:
                assert re.fullmatch(r"#[0-9a-f]{6}", BRAND.color(role, surface)), (surface, role)


def test_the_email_logo_must_divide_by_its_density(tmp_path):
    (tmp_path / "tokens.generated.json").write_text(
        json.dumps({"theme": "light", "surfaces": {"default": {"ink": "#000000"}}}), encoding="utf-8")
    logos = {"email": {"url": "/brand/e.png", "width": 700, "height": 128},
             "pdf": {"file": "p.png", "width": 10, "height": 2}}
    (tmp_path / "assets.generated.json").write_text(json.dumps({"logos": logos}), encoding="utf-8")
    with pytest.raises(ValueError, match="700x128"):
        load_brand(tmp_path)


@pytest.mark.parametrize("sample", [
    "color:#2C3E50", "colors.white", "colors.Color(0.2, 0.2, 0.2)", "colors.CMYKColor(0, 0, 0, 1)",
    "toColor('red')", "color:rgb(44,62,80)", "background:rgba(0,0,0,.5)",
])
def test_the_guard_catches_every_way_of_writing_a_colour(sample):
    assert any(p.search(sample) for p in GUARDS), sample
