# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "numpy==2.5.4",
#   "fonttools==4.68.0",
#   "uharfbuzz==0.57.0",
# ]
# ///
"""Build the SYD Bioedilizia master logo from exact geometry.

Run from the repo root:  uv run scripts/brand/construct-mark.py
Output: web_client/brand/master/syd-logo.master.svg

The raster original (brand/source/syd-logo-source.jpg) is an AI-generated
1024 px JPEG with soft, wavy edges. Tracing it gives a faithful but wobbly
outline, so the symbol is rebuilt here from primitives (straight lines,
circular arcs, two cubics) whose parameters were MEASURED on the original:
least-squares line/circle fits on the boundaries of the flat colour regions
produced by scripts/brand/measure-mark.py. Each constant below quotes the fit it
comes from (rms / max residual in source pixels). The wordmark is the OFL font
Red Hat Display 400 (best IoU among 18 geometric sans candidates), converted to
outlines and aligned to the symbol.

The SVG carries NO colour: every path has class="logo-<role>" (roles in
brand/tokens/logo.tokens.json) and sits in a group data-part="icon" (leaf + 'S',
the square app icon), "letters" (Y, I, D) or "wordmark". Colours, tones and
variants are applied by scripts/brand/build-assets.mjs.

Facets are stacked, never butted: each part is first painted with a base facet
and the others are drawn on top, slightly overlapping it, so anti-aliasing can
never open a light seam between two facets.
"""

from __future__ import annotations

import io
import math
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "web_client" / "brand"
OUTPUT = BRAND / "master" / "syd-logo.master.svg"
FONT = BRAND / "fonts" / "RedHatDisplay-Regular-latin.woff"

Vec = np.ndarray


# --- measured parameters (source pixels of the 1024 px original) -------------

# Leaf
LEAF_LEFT_X = 197.35  # left edge, x = 197.31 ± 0.88
LEAF_RIGHT_X = 355.49  # right edge, x = 355.49 ± 0.24
BASELINE_ICON = 578.76  # bottom of leaf and 'S' (578.77 ± 0.07, 578.74 ± 0.35)
TOP_DIAG = ((304.01, 361.38), -35.83)  # top edge: line rms 0.17 max 0.81
SHOULDER_R = 127.0  # fillet top edge -> left edge (rms 0.7 for r 125-130)
BOTTOM_R = 77.0  # fillet right edge -> bottom (rms 0.56)
SWOOSH_UP_1 = ((335.86, 425.98), -34.83)  # rms 0.10 max 0.31
SWOOSH_UP_R = 288.0  # fillet between the two straight runs (rms 0.24)
SWOOSH_UP_2 = ((210.71, 556.84), -57.67)  # rms 0.10 max 0.67
SWOOSH_LOW = ((1124.58, 1748.80), 1493.96)  # near-flat arc: rms 0.17 max 0.83
UPPER_SEAMS = (251.62, 284.59)  # vertical, ± 0.13
SHARED_SEAM_X = 322.45  # upper 322.13 ± 0.27 and lower 322.78 ± 0.12: one stripe
LOWER_SEAM_X = 278.09  # ± 0.12
WEDGE_SEAM = ((222.28, 509.24), -17.03)  # rms 0.26

# 'S'
S_LEFT_X = 389.6  # 389.40 ± 0.80 (upper) / 389.75 (lower)
S_DIAG_DEG = 46.4  # outer 46.64 (rms 0.09) and inner 46.16 (rms 0.08): parallel
S_OUTER_PT = (430.85, 422.03)
S_INNER_PT = (418.01, 469.62)
S_NOTCH_Y = 502.0  # ± 0.00
# Bowl: two cubics, tangent to the bottom and to the outer diagonal (rms 0.27, max 0.8)
S_BOWL_1 = ((404.0, None), (447.56, None), (499.99, 540.45), (487.88, 492.0))
S_BOWL_2_C = ((484.47, 478.37), (473.99, 467.92))
S_BOWL_2_END_X = 464.75

