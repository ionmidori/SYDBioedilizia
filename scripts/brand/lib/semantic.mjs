// Semantic roles and themes: a generic engine. Which roles exist, what each must
// contrast against (roles.tokens.json), and what colour each takes per theme and
// surface (themes/<name>.tokens.json) are data; nothing about them is written here.

import fs from 'node:fs';
import path from 'node:path';
import { contrastRatio, hexToRgb, rgbToHex } from './color.mjs';
import { BRAND_DIR, TOKENS_DIR, resolveValue } from './tokens.mjs';

export const THEMES_DIR = path.join(TOKENS_DIR, 'themes');
const THEME_SUFFIX = '.tokens.json';
const ROLE_EXT = 'syd.role';
const FAMILY_EXT = 'syd.roleFamily';
const THEME_EXT = 'syd.theme';
const ALPHA_EXT = 'syd.alpha';
const OVER_EXT = 'syd.over';
/** Placeholders: a family member (danger, ...) and the palette ramp a theme assigns to it. */
const MEMBER = '<tone>';
const RAMP = '<ramp>';

const entries = (node) => Object.entries(node ?? {}).filter(([k]) => !k.startsWith('$'));
const hexOf = (tree, ref) => String(resolveValue(tree, ref)).toLowerCase();

/** Source-over compositing of `hex` at `alpha` on an opaque backdrop (what the browser paints). */
export function blend(hex, alpha, backdrop) {
    const f = hexToRgb(hex);
    const b = hexToRgb(backdrop);
    return rgbToHex(f.map((c, i) => Math.round(alpha * c + (1 - alpha) * b[i])));
}

/** CSS colour of a resolved role value: #rrggbb, or #rrggbbaa when translucent. */
export function cssColor({ hex, alpha }) {
    return alpha < 1 ? `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}` : hex;
}

/**
 * Role schema from `tree.role` and the families in `tree.roleFamily` (templates
 * expanded once per member). Requirements are validated here: every `against`
 * must name a role.
 * @returns {{ names: string[], textRoles: string[], families: Record<string, { members: string[], templates: string[] }>,
 *   requirements: { fg: string, against: string[], min: number, composite?: string[] }[] }}
 */
export function loadRoles(tree) {
    const decl = entries(tree.role).map(([name, def]) => [name, def.$extensions?.[ROLE_EXT] ?? {}]);
    const families = {};
    for (const [family, node] of entries(tree.roleFamily)) {
        const members = node.$extensions?.[FAMILY_EXT]?.members ?? [];
        const templates = entries(node);
        families[family] = { members, templates: templates.map(([t]) => t) };
        for (const m of members) {
            for (const [t, def] of templates) {
                const spec = def.$extensions?.[ROLE_EXT] ?? {};
                const contrast = spec.contrast?.map((c) => ({ ...c, against: c.against.map((a) => a.replaceAll(MEMBER, m)) }));
                decl.push([t.replaceAll(MEMBER, m), { ...spec, contrast }]);
            }
        }
    }
    const names = decl.map(([n]) => n);
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) throw new Error(`Role "${dup}" is declared twice`);
    const requirements = [];
    for (const [fg, spec] of decl) {
        for (const c of spec.contrast ?? []) {
            const unknown = c.against.find((a) => !names.includes(a));
            if (unknown) throw new Error(`Role "${fg}": contrast against unknown role "${unknown}"`);
            requirements.push({ fg, against: c.against, min: c.min, composite: c.composite?.map((ref) => hexOf(tree, ref)) });
        }
    }
    return { names, textRoles: decl.filter(([, s]) => s.textRole).map(([n]) => n), families, requirements };
}

