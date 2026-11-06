// Colour maths for the brand build: sRGB <-> OKLab/OKLCH (Björn Ottosson) and
// WCAG 2.x contrast. No dependency: these few formulas are all the build needs.

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function hexToRgb(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) throw new Error(`Not a #rrggbb colour: ${hex}`);
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
    return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklab([r, g, b]) {
    const [lr, lg, lb] = [r, g, b].map((v) => toLinear(v / 255));
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

/** OKLab -> sRGB 0-255, or null when the colour is outside the sRGB gamut. */
export function oklabToRgb([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const lin = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    if (lin.some((c) => c < -1e-4 || c > 1 + 1e-4)) return null;
    return lin.map((c) => toGamma(clamp01(c)) * 255);
}

export function hexToOklch(hex) {
    const [L, a, b] = rgbToOklab(hexToRgb(hex));
    return { l: L, c: Math.hypot(a, b), h: Math.atan2(b, a) };
}

/** OKLCH -> hex; chroma is reduced until the colour fits in sRGB. */
export function oklchToHex({ l, c, h }) {
    for (let k = c; k >= 0; k -= 0.002) {
        const rgb = oklabToRgb([l, k * Math.cos(h), k * Math.sin(h)]);
        if (rgb) return rgbToHex(rgb);
    }
    return rgbToHex(oklabToRgb([l, 0, 0]) ?? [255, 255, 255]);
}

export function relativeLuminance(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => toLinear(v / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
    const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Lighten (or darken, on a light surface) `hex` in OKLCH, keeping its hue and
 * as much chroma as sRGB allows, by the smallest step that reaches `ratio`
 * against `surface`. Returns the colour unchanged if it already passes.
 */
export function adjustToContrast(hex, surface, ratio) {
    if (contrastRatio(hex, surface) >= ratio) return hex.toLowerCase();
    const base = hexToOklch(hex);
    const lighten = relativeLuminance(surface) < 0.18;
    for (let step = 0.002; step <= 1; step += 0.002) {
        const l = lighten ? Math.min(1, base.l + step) : Math.max(0, base.l - step);
        const out = oklchToHex({ ...base, l });
        if (contrastRatio(out, surface) >= ratio) return out;
    }
    throw new Error(`Cannot reach contrast ${ratio} for ${hex} on ${surface}`);
}

/** Perceptual distance (OKLab, scaled ×100 so ~1 is a just-noticeable step). */
export function deltaE(rgbA, rgbB) {
    const [a, b] = [rgbToOklab(rgbA), rgbToOklab(rgbB)];
    return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
