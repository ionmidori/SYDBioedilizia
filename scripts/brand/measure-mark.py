# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "pillow==13.0.0",
#   "numpy==2.5.4",
#   "scipy==1.18.1",
# ]
# ///
"""Measure the SYD symbol on the raster original: the numbers behind
scripts/brand/construct-mark.py.

Run from the repo root:  uv run scripts/brand/measure-mark.py

The original (brand/source/syd-logo-source.jpg) is a 1024 px, 4:2:0 JPEG with
soft edges, so it is first reduced to a ROLE MAP: every pixel gets the logo
role (token colour) it belongs to, at 4x resolution:
  1. median filter at source size (JPEG ringing), bicubic upscale x4
  2. facet role from pixels well inside a facet (OKLab distance + coverage),
     spread to edges and seams
  3. facet seams are chroma edges (half resolution in a 4:2:0 JPEG): smoothed
  4. the silhouette is the 50 % luma-coverage contour (luma is full resolution)
  5. slivers thinner than ~1.5 source px dropped
Then least-squares fits run on the boundaries between roles (side-aware:
which side the background is on): straight edges -> line (point, angle),
round edges -> circle (centre, radius), the bowl of the 'S' -> cubic Bezier
(Schneider, "An Algorithm for Automatically Fitting Digitized Curves",
Graphics Gems 1990). Each line prints the fit and its rms / max residual in
source pixels; construct-mark.py quotes them.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "web_client" / "brand"
SOURCE = BRAND / "source" / "syd-logo-source.jpg"

SCALE = 4
PAD = 6  # source px kept around the symbol
MEDIAN = 3  # at source size
TRUST = 0.045  # OKLab distance under which a pixel is trusted as its role
SLIVER_RADIUS = 3  # at xSCALE: regions thinner than ~1.5 source px are noise
MODE = 3  # at xSCALE: final clean-up of the role map
SEAM_SIGMA = 2.0 * SCALE  # ~2 source px: chroma blocks of a 4:2:0 JPEG are 16 px
LUMA = np.array([0.299, 0.587, 0.114])  # JPEG (BT.601) luma, the full-resolution channel
BACKGROUND = "background"
ACCENT = "accent"
FACETS = 9

# --- tokens ---------------------------------------------------------------------


def load_tokens() -> dict:
    merged: dict = {}
    for file in sorted((BRAND / "tokens").glob("*.tokens.json")):
        merged |= json.loads(file.read_text(encoding="utf-8"))
    return merged


def lookup(tokens: dict, dotted: str) -> dict:
    node = tokens
    for key in dotted.split("."):
        node = node[key]
    return node


def resolve(tokens: dict, value: str) -> str:
    match = re.fullmatch(r"\{(.+)\}", value)
    return resolve(tokens, lookup(tokens, match.group(1))["$value"]) if match else value


def hex_to_rgb(value: str) -> np.ndarray:
    return np.array([int(value[i : i + 2], 16) for i in (1, 3, 5)], dtype=float)


# --- colour ---------------------------------------------------------------------

_M1 = np.array(
    [
        [0.4122214708, 0.5363325363, 0.0514459929],
        [0.2119034982, 0.6806995451, 0.1073969566],
        [0.0883024619, 0.2817188376, 0.6299787005],
    ]
)
_M2 = np.array(
    [
        [0.2104542553, 0.7936177850, -0.0040720468],
        [1.9779984951, -2.4285922050, 0.4505937099],
        [0.0259040371, 0.7827717662, -0.8086757660],
    ]
)


def srgb_to_oklab(rgb: np.ndarray) -> np.ndarray:
    c = np.clip(rgb, 0, 255) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return np.cbrt(lin @ _M1.T) @ _M2.T


# --- role map -------------------------------------------------------------------


def symbol_box(rgb: np.ndarray) -> tuple[int, int, int, int]:
    ink = rgb.min(axis=2) < 200
    rows = np.where(ink.any(axis=1))[0]
    top = int(rows[0])
    gap = next(y for y in range(top, int(rows[-1])) if not ink[y].any())
    cols = np.where(ink[top:gap].any(axis=0))[0]
    h, w = ink.shape
    return (
        max(0, int(cols[0]) - PAD),
        max(0, top - PAD),
        min(w, int(cols[-1]) + 1 + PAD),
        min(h, gap + PAD),
    )


def fill_from_nearest(role: np.ndarray, trusted: np.ndarray) -> np.ndarray:
    """Pixels outside `trusted` take the role of the nearest trusted pixel."""
    _, (iy, ix) = ndimage.distance_transform_edt(~trusted, return_indices=True)
    return role[iy, ix].astype(np.uint8)


def smooth_labels(role: np.ndarray, n: int, sigma: float) -> np.ndarray:
    """Blur each role's mask and keep the strongest: straightens blocky seams."""
    stack = np.stack([ndimage.gaussian_filter((role == r).astype(np.float32), sigma) for r in range(n)])
    return stack.argmax(0).astype(np.uint8)