function resolveRoleValue(tree, def, where) {
    if (def?.$value === undefined) throw new Error(`${where}: no $value`);
    const hex = hexOf(tree, def.$value);
    if (!/^#[0-9a-f]{6}$/.test(hex)) throw new Error(`${where}: ${hex} is not #rrggbb`);
    const alpha = def.$extensions?.[ALPHA_EXT] ?? 1;
    const over = def.$extensions?.[OVER_EXT];
    return over ? { hex: blend(hex, alpha, hexOf(tree, over)), alpha: 1 } : { hex, alpha };
}

/** Expand family templates (<tone>, <ramp>) of one surface; explicit roles win over templates. */
function expandSurface(node, roles, ramps, where) {
    const explicit = {};
    const expanded = {};
    for (const [key, def] of entries(node)) {
        if (!key.includes(MEMBER)) {
            explicit[key] = def;
            continue;
        }
        const family = Object.entries(roles.families).find(([, f]) => f.templates.includes(key));
        if (!family) throw new Error(`${where}: "${key}" matches no role family template`);
        const [name, { members }] = family;
        for (const m of members) {
            let value = def.$value.replaceAll(MEMBER, m);
            if (value.includes(RAMP)) {
                const ramp = ramps[name]?.[m];
                if (!ramp) throw new Error(`${where}: no ramp for ${name}.${m} (syd.theme.familyRamps)`);
                value = value.replaceAll(RAMP, ramp);
            }
            expanded[key.replaceAll(MEMBER, m)] = { ...def, $value: value };
        }
    }
    return { ...expanded, ...explicit };
}

/**
 * Resolve a theme document: every surface gets every role as { hex, alpha }.
 * A surface other than `default` inherits the roles it does not override.
 */
export function resolveTheme(tree, roles, doc, name) {
    const meta = doc.$extensions?.[THEME_EXT] ?? {};
    const raw = Object.fromEntries(
        entries(doc.surface).map(([s, node]) => [s, expandSurface(node, roles, meta.familyRamps ?? {}, `theme ${name}/${s}`)]),
    );
    if (!raw.default) throw new Error(`theme ${name}: no default surface`);
    const surfaces = {};
    for (const [s, defs] of Object.entries(raw)) {
        const unknown = Object.keys(defs).find((r) => !roles.names.includes(r));
        if (unknown) throw new Error(`theme ${name}/${s}: unknown role "${unknown}"`);
        const merged = { ...raw.default, ...defs };
        const missing = roles.names.filter((r) => !(r in merged));
        if (missing.length) throw new Error(`theme ${name}/${s}: missing roles ${missing.join(', ')}`);
        surfaces[s] = Object.fromEntries(roles.names.map((r) => [r, resolveRoleValue(tree, merged[r], `theme ${name}/${s}/${r}`)]));
    }
    return {
        name,
        description: doc.$description,
        colorScheme: meta.colorScheme ?? 'normal',
        enforceContrast: meta.enforceContrast !== false,
        logoTone: meta.logoTone ?? {},
        surfaces,
    };
}

export function themeNames(dir = THEMES_DIR) {
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(THEME_SUFFIX))
        .map((f) => f.slice(0, -THEME_SUFFIX.length))
        .sort();
}

export function loadTheme(tree, name, roles = loadRoles(tree), dir = THEMES_DIR) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, `${name}${THEME_SUFFIX}`), 'utf8'));
    return resolveTheme(tree, roles, doc, name);
}

/** The theme the site ships: `theme` in web_client/brand/brand.json. */
export function activeThemeName() {
    const { theme } = JSON.parse(fs.readFileSync(path.join(BRAND_DIR, 'brand.json'), 'utf8'));
    if (!theme) throw new Error('web_client/brand/brand.json has no "theme"');
    return theme;
}

/**
 * Every role requirement on every surface. A translucent background is composited
 * on each `composite` backdrop of the requirement (worst case wins); a translucent
 * foreground on the background it sits on.
 * @returns {{ surface: string, fg: string, bg: string, min: number, actual: number, backdrop?: string }[]} failures
 */
export function validateTheme(roles, theme) {
    const fails = [];
    for (const [surface, v] of Object.entries(theme.surfaces)) {
        for (const r of roles.requirements) {
            for (const bg of r.against) {
                const back = v[bg];
                if (back.alpha < 1 && !r.composite) {
                    throw new Error(`${bg} is translucent in ${theme.name}/${surface}: requirement ${r.fg} on ${bg} needs composite backdrops`);
                }
                const backdrops = back.alpha < 1 ? r.composite.map((b) => [blend(back.hex, back.alpha, b), b]) : [[back.hex]];
                for (const [b, backdrop] of backdrops) {
                    const fg = v[r.fg];
                    const actual = contrastRatio(fg.alpha < 1 ? blend(fg.hex, fg.alpha, b) : fg.hex, b);
                    if (actual < r.min) fails.push({ surface, fg: r.fg, bg, min: r.min, actual, ...(backdrop && { backdrop }) });
                }
            }
        }
    }
    return fails;
}

/** Elevation levels declared in `tree.elevation`, as numbers. */
export function elevationLevels(tree) {
    return entries(tree.elevation).map(([k]) => Number(k));
}

/** CSS box-shadow of an elevation token: layer colours are role variables, so shadows follow the surface. */
export function shadowCss(token, roles, where) {
    return token.$value
        .map((l) => {
            const m = /^\{role\.([\w-]+)\}$/.exec(l.color ?? '');
            if (!m || !roles.names.includes(m[1])) throw new Error(`${where}: shadow colour must be {role.<name>}, got ${l.color}`);
            const alpha = l.alpha ?? 1;
            const color = alpha < 1 ? `color-mix(in oklab, var(--role-${m[1]}) ${+(alpha * 100).toFixed(2)}%, transparent)` : `var(--role-${m[1]})`;
            return `${l.inset ? 'inset ' : ''}${l.offsetX} ${l.offsetY} ${l.blur} ${l.spread} ${color}`;
        })
        .join(', ');
}