# Letters
CAP = 393.6  # tops of Y, I, D: 393.36-393.75
BASE = 574.65  # bottoms: 574.28-575.00
Y_LEFT_DEG = 56.2  # outer 55.39 / inner 57.02 (rms ≤ 0.23): parallel sides
Y_LEFT_OUTER_PT = (532.44, 441.73)
Y_LEFT_INNER_PT = (562.35, 424.77)
Y_RIGHT_DEG = -58.96  # outer -58.08 / inner -59.84 (rms ≤ 0.20): parallel sides
Y_RIGHT_OUTER_PT = (628.15, 439.92)
Y_RIGHT_INNER_PT = (598.12, 422.73)
Y_STEM = (563.34, 601.0)  # ± 0.18 / ± 0.00
Y_SEAM_TOP_DEG = -37.91  # rms 0.19
Y_SEAM_LOW = ((583.11, 555.13), 43.02)  # rms 0.43
I_STEM = (675.26, 708.91)  # ± 0.34 / ± 0.20
I_ARC_R = 119.34  # curved seam, rms 0.28
I_ARC_RIGHT_Y = 462.8  # where it meets the right edge
I_SEAM_LEFT_Y = 509.9  # navy foot: line rms 0.07, ends at the bottom-right corner
D_X = 732.4  # flat ends, 732.14 ± 0.64
D_CX = 733.5  # centre of the bowl (outer/inner fits: 733.60 / 733.68): ~1 px straight lead
D_INNER_R = 56.7  # inner top 427.86 / bottom 541.34
D_SEAM = ((807.18, 486.44), 37.39)  # rms 0.23

# Wordmark (measured on the original: caps 623-688, 'BIO' + 'EDILIZIA')
WORD_BASELINE = 688.5
WORD_CAP_HEIGHT = 65.0
WORD_TEXT = "BIOEDILIZIA"
WORD_SPLIT = 3  # 'BIO' | 'EDILIZIA' take different roles

STACK_OVERLAP = 1.2  # px a facet runs under the next one


# --- geometry helpers --------------------------------------------------------


def v(x: float, y: float) -> Vec:
    return np.array([x, y], dtype=float)


def direction(deg: float) -> Vec:
    r = math.radians(deg)
    return v(math.cos(r), math.sin(r))


@dataclass(frozen=True)
class Line:
    p: Vec
    d: Vec

    @classmethod
    def at(cls, point: tuple[float, float], deg: float) -> "Line":
        return cls(v(*point), direction(deg))

    def y_at(self, x: float) -> float:
        return float(self.p[1] + (x - self.p[0]) * self.d[1] / self.d[0])

    def x_at(self, y: float) -> float:
        return float(self.p[0] + (y - self.p[1]) * self.d[0] / self.d[1])

    def normal(self) -> Vec:
        return v(-self.d[1], self.d[0])

    def offset(self, dist: float) -> "Line":
        return Line(self.p + self.normal() * dist, self.d)

    def foot(self, q: Vec) -> Vec:
        return self.p + self.d * float((q - self.p) @ self.d)


def at_x(line: Line, x: float) -> Vec:
    return v(x, line.y_at(x))


def at_y(line: Line, y: float) -> Vec:
    return v(line.x_at(y), y)


def intersect(a: Line, b: Line) -> Vec:
    m = np.array([a.d, -b.d]).T
    t = np.linalg.solve(m, b.p - a.p)
    return a.p + a.d * t[0]


def circle_x(center: Vec, r: float, x: float, pick: str) -> Vec:
    dy = math.sqrt(max(r * r - (x - center[0]) ** 2, 0.0))
    return v(x, center[1] + (dy if pick == "low" else -dy))


def circle_line(center: Vec, r: float, line: Line, near: Vec) -> Vec:
    f = line.foot(center)
    h = math.sqrt(max(r * r - float((f - center) @ (f - center)), 0.0))
    a, b = f + line.d * h, f - line.d * h
    return a if np.linalg.norm(a - near) < np.linalg.norm(b - near) else b