def disk(radius: int) -> np.ndarray:
    y, x = np.ogrid[-radius : radius + 1, -radius : radius + 1]
    return x * x + y * y <= radius * radius


def coverage(px: np.ndarray, palette: np.ndarray) -> np.ndarray:
    """Per pixel, how much of it is ink: model it as a*ink + (1-a)*white for the
    ink colour that fits best (anti-aliasing blends towards the white ground)."""
    white = palette[0]
    v = white - px  # (N,3)
    best_a = np.zeros(len(px))
    best_res = np.full(len(px), np.inf)
    for c in palette[1:]:
        u = white - c
        a = np.clip(v @ u / (u @ u), 0.0, 1.0)
        res = np.linalg.norm(v - a[:, None] * u[None], axis=1)
        better = res < best_res
        best_a[better], best_res[better] = a[better], res[better]
    return best_a


def classify(img: Image.Image, palette: np.ndarray) -> np.ndarray:
    px = np.asarray(img, dtype=float)
    shape = px.shape[:2]
    flat = px.reshape(-1, 3)
    lab = srgb_to_oklab(flat)
    dist = np.sqrt(((lab[:, None, :] - srgb_to_oklab(palette[1:])[None]) ** 2).sum(-1))
    alpha = coverage(flat, palette).reshape(shape)
    # Ink role: taken only from pixels fully inside a facet, then spread to the
    # edges and seams; the outline itself is the 50 % coverage contour.
    nearest = (dist.argmin(1) + 1).reshape(shape)
    interior = (alpha > 0.92) & (dist.min(1).reshape(shape) < TRUST)
    ink = fill_from_nearest(nearest, interior)

    # The source is a 4:2:0 JPEG: chroma is half resolution and blocky, luma is
    # not. Facet seams are chroma edges, so smooth them; the silhouette comes
    # from luma coverage against the facet that owns the pixel.
    ink = smooth_labels(ink, len(palette), SEAM_SIGMA)
    luma = px @ LUMA
    ink_luma = palette[ink] @ LUMA
    white_luma = palette[0] @ LUMA
    cover = (white_luma - luma) / np.maximum(white_luma - ink_luma, 1e-6)
    role = np.where(cover >= 0.5, ink, 0).astype(np.uint8)

    keep = np.zeros(role.shape, dtype=bool)
    for r in range(len(palette)):
        keep |= ndimage.binary_opening(role == r, structure=disk(SLIVER_RADIUS))
    role = fill_from_nearest(role, keep)
    return np.asarray(Image.fromarray(role, mode="L").filter(ImageFilter.ModeFilter(MODE)))


# --- Bezier fitting (Schneider) ------------------------------------------------


def bezier(p0, p1, p2, p3, t: np.ndarray) -> np.ndarray:
    t = t[:, None]
    mt = 1 - t
    return mt**3 * p0 + 3 * mt**2 * t * p1 + 3 * mt * t**2 * p2 + t**3 * p3


