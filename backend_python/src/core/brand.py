"""
Brand colours and logos for what the backend draws: the quote emails and PDF.

Read from the files `npm run brand:build` generates in `src/brand` from the
design tokens in `web_client/brand` (the site's single source of truth), so
an email or a PDF never writes a colour by hand: it asks for a semantic role
(`BRAND.color("primary")`), whose contrast the token build already checked.
`npm run brand:check` (run in CI by web_client/__tests__/brand-pipeline.test.ts)
fails when the generated files are stale.

Loaded once at import: a missing or malformed file fails the start-up, not a
quote email.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from src.core.company import COMPANY

BRAND_DIR = Path(__file__).resolve().parent.parent / "brand"
# The email logo is drawn at a third of its pixels, so it stays sharp on 3x screens.
_EMAIL_LOGO_DENSITY = 3


@dataclass(frozen=True)
class EmailLogo:
    """Absolute URL (served by the site) and display size in CSS px."""
    url: str
    width: int
    height: int


@dataclass(frozen=True)
class PdfLogo:
    path: Path
    width_px: int
    height_px: int

    @property
    def aspect(self) -> float:
        return self.width_px / self.height_px


@dataclass(frozen=True)
class Brand:
    theme: str
    surfaces: dict[str, dict[str, str]]
    email_logo: EmailLogo
    pdf_logo: PdfLogo

    def color(self, role: str, surface: str = "default") -> str:
        """`#rrggbb` of a semantic role (roles.tokens.json) on a surface (`default`, `inverse`).

        Translucent roles (`#rrggbbaa`, e.g. the scrim) are refused: mail clients
        drop 8-digit hex and ReportLab's HexColor misreads it as an opaque colour."""
        if surface not in self.surfaces:
            raise KeyError(f"unknown brand surface {surface!r}")
        roles = self.surfaces[surface]
        if role not in roles:
            raise KeyError(f"unknown brand role {role!r}")
        value = roles[role]
        if len(value) != 7:
            raise ValueError(f"brand role {role!r} is translucent ({value}): emails and PDFs need an opaque role")
        return value


def _read(directory: Path, name: str) -> dict[str, object]:
    return cast(dict[str, object], json.loads((directory / name).read_text(encoding="utf-8")))


def load_brand(directory: Path = BRAND_DIR) -> Brand:
    tokens = _read(directory, "tokens.generated.json")
    logos = cast(dict[str, dict[str, object]], _read(directory, "assets.generated.json")["logos"])
    email, pdf = logos["email"], logos["pdf"]
    email_w, email_h = int(cast(int, email["width"])), int(cast(int, email["height"]))
    # A size that does not divide would round the <img> box and squash the logo.
    if email_w % _EMAIL_LOGO_DENSITY or email_h % _EMAIL_LOGO_DENSITY:
        raise ValueError(
            f"email logo {email_w}x{email_h} px is not a multiple of {_EMAIL_LOGO_DENSITY} "
            "(emailLogo canvas in scripts/brand/build-assets.mjs)"
        )
    return Brand(
        theme=str(tokens["theme"]),
        surfaces=cast(dict[str, dict[str, str]], tokens["surfaces"]),
        email_logo=EmailLogo(
            url=f"{COMPANY.url}{email['url']}",
            width=email_w // _EMAIL_LOGO_DENSITY,
            height=email_h // _EMAIL_LOGO_DENSITY,
        ),
        pdf_logo=PdfLogo(
            path=directory / str(pdf["file"]),
            width_px=int(cast(int, pdf["width"])),
            height_px=int(cast(int, pdf["height"])),
        ),
    )


BRAND = load_brand()
