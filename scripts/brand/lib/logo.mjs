// Logo variants composed from the master SVG (brand/master/syd-logo.master.svg).
// The master carries roles (class="logo-<role>"), never colours; every output
// here gets its colours from a token palette (see tokens.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { BRAND_DIR } from './tokens.mjs';

export const MASTER_FILE = path.join(BRAND_DIR, 'master', 'syd-logo.master.svg');

/**
 * Horizontal lockup (navbar): the wordmark sits right of the symbol, its caps
 * HORIZONTAL_CAP_RATIO of the letter height and centred on the letters,
 * HORIZONTAL_GAP_RATIO of the letter height away.
 */
export const HORIZONTAL_CAP_RATIO = 0.42;
export const HORIZONTAL_GAP_RATIO = 0.3;

function horizontal(m) {
    const [lTop, lBottom] = m.letters;
    const [cTop, cBottom] = m.wordCaps;
    const lettersH = lBottom - lTop;
    const k = (HORIZONTAL_CAP_RATIO * lettersH) / (cBottom - cTop);
    const tx = m.width + HORIZONTAL_GAP_RATIO * lettersH;
    const ty = (lTop + lBottom) / 2 - (k * (cTop + cBottom)) / 2;
    return {
        box: [0, 0, tx + k * m.width, m.symbolHeight],
        parts: [{ part: 'icon' }, { part: 'letters' }, { part: 'wordmark', transform: [k, tx, ty] }],
    };
}

/** Which master groups make up each variant, and the box they occupy. */
export const VARIANTS = {
    full: (m) => ({ box: [0, 0, m.width, m.height], parts: [{ part: 'icon' }, { part: 'letters' }, { part: 'wordmark' }] }),
    horizontal,
    mark: (m) => ({ box: [0, 0, m.width, m.symbolHeight], parts: [{ part: 'icon' }, { part: 'letters' }] }),
    icon: (m) => ({ box: [0, 0, m.iconWidth, m.symbolHeight], parts: [{ part: 'icon' }] }),
};

const num = (s) => Number.parseFloat(s);
const pair = (s) => s.split(/\s+/).map(num);

export function readMaster(file = MASTER_FILE) {
    const svg = fs.readFileSync(file, 'utf8');
    const root = /<svg\b([^>]*)>/.exec(svg)?.[1];
    if (!root) throw new Error(`${file}: no <svg> element`);
    const attr = (name) => {
        const m = new RegExp(`${name}="([^"]*)"`).exec(root);
        if (!m) throw new Error(`${file}: missing ${name}`);
        return m[1];
    };
    const [, , width, height] = attr('viewBox').split(/\s+/).map(num);
    const groups = {};
    for (const g of svg.matchAll(/<g data-part="([a-z-]+)">([\s\S]*?)<\/g>/g)) {
        groups[g[1]] = [...g[2].matchAll(/<path class="logo-([a-z0-9-]+)" d="([^"]+)"\/>/g)].map((p) => ({
            role: p[1],
            d: p[2],
        }));
    }
    return {
        width,
        height,
        symbolHeight: num(attr('data-symbol-height')),
        iconWidth: num(attr('data-icon-width')),
        letters: pair(attr('data-letters')),
        wordCaps: pair(attr('data-word-caps')),
        origin: pair(attr('data-origin')),
        groups,
    };
}

/** { box, parts: [{ part, transform?: [k, tx, ty] }] } of a variant. */
export function layout(master, variant) {
    const spec = VARIANTS[variant];
    if (!spec) throw new Error(`Unknown logo variant "${variant}"`);
    return spec(master);
}

/** Paths of a variant, with any lockup transform already applied to the data. */
export function variantPaths(master, variant) {
    return layout(master, variant).parts.flatMap(({ part, transform }) => {
        const paths = master.groups[part];
        if (!paths) throw new Error(`Master has no data-part="${part}"`);
        return transform ? paths.map((p) => ({ ...p, d: scalePath(p.d, ...transform) })) : paths;
    });
}

export function variantBox(master, variant) {
    return layout(master, variant).box;
}

const fmt = (n) => Number(n.toFixed(3)).toString();