def fillet(a: Line, b: Line, r: float, toward: Vec) -> tuple[Vec, Vec, Vec]:
    """Circle of radius r tangent to lines a and b, on the side of `toward`.
    Returns (center, tangent point on a, tangent point on b)."""
    best = None
    for sa in (1, -1):
        for sb in (1, -1):
            c = intersect(a.offset(sa * r), b.offset(sb * r))
            d = float(np.linalg.norm(c - toward))
            if best is None or d < best[0]:
                best = (d, c)
    c = best[1]
    return c, a.foot(c), b.foot(c)


def two_point_center(p: Vec, q: Vec, r: float, toward: Vec) -> Vec:
    mid = (p + q) / 2
    half = float(np.linalg.norm(q - p)) / 2
    h = math.sqrt(r * r - half * half)
    n = v(-(q - p)[1], (q - p)[0]) / (2 * half)
    a, b = mid + n * h, mid - n * h
    return a if np.linalg.norm(a - toward) < np.linalg.norm(b - toward) else b


# --- path building -----------------------------------------------------------


class Path:
    def __init__(self, origin: Vec) -> None:
        self.origin = origin
        self.cmds: list[str] = []
        self.cur: Vec | None = None

    def _p(self, q: Vec) -> str:
        x, y = q - self.origin
        return f"{fmt(x)} {fmt(y)}"

    def move(self, q: Vec) -> "Path":
        self.cmds.append("M" + self._p(q))
        self.cur = q
        return self

    def line(self, *qs: Vec) -> "Path":
        for q in qs:
            self.cmds.append("L" + self._p(q))
            self.cur = q
        return self

    def arc(self, center: Vec, r: float, to: Vec, clockwise: bool) -> "Path":
        assert self.cur is not None
        a0 = math.atan2(self.cur[1] - center[1], self.cur[0] - center[0])
        a1 = math.atan2(to[1] - center[1], to[0] - center[0])
        span = (a1 - a0) % (2 * math.pi) if clockwise else (a0 - a1) % (2 * math.pi)
        large = 1 if span > math.pi else 0
        self.cmds.append(f"A{fmt(r)} {fmt(r)} 0 {large} {1 if clockwise else 0} {self._p(to)}")
        self.cur = to
        return self

    def cubic(self, c1: Vec, c2: Vec, to: Vec) -> "Path":
        self.cmds.append(f"C{self._p(c1)} {self._p(c2)} {self._p(to)}")
        self.cur = to
        return self

    def close(self) -> str:
        return "".join(self.cmds) + "Z"


def fmt(x: float) -> str:
    s = f"{x:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


# --- the symbol --------------------------------------------------------------


