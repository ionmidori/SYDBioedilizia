// Brand tokens: load the W3C DTCG files in web_client/brand/tokens, resolve
// {references} and derive the logo tones. The result is still a DTCG tree, so
// the same object feeds Style Dictionary (CSS/TS) and the raster build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adjustToContrast } from './color.mjs';
import { expandRamps } from './ramp.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const BRAND_DIR = path.join(ROOT, 'web_client', 'brand');
export const TOKENS_DIR = path.join(BRAND_DIR, 'tokens');
export const THEMES_DIR = path.join(TOKENS_DIR, 'themes');
export const THEME_SUFFIX = '.tokens.json';

const REF = /^\{([^}]+)\}$/;
const TONE_EXT = 'syd.tone';
// A token file is JSON from disk: these keys would reach Object.prototype through the merge.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function deepMerge(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (UNSAFE_KEYS.has(key)) continue;
        if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
            deepMerge(target[key], value);
        } else {
            target[key] = value;
        }
    }
    return target;
}

export function loadTokenFiles(dir = TOKENS_DIR) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.tokens.json')).sort();
    if (files.length === 0) throw new Error(`No *.tokens.json in ${dir}`);
    return files.reduce((acc, f) => deepMerge(acc, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))), {});
}

export function lookup(tree, dotted) {
    const node = dotted.split('.').reduce((n, key) => (n == null ? undefined : n[key]), tree);
    if (node === undefined) throw new Error(`Unknown token {${dotted}}`);
    return node;
}

/** Resolve a value (possibly a {reference}, possibly chained) to a literal. */
export function resolveValue(tree, value, seen = new Set()) {
    const m = typeof value === 'string' ? REF.exec(value) : null;
    if (!m) return value;
    if (seen.has(m[1])) throw new Error(`Circular token reference {${m[1]}}`);
    seen.add(m[1]);
    const node = lookup(tree, m[1]);
    if (node.$value === undefined) throw new Error(`{${m[1]}} is a group, not a token`);
    return resolveValue(tree, node.$value, seen);
}

/**
 * Fill in each tone (`tone.<name>`) from its `syd.tone` extension: every role
 * in `minContrast` becomes the logo role lightened just enough to reach the
 * ratio against `surface`. Explicit $value entries win.
 */
export function deriveTones(tree) {
    for (const [name, tone] of Object.entries(tree.tone ?? {})) {
        const rule = tone.$extensions?.[TONE_EXT];
        if (!rule) continue;
        const surface = resolveValue(tree, rule.surface);
        for (const [rolePath, ratio] of Object.entries(rule.minContrast ?? {})) {
            const role = rolePath.split('.').pop();
            if (tone[role]?.$value !== undefined) continue;
            const base = resolveValue(tree, `{${rolePath}}`);
            tone[role] = {
                $value: adjustToContrast(base, surface, ratio),
                $description: `Derived: {${rolePath}} lightened to ${ratio}:1 on ${rule.surface}`,
            };
        }
    }
    return tree;
}

/** The theme the site ships: `theme` in web_client/brand/brand.json. */
export function activeThemeName(brandDir = BRAND_DIR) {
    const { theme } = JSON.parse(fs.readFileSync(path.join(brandDir, 'brand.json'), 'utf8'));
    if (!theme) throw new Error('web_client/brand/brand.json has no "theme"');
    return theme;
}

export function readThemeDoc(name, dir = THEMES_DIR) {
    return JSON.parse(fs.readFileSync(path.join(dir, `${name}${THEME_SUFFIX}`), 'utf8'));
}

/**
 * The active theme's surfaces as tokens, `theme.surface.<surface>.<role>`, so other
 * token files can point at them (a logo tone at the surface it sits on) instead of
 * copying a colour. A surface lists its own roles over the default ones; family
 * templates (`<tone>`) are expanded by the semantic engine only, not here.
 */
export function themeSurfaceTokens(doc) {
    const own = (node) => Object.fromEntries(Object.entries(node ?? {}).filter(([k]) => !k.startsWith('$') && !k.includes('<')));
    const base = own(doc.surface?.default);
    const surface = Object.fromEntries(Object.entries(own(doc.surface)).map(([s, node]) => [s, { ...base, ...own(node) }]));
    return { surface };
}

/** Token tree with ramps expanded, the active theme's surfaces under `theme`, and the logo tones derived. */
export function loadTokens(dir = TOKENS_DIR) {
    const tree = expandRamps(loadTokenFiles(dir), resolveValue);
    tree.theme = themeSurfaceTokens(readThemeDoc(activeThemeName(path.dirname(dir)), path.join(dir, 'themes')));
    return deriveTones(tree);
}

/** Logo role -> hex for a tone ('default' = the plain logo roles). */
export function logoPalette(tree, tone = 'default') {
    const roles = Object.keys(tree.logo).filter((k) => !k.startsWith('$'));
    const out = {};
    for (const role of roles) {
        const override = tone !== 'default' ? tree.tone?.[tone]?.[role] : undefined;
        out[role] = resolveValue(tree, override?.$value ?? tree.logo[role].$value);
    }
    return out;
}

export function toneNames(tree) {
    return ['default', ...Object.keys(tree.tone ?? {}).filter((k) => !k.startsWith('$'))];
}
