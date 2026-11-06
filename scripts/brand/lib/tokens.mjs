// Brand tokens: load the W3C DTCG files in web_client/brand/tokens, resolve
// {references} and derive the logo tones. The result is still a DTCG tree, so
// the same object feeds Style Dictionary (CSS/TS) and the raster build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adjustToContrast } from './color.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const BRAND_DIR = path.join(ROOT, 'web_client', 'brand');
export const TOKENS_DIR = path.join(BRAND_DIR, 'tokens');

const REF = /^\{([^}]+)\}$/;
const TONE_EXT = 'syd.tone';

function deepMerge(target, source) {
    for (const [key, value] of Object.entries(source)) {
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

export function loadTokens(dir = TOKENS_DIR) {
    return deriveTones(loadTokenFiles(dir));
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