def _unit(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else v


def _chord_params(p: np.ndarray) -> np.ndarray:
    d = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])
    return d / d[-1] if d[-1] > 0 else d


def _generate(p: np.ndarray, u: np.ndarray, t1: np.ndarray, t2: np.ndarray) -> list[np.ndarray]:
    p0, p3 = p[0], p[-1]
    b0, b1, b2, b3 = (1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u**2 * (1 - u), u**3
    a1, a2 = b1[:, None] * t1, b2[:, None] * t2
    c = np.array([[np.sum(a1 * a1), np.sum(a1 * a2)], [np.sum(a1 * a2), np.sum(a2 * a2)]])
    tmp = p - (b0 + b1)[:, None] * p0 - (b2 + b3)[:, None] * p3
    x = np.array([np.sum(a1 * tmp), np.sum(a2 * tmp)])
    det = c[0, 0] * c[1, 1] - c[0, 1] * c[1, 0]
    seg = np.linalg.norm(p3 - p0)
    if abs(det) > 1e-12:
        al = (x[0] * c[1, 1] - x[1] * c[0, 1]) / det
        ar = (c[0, 0] * x[1] - c[1, 0] * x[0]) / det
    else:
        al = ar = seg / 3
    if al < 1e-6 * seg or ar < 1e-6 * seg:
        al = ar = seg / 3
    return [p0, p0 + t1 * al, p3 + t2 * ar, p3]


def _reparam(bz: list[np.ndarray], p: np.ndarray, u: np.ndarray) -> np.ndarray:
    p0, p1, p2, p3 = bz
    q = bezier(p0, p1, p2, p3, u)
    uu = u[:, None]
    d1 = 3 * ((1 - uu) ** 2 * (p1 - p0) + 2 * (1 - uu) * uu * (p2 - p1) + uu**2 * (p3 - p2))
    d2 = 6 * ((1 - uu) * (p2 - 2 * p1 + p0) + uu * (p3 - 2 * p2 + p1))
    num = np.sum((q - p) * d1, axis=1)
    den = np.sum(d1 * d1, axis=1) + np.sum((q - p) * d2, axis=1)
    return np.clip(u - np.where(np.abs(den) > 1e-12, num / den, 0), 0, 1)


def fit_cubic(p: np.ndarray, t1: np.ndarray, t2: np.ndarray, tol: float, depth: int = 0) -> list[list[np.ndarray]]:
    if len(p) <= 3:
        seg = np.linalg.norm(p[-1] - p[0]) / 3
        return [[p[0], p[0] + t1 * seg, p[-1] + t2 * seg, p[-1]]]
    u = _chord_params(p)
    bz = _generate(p, u, t1, t2)
    for _ in range(20):
        err = np.linalg.norm(bezier(*bz, u) - p, axis=1)
        if err.max() <= tol:
            return [bz]
        u = _reparam(bz, p, u)
        bz = _generate(p, u, t1, t2)
    err = np.linalg.norm(bezier(*bz, u) - p, axis=1)
    if err.max() <= tol or depth > 12:
        return [bz]
    split = int(np.clip(err.argmax(), 2, len(p) - 3))
    tc = _unit(p[split - 2] - p[split + 2])
    return fit_cubic(p[: split + 1], t1, tc, tol, depth + 1) + fit_cubic(p[split:], -tc, t2, tol, depth + 1)



# --- measurements ---------------------------------------------------------------


class RoleMap:
    """Role map at xSCALE plus boundary extraction in SOURCE pixel coordinates."""

    def __init__(self) -> None:
        tokens = load_tokens()
        self.roles = [BACKGROUND, *(f"facet-{i}" for i in range(1, FACETS + 1)), ACCENT]
        palette = np.array([hex_to_rgb(resolve(tokens, lookup(tokens, f"logo.{r}")["$value"])) for r in self.roles])
        source = Image.open(SOURCE).convert("RGB")
        self.box = symbol_box(np.asarray(source))
        crop = source.crop(self.box).filter(ImageFilter.MedianFilter(MEDIAN))
        big = crop.resize((crop.width * SCALE, crop.height * SCALE), Image.Resampling.BICUBIC)
        self.role = classify(big, palette)

    def ids(self, names: str) -> list[int]:
        return [self.roles.index(n if n == ACCENT else f"facet-{n}") for n in names.split()]

    def _window(self, p: np.ndarray, window: tuple[float, float, float, float]) -> np.ndarray:
        x0, x1, y0, y1 = window
        return p[(p[:, 0] >= x0) & (p[:, 0] <= x1) & (p[:, 1] >= y0) & (p[:, 1] <= y1)]

    def edge(self, fg: str, side: str, window: tuple[float, float, float, float]) -> np.ndarray:
        """Boundary points where roles `fg` have the background on `side`
        (above / below / left / right), inside window (x0, x1, y0, y1)."""
        f = np.isin(self.role, self.ids(fg))
        b = self.role == 0
        if side in ("below", "above"):
            a, c = (f[:-1], b[1:]) if side == "below" else (b[:-1], f[1:])
            ys, xs = np.where(a & c)
            px, py = xs + 0.5, ys + 1.0
        else:
            a, c = (f[:, :-1], b[:, 1:]) if side == "right" else (b[:, :-1], f[:, 1:])
            ys, xs = np.where(a & c)
            px, py = xs + 1.0, ys + 0.5
        p = np.stack([self.box[0] + px / SCALE, self.box[1] + py / SCALE], 1)
        return self._window(p, window)

    def seam(self, a: str, b: str, window: tuple[float, float, float, float]) -> np.ndarray:
        """Boundary points between two facet groups (either orientation)."""
        fa, fb = np.isin(self.role, self.ids(a)), np.isin(self.role, self.ids(b))
        h, w = self.role.shape
        pts = []
        for dy, dx in ((0, 1), (1, 0)):
            m = (fa[: h - dy, : w - dx] & fb[dy:, dx:]) | (fb[: h - dy, : w - dx] & fa[dy:, dx:])
            ys, xs = np.where(m)
            pts.append(
                np.stack([self.box[0] + (xs + 0.5 + dx / 2) / SCALE, self.box[1] + (ys + 0.5 + dy / 2) / SCALE], 1)
            )
        return self._window(np.concatenate(pts), window)


def fit_line(name: str, p: np.ndarray) -> None:
    c = p.mean(0)
    _, _, vt = np.linalg.svd(p - c)
    d = vt[0]
    res = (p - c) @ vt[1]
    ang = (np.degrees(np.arctan2(d[1], d[0])) + 90) % 180 - 90
    print(f"  {name:28s} line   pt=({c[0]:.2f}, {c[1]:.2f}) angle={ang:7.2f}  rms={res.std():.2f} max={abs(res).max():.2f}")


def fit_x(name: str, p: np.ndarray) -> None:
    print(f"  {name:28s} x={p[:, 0].mean():.2f} +/- {p[:, 0].std():.2f}")


def fit_y(name: str, p: np.ndarray) -> None:
    print(f"  {name:28s} y={p[:, 1].mean():.2f} +/- {p[:, 1].std():.2f}")


def fit_circle(name: str, p: np.ndarray) -> None:
    x, y = p[:, 0], p[:, 1]
    sol = np.linalg.lstsq(np.stack([x, y, np.ones_like(x)], 1), x * x + y * y, rcond=None)[0]
    cx, cy = sol[0] / 2, sol[1] / 2
    r = np.sqrt(sol[2] + cx * cx + cy * cy)
    res = np.hypot(x - cx, y - cy) - r
    print(f"  {name:28s} circle c=({cx:.2f}, {cy:.2f}) r={r:.2f}  rms={res.std():.2f} max={abs(res).max():.2f}")


def fit_corner_fillet(name: str, p: np.ndarray, x_edge: float, y_edge: float, radii: range) -> None:
    """Fillet tangent to x = x_edge and y = y_edge (bottom-right corner): best radius."""
    scores = []
    for r in radii:
        cx, cy = x_edge - r, y_edge - r
        m = p[(p[:, 0] > cx) & (p[:, 1] > cy)]
        scores.append((float(np.sqrt(((np.hypot(m[:, 0] - cx, m[:, 1] - cy) - r) ** 2).mean())), r))
    rms, r = min(scores)
    print(f"  {name:28s} fillet r={r}  rms={rms:.2f}")


def fit_bowl(name: str, p: np.ndarray, bottom_y: float, diag_pt: tuple[float, float], diag_deg: float) -> None:
    """Bowl of the 'S': fewest cubics tangent to the bottom and to the outer diagonal."""
    centre = np.array([425.0, 506.0])
    th = np.degrees(np.arctan2(p[:, 1] - centre[1], p[:, 0] - centre[0]))
    bins = [p[(th >= a) & (th < a + 1)] for a in np.arange(np.floor(th.min()), np.ceil(th.max()), 1.0)]
    q = np.array([b.mean(0) for b in bins if len(b) > 2])
    q = q[np.argsort(-np.degrees(np.arctan2(q[:, 1] - centre[1], q[:, 0] - centre[0])))]
    dd = np.array([np.cos(np.radians(diag_deg)), np.sin(np.radians(diag_deg))])
    d0 = np.array(diag_pt)
    best = None
    for xs in np.arange(404, 440, 2.0):
        for se in np.arange(30, 75, 2.5):
            p0, p3 = np.array([xs, bottom_y]), d0 + dd * se
            m = q[(q[:, 0] > xs + 1) & ((q - d0) @ dd > se + 1)]
            if len(m) < 10:
                continue
            fits = fit_cubic(np.concatenate([[p0], m, [p3]]), np.array([1.0, 0]), -dd, 0.9)
            curve = np.concatenate([bezier(*bz, np.linspace(0, 1, 300)) for bz in fits])
            pts = p[(p[:, 0] > xs + 1) & ((p - d0) @ dd > se + 1)]
            d = np.sqrt(((pts[:, None, :] - curve[None]) ** 2).sum(-1)).min(1)
            key = (len(fits), float(np.sqrt((d**2).mean())))
            if best is None or key < best[0]:
                best = (key, float(d.max()), fits)
    (n, rms), mx, fits = best
    print(f"  {name:28s} {n} cubics  rms={rms:.2f} max={mx:.2f}")
    for bz in fits:
        print("      " + "  ".join(f"({x:.2f}, {y:.2f})" for x, y in bz))


def main() -> int:
    m = RoleMap()
    e, s = m.edge, m.seam
    cat = np.concatenate
    print(f"role map {m.role.shape[1]}x{m.role.shape[0]} (x{SCALE}), symbol box {m.box}")

    print("LEAF")
    fit_line("top edge", e("3 6 8 9", "above", (258, 350, 320, 405)))
    fit_x("right edge (upper)", e("9", "right", (353, 360, 330, 405)))
    fit_x("right edge (lower)", e("4", "right", (353, 360, 472, 495)))
    fit_x("left edge", e("1 3", "left", (192, 202, 497, 572)))
    fit_y("bottom edge", e("1 2", "below", (205, 285, 574, 584)))
    corner = cat([e("4 2", "right", (290, 354.9, 498, 578)), e("4 2", "below", (280, 354.9, 498, 578.3))])
    fit_corner_fillet("bottom-right fillet", corner, 355.49, 578.77, range(70, 86))
    up = cat([e("9 8 7 6 5 3 1", "below", (200, 354, 412, 576)), e("9 8 7 6 5 3 1", "right", (200, 354, 412, 576))])
    up = up[up[:, 1] < 0.7 * (355 - up[:, 0]) + 470]  # the upper side of the swoosh
    fit_line("swoosh upper, right run", up[up[:, 0] >= 318])
    fit_line("swoosh upper, left run", up[(up[:, 0] >= 200) & (up[:, 0] < 222)])
    low = cat([e("4 2 1", "above", (200, 354, 468, 576)), e("4 2 1", "left", (200, 354, 468, 576))])
    fit_circle("swoosh lower", low[low[:, 1] > 0.55 * (355 - low[:, 0]) + 455])
    fit_x("seam 3|6", s("3", "6", (240, 262, 405, 488)))
    fit_x("seam 6|8", s("6", "8", (275, 295, 380, 455)))
    fit_x("seam 8|9", s("8", "9", (312, 332, 352, 431)))
    fit_x("seam 1|2", s("1", "2", (270, 286, 522, 576)))
    fit_x("seam 2|4", s("2", "4", (315, 330, 494, 562)))
    fit_line("seam 3|1 (wedge)", s("3", "1", (198, 247, 498, 518)))

    print("S")
    fit_x("left edge (upper)", e("accent", "left", (384, 394, 382, 436)))
    fit_x("left edge (lower)", e("accent", "left", (384, 394, 506, 575)))
    outer = cat([e("accent", "right", (392, 470, 382, 462)), e("accent", "above", (392, 470, 382, 462))])
    fit_line("outer diagonal", outer)
    fit_line("inner diagonal", e("accent", "below", (392, 444, 441, 498)))
    fit_y("notch", e("accent", "above", (394, 440, 498, 506)))
    fit_y("bottom", e("accent", "below", (392, 412, 574, 584)))
    bowl = cat([e("accent", "right", (440, 495, 455, 580)), e("accent", "below", (400, 495, 520, 579.5))])
    fit_bowl("bowl", bowl, 578.74, (430.85, 422.03), 46.4)

    print("Y")
    fit_y("cap (left arm)", e("9", "above", (505, 538, 389, 398)))
    fit_line("left arm outer", e("9", "left", (503, 562, 398, 485)))
    fit_line("left arm inner", e("9", "right", (546, 580, 398, 450)))
    fit_line("right arm outer", e("5", "right", (604, 652, 398, 478)))
    fit_line("right arm inner", e("5", "left", (585, 611, 398, 448)))
    fit_x("stem left", e("9 6 3", "left", (558, 568, 512, 570)))
    fit_x("stem right", e("6 5 9", "right", (596, 606, 485, 568)))
    fit_y("baseline", e("3 6", "below", (568, 596, 570, 580)))
    fit_line("seam 9|6", s("9", "6", (566, 598, 482, 510)))
    fit_line("seam 6|3", s("6", "3", (566, 598, 538, 572)))

    print("I")
    fit_x("left", e("5 7 1", "left", (670, 680, 400, 572)))
    fit_x("right", e("5 7 3 1", "right", (704, 714, 400, 570)))
    fit_circle("curved seam 5|7", s("5 3", "7", (676, 708, 404, 466)))
    fit_line("seam 7|1", s("7", "1", (677, 706, 512, 566)))

    print("D")
    fit_x("flat ends", e("5 3", "left", (728, 736, 396, 572)))
    o = cat([e("5 3", "right", (742, 830, 394, 575)), e("5 3", "above", (742, 830, 390, 470)), e("5 3", "below", (742, 830, 500, 578))])
    fit_circle("outer arc", o[np.hypot(o[:, 0] - 733, o[:, 1] - 484.5) > 75])
    i = cat([e("5 3", "left", (742, 795, 428, 541)), e("5 3", "below", (742, 795, 425, 470)), e("5 3", "above", (742, 795, 500, 545))])
    fit_circle("inner arc", i[np.hypot(i[:, 0] - 733, i[:, 1] - 484.5) < 70])
    fit_y("inner top", e("5", "below", (733, 742, 424, 433)))
    fit_y("inner bottom", e("3", "above", (733, 742, 538, 546)))
    fit_line("seam 5|3", s("5", "3", (790, 825, 472, 500)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