def build_leaf(o: Vec) -> list[tuple[str, str]]:
    top = Line.at(*TOP_DIAG)
    left = Line(v(LEAF_LEFT_X, 0), v(0, 1))
    right = Line(v(LEAF_RIGHT_X, 0), v(0, 1))
    bottom = Line(v(0, BASELINE_ICON), v(1, 0))
    tip = intersect(top, right)
    sh_c, sh_top, sh_left = fillet(top, left, SHOULDER_R, toward=v(320, 500))
    br_c, br_right, br_bottom = fillet(right, bottom, BOTTOM_R, toward=v(280, 500))

    up1, up2 = Line.at(*SWOOSH_UP_1), Line.at(*SWOOSH_UP_2)
    sw_c, sw_1, sw_2 = fillet(up1, up2, SWOOSH_UP_R, toward=v(470, 680))
    low_c, low_r = v(*SWOOSH_LOW[0]), SWOOSH_LOW[1]
    q1 = intersect(up1, right)
    q2 = circle_x(low_c, low_r, LEAF_RIGHT_X, "high")
    w = circle_line(low_c, low_r, up2, near=v(201, 572))  # tip of the swoosh

    def upper_from(x: float) -> Path:
        """Upper leaf (above the swoosh) for x >= `x`, a stripe base."""
        p = Path(o).move(at_x(top, x)).line(tip, q1)
        if x >= sw_1[0]:
            return p.line(at_x(up1, x))
        p.line(sw_1)
        return p.arc(sw_c, SWOOSH_UP_R, circle_x(sw_c, SWOOSH_UP_R, x, "high"), clockwise=False)

    def lower_from(x: float) -> Path:
        p = Path(o).move(circle_x(low_c, low_r, x, "high"))
        p.arc(low_c, low_r, q2, clockwise=True).line(br_right)
        if x >= br_bottom[0]:
            return p.arc(br_c, BOTTOM_R, circle_x(br_c, BOTTOM_R, x, "low"), clockwise=True)
        return p.arc(br_c, BOTTOM_R, br_bottom, clockwise=True).line(v(x, BASELINE_ICON))

    # base: the whole leaf minus the swoosh, in the navy of the two lower-left facets
    base = (
        Path(o).move(tip).line(q1, sw_1)
        .arc(sw_c, SWOOSH_UP_R, sw_2, clockwise=False)
        .line(w)
        .arc(low_c, low_r, q2, clockwise=True)
        .line(br_right)
        .arc(br_c, BOTTOM_R, br_bottom, clockwise=True)
        .line(v(LEAF_LEFT_X, BASELINE_ICON), sh_left)
        .arc(sh_c, SHOULDER_R, sh_top, clockwise=True)
        .close()
    )
    # upper-left facet: everything above the wedge seam
    seam = Line.at(*WEDGE_SEAM)
    s_left = intersect(seam, left)
    s_swoosh = circle_line(sw_c, SWOOSH_UP_R, seam, near=v(248, 502))
    upper_left = (
        Path(o).move(tip).line(q1, sw_1)
        .arc(sw_c, SWOOSH_UP_R, s_swoosh, clockwise=False)
        .line(s_left, sh_left)
        .arc(sh_c, SHOULDER_R, sh_top, clockwise=True)
        .close()
    )
    ov = STACK_OVERLAP
    return [
        ("facet-1", base),
        ("facet-3", upper_left),
        ("facet-6", upper_from(UPPER_SEAMS[0] - ov).close()),
        ("facet-8", upper_from(UPPER_SEAMS[1] - ov).close()),
        ("facet-9", upper_from(SHARED_SEAM_X - ov).close()),
        ("facet-2", lower_from(LOWER_SEAM_X - ov).close()),
        ("facet-4", lower_from(SHARED_SEAM_X - ov).close()),
    ]


def build_s(o: Vec) -> list[tuple[str, str]]:
    outer = Line.at(S_OUTER_PT, S_DIAG_DEG)
    inner = Line.at(S_INNER_PT, S_DIAG_DEG)
    corner = at_x(outer, S_LEFT_X)
    notch_top = at_x(inner, S_LEFT_X)
    tip = at_y(inner, S_NOTCH_Y)
    (b0x, _), (c1x, _), c2, b1 = S_BOWL_1
    b0, c1, c2, b1 = v(b0x, BASELINE_ICON), v(c1x, BASELINE_ICON), v(*c2), v(*b1)
    e = at_x(outer, S_BOWL_2_END_X)  # snapped onto the diagonal...
    d1, d2 = v(*S_BOWL_2_C[0]), v(*S_BOWL_2_C[1])
    d2 = e - outer.d * float(np.linalg.norm(e - d2))  # ...and tangent to it
    path = (
        Path(o).move(corner).line(e)
        .cubic(d2, d1, b1)
        .cubic(c2, c1, b0)
        .line(v(S_LEFT_X, BASELINE_ICON), v(S_LEFT_X, S_NOTCH_Y), tip, notch_top)
        .close()
    )
    return [("accent", path)]