/** x' = k·x + tx, y' = k·y + ty on absolute path data (M L H V C Q Z). */
export function scalePath(d, k, tx, ty) {
    // Anything else (arcs, relative or smooth commands) would be folded into the
    // previous command's numbers and silently distort the art: refuse it.
    // ('e' / 'E' are skipped: they are exponents in numbers, not commands.)
    const unsupported = [...new Set(d.match(/[A-DF-Za-df-z]/g) ?? [])].filter((c) => !'MLHVCQZ'.includes(c));
    if (unsupported.length) throw new Error(`scalePath supports absolute M L H V C Q Z only, got "${unsupported.join('')}"`);
    return d.replace(/([MLHVCQZ])([^MLHVCQZ]*)/g, (_, cmd, args) => {
        const n = args.trim() ? args.trim().split(/[\s,]+/).map(num) : [];
        if (cmd === 'Z') return 'Z';
        if (cmd === 'H') return 'H' + n.map((x) => fmt(k * x + tx)).join(' ');
        if (cmd === 'V') return 'V' + n.map((y) => fmt(k * y + ty)).join(' ');
        if (n.length % 2) throw new Error(`Odd coordinate count in "${cmd}${args}"`);
        return cmd + n.map((c, i) => fmt(i % 2 ? k * c + ty : k * c + tx)).join(' ');
    });
}
const escapeXml = (s) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

/**
 * Stand-alone SVG of a variant with resolved colours.
 * @param {object} o
 * @param {Record<string,string>} o.palette role -> colour
 * @param {number} [o.padding] fraction of the box added on every side
 * @param {string} [o.background] fills the whole canvas
 * @param {[number,number]} [o.canvas] output aspect: the art is centred in it
 * @param {number} [o.fit] fraction of the canvas the art may occupy (with canvas)
 * @param {number} [o.safeCircle] fit the art's box inside a centred circle of this fraction (with canvas)
 * @param {string} [o.title] accessible name
 * @param {string} [o.extraStyle] CSS appended in a <style> (e.g. a dark-mode swap)
 * @param {boolean} [o.useClasses] emit class= + <style> instead of fill= (for media queries)
 */
export function composeSvg(master, variant, o) {
    const [bx, by, bw, bh] = variantBox(master, variant);
    let vb;
    if (o.canvas) {
        const [cw, ch] = o.canvas;
        // safeCircle: the art's bounding box must fit inside a centred circle of
        // that fraction of the canvas (maskable icons: 0.8, W3C safe zone).
        const scale = o.safeCircle
            ? (Math.min(cw, ch) * o.safeCircle) / Math.hypot(bw, bh)
            : Math.min((cw * (o.fit ?? 0.8)) / bw, (ch * (o.fit ?? 0.8)) / bh);
        const w = cw / scale;
        const h = ch / scale;
        vb = [bx - (w - bw) / 2, by - (h - bh) / 2, w, h];
    } else {
        const p = (o.padding ?? 0) * Math.max(bw, bh);
        vb = [bx - p, by - p, bw + 2 * p, bh + 2 * p];
    }
    const paths = variantPaths(master, variant);
    const roles = [...new Set(paths.map((p) => p.role))];
    for (const r of roles) if (!o.palette[r]) throw new Error(`Palette has no colour for logo role "${r}"`);
    const style = o.useClasses
        ? roles.map((r) => `.logo-${r}{fill:${o.palette[r]}}`).join('') + (o.extraStyle ?? '')
        : (o.extraStyle ?? '');
    const body = paths
        .map((p) => (o.useClasses ? `<path class="logo-${p.role}" d="${p.d}"/>` : `<path fill="${o.palette[p.role]}" d="${p.d}"/>`))
        .join('');
    const bg = o.background
        ? `<rect x="${fmt(vb[0])}" y="${fmt(vb[1])}" width="${fmt(vb[2])}" height="${fmt(vb[3])}" fill="${o.background}"/>`
        : '';
    const title = o.title ? `<title>${escapeXml(o.title)}</title>` : '';
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(fmt).join(' ')}"` +
        (o.title ? ' role="img"' : '') +
        `>${title}${style ? `<style>${style}</style>` : ''}${bg}${body}</svg>`
    );
}
