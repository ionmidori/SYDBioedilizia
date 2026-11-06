#!/usr/bin/env node
// Brand quality gate.
//   node scripts/brand/check.mjs                 fidelity of the master vs the original
//   node scripts/brand/check.mjs --sheet out.png  ...and a visual review sheet
//
// Fidelity: the master (default tone) is rendered at the original's scale and
// position on white and compared pixel by pixel with brand/source/*.jpg. A pixel
// counts as different when no pixel of the other image within SHIFT px is within
// MAX_DELTA_E (OKLab) of it. The gate applies to the SYMBOL (rebuilt from
// measured geometry): it fails when more than MAX_DIFF_SHARE of its ink pixels
// differ. The wordmark is reported only: it is re-set in Red Hat Display with
// the font's own kerning, so letters sit a few px from the AI original on purpose.

import path from 'node:path';
import sharp from 'sharp';
import { rgbToOklab } from './lib/color.mjs';
import { composeSvg, readMaster, variantPaths } from './lib/logo.mjs';
import { BRAND_DIR, loadTokens, logoPalette, resolveValue } from './lib/tokens.mjs';

const SOURCE = path.join(BRAND_DIR, 'source', 'syd-logo-source.jpg');
const MAX_DELTA_E = 10;
const MAX_DIFF_SHARE = 0.04;
const INK = 18; // ΔE from white above which a pixel is ink
const SHIFT = 2; // px of placement tolerance

const tokens = loadTokens();
const master = readMaster();
const palette = logoPalette(tokens);
const white = resolveValue(tokens, '{color.brand.white}');

/** The full logo, default tone, at the original's scale and position on white. */
function atSourceScale(width, height) {
    const [ox, oy] = master.origin;
    const body = variantPaths(master, 'full')
        .map((p) => `<path fill="${palette[p.role]}" d="${p.d}"/>`)
        .join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-ox} ${-oy} ${width} ${height}"><rect x="${-ox}" y="${-oy}" width="${width}" height="${height}" fill="${white}"/>${body}</svg>`;
}

/** OKLab of every pixel, computed once (ΔE is then a plain distance). */
function oklabPixels(rgb, n) {
    const lab = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) lab.set(rgbToOklab([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]), i * 3);
    return lab;
}

async function fidelity() {
    const src = sharp(SOURCE);
    const { width, height } = await src.metadata();
    const a = await src.removeAlpha().raw().toBuffer();
    const b = await sharp(Buffer.from(atSourceScale(width, height))).removeAlpha().raw().toBuffer();
    const n = width * height;
    const [la, lb] = [oklabPixels(a, n), oklabPixels(b, n)];
    // ΔE ×100 as in color.mjs#deltaE, compared squared.
    const close = (p, i, q, j, limit) => {
        const d0 = p[i * 3] - q[j * 3];
        const d1 = p[i * 3 + 1] - q[j * 3 + 1];
        const d2 = p[i * 3 + 2] - q[j * 3 + 2];
        return 1e4 * (d0 * d0 + d1 * d1 + d2 * d2) <= limit * limit;
    };
    const white3 = Float32Array.from(rgbToOklab([255, 255, 255]));
    // A pixel matches when some pixel of the other image within SHIFT px is close
    // in colour: sub-pixel edge placement and the original's soft edges are not
    // differences in the drawing.
    const matches = (p, other, x, y) => {
        const i = y * width + x;
        for (let dy = -SHIFT; dy <= SHIFT; dy++) {
            for (let dx = -SHIFT; dx <= SHIFT; dx++) {
                const xx = x + dx;
                const yy = y + dy;
                if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
                if (close(p, i, other, yy * width + xx, MAX_DELTA_E)) return true;
            }
        }
        return false;
    };
    const stats = { symbol: { ink: 0, diff: 0 }, wordmark: { ink: 0, diff: 0 } };
    const wordTop = master.origin[1] + master.symbolHeight + 10;
    const heat = Buffer.alloc(n * 3, 255);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (close(la, i, white3, 0, INK) && close(lb, i, white3, 0, INK)) continue;
            const s = stats[y < wordTop ? 'symbol' : 'wordmark'];
            s.ink++;
            if (matches(la, lb, x, y) && matches(lb, la, x, y)) {
                heat[i * 3] = heat[i * 3 + 1] = heat[i * 3 + 2] = 225;
            } else {
                s.diff++;
                heat[i * 3 + 1] = heat[i * 3 + 2] = 0;
            }
        }
    }
    const ink = stats.symbol.ink + stats.wordmark.ink;
    const diff = stats.symbol.diff + stats.wordmark.diff;
    return { share: diff / ink, stats, ink, diff, width, height, heat, vector: b };
}

// --- review sheet --------------------------------------------------------------