def build_y(o: Vec) -> list[tuple[str, str]]:
    lo, li = Line.at(Y_LEFT_OUTER_PT, Y_LEFT_DEG), Line.at(Y_LEFT_INNER_PT, Y_LEFT_DEG)
    ro, ri = Line.at(Y_RIGHT_OUTER_PT, Y_RIGHT_DEG), Line.at(Y_RIGHT_INNER_PT, Y_RIGHT_DEG)
    x0, x1 = Y_STEM
    stem_l, stem_r = Line(v(x0, 0), v(0, 1)), Line(v(x1, 0), v(0, 1))
    p = intersect(li, stem_r)  # where the light arm leaves the stem
    crotch = intersect(li, ri)
    seam_top = Line(p, direction(Y_SEAM_TOP_DEG))
    seam_low = Line.at(*Y_SEAM_LOW)
    ov = STACK_OVERLAP

    li_under = li.offset(3 * ov)  # the dark arm runs under the light one (normal points into it)
    right_arm = (
        Path(o).move(at_y(ri, CAP)).line(
            at_y(ro, CAP), intersect(ro, stem_r), intersect(li_under, stem_r), intersect(li_under, ri)
        ).close()
    )
    stem = Path(o).move(v(x0, seam_top.y_at(x0) - 4 * ov)).line(
        v(x1, p[1]), v(x1, BASE), v(x0, BASE)
    ).close()
    light_arm = (
        Path(o).move(at_y(lo, CAP)).line(at_y(li, CAP), p, intersect(seam_top, stem_l), intersect(lo, stem_l)).close()
    )
    foot = Path(o).move(intersect(seam_low, stem_l)).line(
        intersect(seam_low, stem_r), v(x1, BASE), v(x0, BASE)
    ).close()
    del crotch
    return [("facet-5", right_arm), ("facet-6", stem), ("facet-9", light_arm), ("facet-3", foot)]


def build_i(o: Vec) -> list[tuple[str, str]]:
    x0, x1 = I_STEM
    stem = Path(o).move(v(x0, CAP)).line(v(x1, CAP), v(x1, BASE), v(x0, BASE)).close()
    a, b = v(x0, CAP), v(x1, I_ARC_RIGHT_Y)
    c = two_point_center(a, b, I_ARC_R, toward=v(793.77, 378.93))
    cap = Path(o).move(v(x0, CAP)).line(v(x1, CAP), b).arc(c, I_ARC_R, a, clockwise=True).close()
    foot = Path(o).move(v(x0, I_SEAM_LEFT_Y)).line(v(x1, BASE), v(x0, BASE)).close()
    return [("facet-7", stem), ("facet-5", cap), ("facet-1", foot)]


def build_d(o: Vec) -> list[tuple[str, str]]:
    cy = (CAP + BASE) / 2
    c, big, small = v(D_CX, cy), (BASE - CAP) / 2, D_INNER_R
    band = (
        Path(o).move(v(D_X, CAP)).line(v(D_CX, CAP))
        .arc(c, big, v(D_CX, BASE), clockwise=True)
        .line(v(D_X, BASE), v(D_X, cy + small), v(D_CX, cy + small))
        .arc(c, small, v(D_CX, cy - small), clockwise=False)
        .line(v(D_X, cy - small))
        .close()
    )
    seam = Line.at(*D_SEAM)
    si = circle_line(c, small, seam, near=v(790, 474))
    so = circle_line(c, big, seam, near=v(824, 498))
    lower = (
        Path(o).move(si).line(so).arc(c, big, v(D_CX, BASE), clockwise=True)
        .line(v(D_X, BASE), v(D_X, cy + small), v(D_CX, cy + small))
        .arc(c, small, si, clockwise=False)
        .close()
    )
    return [("facet-5", band), ("facet-3", lower)]


# --- the wordmark ------------------------------------------------------------


def build_wordmark(o: Vec, left: float, right: float) -> list[tuple[str, str]]:
    """'BIOEDILIZIA' in Red Hat Display, caps WORD_CAP_HEIGHT tall, uniformly
    tracked so its ink spans exactly the symbol's width."""
    font = TTFont(FONT)
    glyphs = font.getGlyphSet()
    s = WORD_CAP_HEIGHT / font["OS/2"].sCapHeight
    names, pens_x = shape(font, WORD_TEXT)

    def ink(name: str) -> tuple[float, float]:
        pen = BoundsPen(glyphs)
        glyphs[name].draw(pen)
        x0, _, x1, _ = pen.bounds
        return x0, x1

    first = pens_x[0] + ink(names[0])[0]
    natural = pens_x[-1] + ink(names[-1])[1] - first  # font units, kerned
    tracking = ((right - left) / s - natural) / (len(names) - 1)

    parts: list[tuple[str, str]] = []
    for role, chunk in (
        ("wordmark-primary", range(0, WORD_SPLIT)),
        ("wordmark-secondary", range(WORD_SPLIT, len(names))),
    ):
        pen = SVGPathPen(glyphs, ntos=fmt)
        for i in chunk:
            tx = left + (pens_x[i] + i * tracking - first) * s - o[0]
            glyphs[names[i]].draw(TransformPen(pen, (s, 0, 0, -s, tx, WORD_BASELINE - o[1])))
        parts.append((role, pen.getCommands()))
    return parts


