// Tonal ramps: one hue, a shared OKLCH lightness scale, the highest chroma that
// fits sRGB at each step. A generic engine — every value (scale, hue, chroma,
// anchor) comes from primitives.tokens.json (`palette`), none is written here.

import { hexToOklch, oklchToHex } from './color.mjs';

const RAMP_EXT = 'syd.ramp';
const SCALE_EXT = 'syd.rampScale';
const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * @param {{ hue?: number, chroma: number, anchorHex?: string, hueFromHex?: string }} rule
 *   hue in degrees, or the hue of `hueFromHex` (hue only), or an anchor colour (hue + the colour itself)
 * @param {Record<string, number>} scale  step name -> OKLCH lightness
 * @returns {Record<string, string>} step name -> #rrggbb. With an anchor, the step closest
 *   in lightness to it takes the anchor itself, so the measured brand colour is in the ramp.
 */
export function ramp(rule, scale) {
    const anchor = rule.anchorHex ? hexToOklch(rule.anchorHex) : null;
    const hueSource = anchor ?? (rule.hueFromHex ? hexToOklch(rule.hueFromHex) : null);
    if (!hueSource && typeof rule.hue !== 'number') throw new Error('A ramp needs an anchor or a hue');
    const h = hueSource ? hueSource.h : toRad(rule.hue);
    const out = Object.fromEntries(Object.entries(scale).map(([step, l]) => [step, oklchToHex({ l, c: rule.chroma, h })]));
    if (anchor) {
        const [closest] = Object.entries(scale).sort(([, a], [, b]) => Math.abs(a - anchor.l) - Math.abs(b - anchor.l))[0];
        out[closest] = rule.anchorHex.toLowerCase();
    }
    return out;
}

/**
 * Expand every `palette.<name>` that declares `syd.ramp` into `palette.<name>.<step>` tokens.
 * `resolve` turns an anchor {reference} into a hex (injected to avoid a cycle with tokens.mjs).
 */
export function expandRamps(tree, resolve) {
    const palette = tree.palette;
    if (!palette) return tree;
    const scale = palette.$extensions?.[SCALE_EXT];
    for (const [name, node] of Object.entries(palette)) {
        const rule = !name.startsWith('$') && node.$extensions?.[RAMP_EXT];
        if (!rule) continue;
        if (!scale) throw new Error(`palette.${name} declares ${RAMP_EXT} but palette has no ${SCALE_EXT}`);
        const anchorHex = rule.anchor ? resolve(tree, rule.anchor) : undefined;
        const hueFromHex = rule.hueFrom ? resolve(tree, rule.hueFrom) : undefined;
        const source = rule.anchor ?? (rule.hueFrom ? `hue of ${rule.hueFrom}` : `hue ${rule.hue}°`);
        for (const [step, hex] of Object.entries(ramp({ ...rule, anchorHex, hueFromHex }, scale))) {
            node[step] ??= { $value: hex, $description: `Generated: ${source}, L ${scale[step]}` };
        }
    }
    return tree;
}