const label = (text, w, h = 34, size = 18) =>
    Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="0" y="${h - 10}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" fill="#334">${text}</text></svg>`,
    );

const png = (svg, w, h) => sharp(Buffer.from(svg)).resize(w, h).png().toBuffer();

async function sheet(out, f) {
    const onDark = logoPalette(tokens, 'on-dark');
    const siteBg = resolveValue(tokens, '{color.luxury.bg}');
    const tiles = [];
    const W = 1600;
    let y = 20;
    const put = (input, left, top) => tiles.push({ input, left, top });

    put(label('Nuovo logo SYD Bioedilizia (vettoriale, colori dai token)', W, 44, 26), 30, y);
    y += 56;
    put(await png(composeSvg(master, 'full', { palette, canvas: [W - 60, 520], fit: 0.84, background: white }), W - 60, 520), 30, y);
    y += 540;

    put(label('1 · Originale (JPG)  ·  Nuovo vettoriale  ·  Differenze (rosso = diverso oltre 2 px di tolleranza)', W, 40, 22), 30, y);
    y += 50;
    const crop = { left: 150, top: 290, width: 724, height: 440 };
    const side = 500;
    const sh = Math.round((crop.height / crop.width) * side);
    put(await sharp(SOURCE).extract(crop).resize(side, sh).png().toBuffer(), 30, y);
    put(await sharp(f.vector, { raw: { width: f.width, height: f.height, channels: 3 } }).extract(crop).resize(side, sh).png().toBuffer(), 550, y);
    put(await sharp(f.heat, { raw: { width: f.width, height: f.height, channels: 3 } }).extract(crop).resize(side, sh).png().toBuffer(), 1070, y);
    y += sh + 10;
    put(label(`Simbolo: ${pctOf(f.stats.symbol)} % di pixel diversi (soglia ${MAX_DIFF_SHARE * 100} %) · Scritta: ${pctOf(f.stats.wordmark)} % (ricomposta in Red Hat Display con il kerning del font: lettere spostate di 3-6 px rispetto all'originale)`, W, 30, 16), 30, y);
    y += 50;

    put(label('2 · Favicon (foglia + S) a misura reale e ingrandita ×4  ·  scheda chiara / scheda scura', W, 40, 22), 30, y);
    y += 50;
    let x = 30;
    for (const [bg, pal, name] of [
        [white, palette, 'chiaro'],
        [resolveValue(tokens, '{color.ui.browser-tab-dark}'), logoPalette(tokens, 'tab-dark'), 'scuro'],
    ]) {
        for (const s of [16, 32, 48]) {
            const icon = await png(composeSvg(master, 'icon', { palette: pal, canvas: [1, 1], fit: 0.94 }), s, s);
            const tile = await sharp({ create: { width: s + 16, height: s + 16, channels: 3, background: bg } })
                .composite([{ input: icon, left: 8, top: 8 }])
                .png()
                .toBuffer();
            const zoom = await sharp(tile).resize((s + 16) * 4, (s + 16) * 4, { kernel: 'nearest' }).png().toBuffer();
            put(tile, x, y);
            put(zoom, x, y + 70);
            x += (s + 16) * 4 + 20;
        }
        put(label(name, 120, 24, 14), x - 120, y + 40);
        x += 30;
    }
    y += 70 + 64 * 4 + 20;

    put(label('3 · Icone app: iPhone 180 px  ·  Android maskable 512 (cerchio = zona sicura 80 %)  ·  PWA 192', W, 40, 22), 30, y);
    y += 50;
    const apple = await png(composeSvg(master, 'icon', { palette, canvas: [1, 1], fit: 0.72, background: white }), 180, 180);
    const appleMask = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" rx="40" fill="#fff"/></svg>');
    put(await sharp(apple).composite([{ input: appleMask, blend: 'dest-in' }]).png().toBuffer(), 30, y);
    const mask = await png(composeSvg(master, 'icon', { palette, canvas: [1, 1], fit: 0.62, background: white }), 300, 300);
    const circle = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><circle cx="150" cy="150" r="150" fill="#fff"/></svg>');
    const ring = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><circle cx="150" cy="150" r="120" fill="none" stroke="#e33" stroke-width="2" stroke-dasharray="6 6"/></svg>');
    put(await sharp(mask).composite([{ input: circle, blend: 'dest-in' }, { input: ring }]).png().toBuffer(), 260, y);
    put(await png(composeSvg(master, 'icon', { palette, canvas: [1, 1], fit: 0.8, background: white }), 192, 192), 620, y);
    y += 320;

    put(label('4 · Sul sito oggi (sfondo verde petrolio, tono "su scuro")  ·  e su bianco', W, 40, 22), 30, y);
    y += 50;
    const bar = (bg, pal) =>
        png(composeSvg(master, 'full', { palette: pal, canvas: [1540, 120], fit: 0.62, background: bg }), 1540, 120);
    put(await bar(siteBg, onDark), 30, y);
    y += 130;
    put(await bar(white, palette), 30, y);
    y += 130;
    // Real size, as in the navbar: logo 44 px tall on a 72 px bar.
    for (const [bg, pal, text] of [
        [siteBg, onDark, 'navbar a misura reale (logo alto 44 px) · sito attuale'],
        [white, palette, 'navbar a misura reale (logo alto 44 px) · su bianco (tema chiaro, PR-2)'],
    ]) {
        const h = 44;
        const w = Math.round((master.width / master.height) * h);
        const logo = await png(composeSvg(master, 'full', { palette: pal }), w, h);
        const navbar = await sharp({ create: { width: 520, height: 72, channels: 3, background: bg } })
            .composite([{ input: logo, left: 20, top: 14 }])
            .png()
            .toBuffer();
        put(navbar, 30, y);
        put(label(text, 900, 30, 15), 570, y + 24);
        y += 84;
    }
    y += 10;

    await sharp({ create: { width: W, height: y + 20, channels: 3, background: '#f4f5f7' } })
        .composite(tiles)
        .png()
        .toFile(out);
    return out;
}

const pctOf = (v) => ((v.diff / v.ink) * 100).toFixed(2);
const f = await fidelity();
console.log(`fidelity (ΔE > ${MAX_DELTA_E} within ${SHIFT} px): symbol ${pctOf(f.stats.symbol)} % (limit ${MAX_DIFF_SHARE * 100} %), wordmark ${pctOf(f.stats.wordmark)} % (report only)`);
const sheetIdx = process.argv.indexOf('--sheet');
if (sheetIdx > 0) console.log('sheet:', await sheet(path.resolve(process.argv[sheetIdx + 1]), f));
if (f.stats.symbol.diff / f.stats.symbol.ink > MAX_DIFF_SHARE) {
    console.error('FAIL: the master drifted from the original logo');
    process.exit(1);
}