def shape(font: TTFont, text: str) -> tuple[list[str], list[float]]:
    """Glyph names and pen x positions (font units) with the font's own kerning,
    shaped by HarfBuzz."""
    raw = io.BytesIO()
    plain = TTFont(FONT)
    plain.flavor = None  # WOFF -> sfnt, which HarfBuzz reads
    plain.save(raw)
    hb_font = hb.Font(hb.Face(hb.Blob(raw.getvalue())))
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf, {"kern": True, "liga": False})
    order = font.getGlyphOrder()
    names = [order[info.codepoint] for info in buf.glyph_infos]
    xs, x = [], 0.0
    for pos in buf.glyph_positions:
        xs.append(x + pos.x_offset)
        x += pos.x_advance
    return names, xs


def word_bottom(o: Vec) -> float:
    """Lowest ink of the wordmark (round letters overshoot the baseline)."""
    font = TTFont(FONT)
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    s = WORD_CAP_HEIGHT / font["OS/2"].sCapHeight
    lowest = 0.0
    for ch in set("BIOEDILIZIA"):
        pen = BoundsPen(glyphs)
        glyphs[cmap[ord(ch)]].draw(pen)
        lowest = min(lowest, pen.bounds[1])
    return WORD_BASELINE - lowest * s


def main() -> int:
    top = Line.at(*TOP_DIAG)
    origin = v(LEAF_LEFT_X, intersect(top, Line(v(LEAF_RIGHT_X, 0), v(0, 1)))[1])
    d_right = D_CX + (BASE - CAP) / 2
    groups = {
        "icon": build_leaf(origin) + build_s(origin),
        "letters": build_y(origin) + build_i(origin) + build_d(origin),
        "wordmark": build_wordmark(origin, LEAF_LEFT_X, d_right),
    }
    width = d_right - origin[0]
    # The bowl of the 'S' is the rightmost point of the square icon.
    t = np.linspace(0, 1, 2001)[:, None]
    (b0x, _), (c1x, _), c2, b1 = S_BOWL_1
    bowl = (
        (1 - t) ** 3 * v(b0x, BASELINE_ICON)
        + 3 * (1 - t) ** 2 * t * v(c1x, BASELINE_ICON)
        + 3 * (1 - t) * t**2 * v(*c2)
        + t**3 * v(*b1)
    )
    icon_width = max(LEAF_RIGHT_X, float(bowl[:, 0].max())) - origin[0]
    height = word_bottom(origin) - origin[1]
    body = []
    for part, paths in groups.items():
        body.append(f'  <g data-part="{part}">')
        body += [f'    <path class="logo-{role}" d="{d}"/>' for role, d in paths]
        body.append("  </g>")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "<!-- GENERATED by scripts/brand/construct-mark.py — do not edit by hand. -->\n"
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(width)} {fmt(height)}" '
        f'data-symbol-height="{fmt(BASELINE_ICON - origin[1])}" data-icon-width="{fmt(icon_width)}" '
        f'data-letters="{fmt(CAP - origin[1])} {fmt(BASE - origin[1])}" '
        f'data-word-caps="{fmt(WORD_BASELINE - WORD_CAP_HEIGHT - origin[1])} {fmt(WORD_BASELINE - origin[1])}" '
        f'data-origin="{fmt(origin[0])} {fmt(origin[1])}">\n'
        + "\n".join(body)
        + "\n</svg>\n",
        encoding="utf-8",
    )
    print(f"wrote {OUTPUT.relative_to(ROOT).as_posix()} ({width:.1f} x {height:.1f}, {OUTPUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
