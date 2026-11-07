// node --test scripts/brand/brand.test.mjs
// Unit tests of the brand pipeline (run in CI through web_client/__tests__/brand-pipeline.test.ts).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { contrastRatio, adjustToContrast, deltaE, hexToOklch, hexToRgb, oklchToHex } from './lib/color.mjs';
import { ramp } from './lib/ramp.mjs';
import { decodeIco, encodeIco } from './lib/ico.mjs';
import { MASTER_FILE, VARIANTS, composeSvg, readMaster, scalePath, variantBox, variantPaths } from './lib/logo.mjs';
import { ROOT, deriveTones, loadTokenFiles, loadTokens, logoPalette, resolveValue } from './lib/tokens.mjs';
import { ASSETS } from './build-assets.mjs';
import { CSS_FILE, ROLES_FILE, TS_FILE, renderAll, sameText } from './build-tokens.mjs';
import { activeThemeName, loadRoles, loadTheme, resolveTheme, themeNames, validateTheme } from './lib/semantic.mjs';

const tokens = loadTokens();
const master = readMaster();

describe('colour maths', () => {
    it('matches the WCAG reference contrast ratios', () => {
        assert.equal(contrastRatio('#000000', '#ffffff').toFixed(2), '21.00');
        assert.equal(contrastRatio('#777777', '#ffffff').toFixed(2), '4.48');
    });

    it('round-trips sRGB through OKLCH', () => {
        for (const hex of ['#07385f', '#cda865', '#269dc8', '#ffffff']) assert.equal(oklchToHex(hexToOklch(hex)), hex);
    });

    it('lightens just enough to reach a contrast ratio, keeping the hue', () => {
        const out = adjustToContrast('#07385f', '#264653', 3);
        assert.ok(contrastRatio(out, '#264653') >= 3);
        assert.ok(contrastRatio(out, '#264653') < 3.1, 'should be the smallest step');
        assert.ok(Math.abs(hexToOklch(out).h - hexToOklch('#07385f').h) < 0.05);
    });
});

describe('ramps', () => {
    // Driven by the declarations in primitives.tokens.json: a ramp added there is tested here.
    const raw = loadTokenFiles();
    const scale = raw.palette.$extensions['syd.rampScale'];
    const steps = Object.keys(scale);
    const ramps = Object.entries(raw.palette).filter(([k, v]) => !k.startsWith('$') && v.$extensions?.['syd.ramp']);
    const deg = (rad) => ((rad * 180) / Math.PI + 360) % 360;

    it('declare at least one ramp and one shared lightness scale', () => {
        assert.ok(ramps.length > 0);
        assert.ok(steps.length >= 5);
    });

    for (const [name, decl] of ramps) {
        const rule = decl.$extensions['syd.ramp'];
        const colours = steps.map((s) => resolveValue(tokens, `{palette.${name}.${s}}`));

        it(`${name}: every step is a #rrggbb colour in the sRGB gamut`, () => {
            for (const c of colours) assert.equal(oklchToHex(hexToOklch(c)), c);
        });

        it(`${name}: lightness decreases from the first to the last step`, () => {
            const l = colours.map((c) => hexToOklch(c).l);
            for (let i = 1; i < l.length; i++) assert.ok(l[i] < l[i - 1], `${name}.${steps[i]}`);
        });

        it(`${name}: chromatic steps keep the ramp hue (±3°)`, () => {
            const from = rule.anchor ?? rule.hueFrom;
            const target = from ? deg(hexToOklch(resolveValue(tokens, from)).h) : rule.hue;
            for (const c of colours) {
                const { c: chroma, h } = hexToOklch(c);
                if (chroma <= 0.02) continue;
                const diff = Math.abs(((deg(h) - target + 540) % 360) - 180);
                assert.ok(diff <= 3, `${name} ${c}: hue off by ${diff.toFixed(1)}°`);
            }
        });

        if (rule.anchor) {
            it(`${name}: contains its anchor ${rule.anchor}`, () => {
                const anchor = hexToRgb(resolveValue(tokens, rule.anchor));
                assert.ok(colours.some((c) => deltaE(hexToRgb(c), anchor) < 2));
            });
        }
    }

    it('hueFrom takes the hue only, never the colour itself', () => {
        const out = Object.values(ramp({ hueFromHex: '#cda865', chroma: 0.012 }, { 400: 0.74, 500: 0.64 }));
        assert.ok(!out.includes('#cda865'));
    });

    it('reject a ramp with neither anchor nor hue', () => {
        assert.throws(() => ramp({ chroma: 0.1 }, { 50: 0.9 }), /anchor or a hue/);
    });
});

describe('tokens', () => {
    const derived = Object.entries(loadTokenFiles().tone).filter(([, t]) => t.$extensions?.['syd.tone']);

    it('resolve every logo role to a #rrggbb colour', () => {
        for (const tone of ['default', ...derived.map(([name]) => name)]) {
            for (const [role, c] of Object.entries(logoPalette(tokens, tone))) assert.match(c, /^#[0-9a-f]{6}$/i, `${tone}/${role}`);
        }
    });

    it('declare the site and the browser-tab tones', () => {
        assert.deepEqual(derived.map(([name]) => name).sort(), ['on-dark', 'tab-dark']);
    });

    for (const [tone, def] of derived) {
        it(`derive every ${tone} role to its declared contrast on the tone surface`, () => {
            const rule = def.$extensions['syd.tone'];
            const surface = resolveValue(tokens, rule.surface);
            const pal = logoPalette(tokens, tone);
            for (const [rolePath, ratio] of Object.entries(rule.minContrast)) {
                const role = rolePath.split('.').pop();
                const got = contrastRatio(pal[role], surface);
                assert.ok(got >= ratio, `${tone}/${role}: ${got.toFixed(2)} < ${ratio}`);
            }
        });

        it(`keep the facet order (darkest first) in the ${tone} tone`, () => {
            const pal = logoPalette(tokens, tone);
            const l = (i) => hexToOklch(pal[`facet-${i}`]).l;
            for (let i = 1; i < 9; i++) assert.ok(l(i) <= l(i + 1) + 0.02, `${tone}: facet-${i} vs facet-${i + 1}`);
        });
    }

    it('never overwrite an explicit tone value', () => {
        const tree = deriveTones(loadTokenFiles());
        assert.equal(tree.tone['on-dark']['wordmark-primary'].$value, '{color.luxury.text}');
    });

    it('reject unknown and circular references', () => {
        assert.throws(() => resolveValue({ a: { $value: '{b}' } }, '{a}'), /Unknown token/);
        assert.throws(() => resolveValue({ a: { $value: '{a}' } }, '{a}'), /Circular/);
    });
});

describe('semantic roles', () => {
    const roles = loadRoles(tokens);
    const themes = themeNames().map((name) => loadTheme(tokens, name, roles));
    // Minimal in-memory schema for the engine tests (the only hex values here are fixtures).
    const fixtureTree = {
        color: { grey: { $value: '#777777' }, white: { $value: '#ffffff' }, black: { $value: '#000000' } },
        role: {
            canvas: { $extensions: { 'syd.role': {} } },
            ink: { $extensions: { 'syd.role': { textRole: true, contrast: [{ against: ['canvas'], min: 4.5 }] } } },
        },
    };
    const fixtureRoles = loadRoles(fixtureTree);
    const fixtureTheme = (surfaces) => resolveTheme(fixtureTree, fixtureRoles, { surface: surfaces }, 'fixture');

    it('declare roles, text roles and at least the default surface in every theme', () => {
        assert.ok(roles.names.length > 0 && roles.textRoles.length > 0);
        assert.ok(roles.textRoles.every((r) => roles.names.includes(r)));
        for (const t of themes) assert.ok('default' in t.surfaces, t.name);
    });

    it('expand every role family into one role per member and template', () => {
        for (const [family, { members, templates }] of Object.entries(roles.families)) {
            assert.ok(members.length > 0 && templates.length > 0, family);
            for (const m of members) for (const t of templates) assert.ok(roles.names.includes(t.replaceAll('<tone>', m)), `${family}: ${t} / ${m}`);
        }
    });

    it('every theme surface resolves every role in roles.tokens.json', () => {
        for (const t of themes) {
            for (const [surface, values] of Object.entries(t.surfaces)) {
                assert.deepEqual(Object.keys(values).sort(), [...roles.names].sort(), `${t.name}/${surface}`);
                for (const [role, v] of Object.entries(values)) assert.match(v.hex, /^#[0-9a-f]{6}$/, `${t.name}/${surface}/${role}`);
            }
        }
    });

    it('every theme declares the same surfaces', () => {
        const sets = themes.map((t) => Object.keys(t.surfaces).sort().join());
        assert.equal(new Set(sets).size, 1, sets.join(' | '));
    });

    it('every non-exempt theme passes every role requirement on every surface', () => {
        const enforced = themes.filter((t) => t.enforceContrast);
        assert.ok(enforced.length > 0, 'at least one theme is gated');
        for (const t of enforced) {
            const fails = validateTheme(roles, t).map((f) => `${t.name}/${f.surface}: ${f.fg} on ${f.bg} ${f.actual.toFixed(2)} < ${f.min}`);
            assert.deepEqual(fails, []);
        }
    });

    it('the active theme is one of the declared themes', () => {
        assert.ok(themeNames().includes(activeThemeName()));
    });

    it('validateTheme reports a failing pair', () => {
        const t = fixtureTheme({ default: { canvas: { $value: '{color.white}' }, ink: { $value: '{color.grey}' } } });
        const [fail, ...rest] = validateTheme(fixtureRoles, t);
        assert.equal(rest.length, 0);
        assert.deepEqual([fail.surface, fail.fg, fail.bg, fail.min, fail.actual.toFixed(2)], ['default', 'ink', 'canvas', 4.5, '4.48']);
    });

    it('a surface inherits roles it does not override', () => {
        const t = fixtureTheme({
            default: { canvas: { $value: '{color.white}' }, ink: { $value: '{color.black}' } },
            inverse: { canvas: { $value: '{color.black}' } },
        });
        assert.equal(t.surfaces.inverse.ink.hex, '#000000');
        assert.equal(validateTheme(fixtureRoles, t).map((f) => f.surface).join(), 'inverse');
    });

    it('flattens a translucent value onto its backdrop, keeps it translucent otherwise', () => {
        const t = fixtureTheme({
            default: {
                canvas: { $value: '{color.black}', $extensions: { 'syd.alpha': 0.5 } },
                ink: { $value: '{color.white}', $extensions: { 'syd.alpha': 0.5, 'syd.over': '{color.black}' } },
            },
        });
        assert.deepEqual(t.surfaces.default.canvas, { hex: '#000000', alpha: 0.5 });
        assert.deepEqual(t.surfaces.default.ink, { hex: '#808080', alpha: 1 });
    });

    it('rejects a theme role that roles.tokens.json does not declare', () => {
        assert.throws(
            () => fixtureTheme({ default: { canvas: { $value: '{color.white}' }, ink: { $value: '{color.black}' }, nope: { $value: '{color.black}' } } }),
            /nope/,
        );
    });

    it('rejects a requirement against an unknown role', () => {
        const tree = { role: { ink: { $extensions: { 'syd.role': { contrast: [{ against: ['ghost'], min: 3 }] } } } } };
        assert.throws(() => loadRoles(tree), /ghost/);
    });

    it('rejects a translucent background with no backdrop to composite it on', () => {
        const t = fixtureTheme({
            default: { canvas: { $value: '{color.white}', $extensions: { 'syd.alpha': 0.5 } }, ink: { $value: '{color.black}' } },
        });
        assert.throws(() => validateTheme(fixtureRoles, t), /canvas.*composite/);
    });

    const generated = Object.fromEntries(renderAll(tokens));
    const css = generated[CSS_FILE];
    const active = themes.find((t) => t.name === activeThemeName());

    it('generated css exposes every role through @theme inline and every surface as .surface-<name>', () => {
        const inline = css.match(/@theme inline \{([^}]*)\}/)?.[1] ?? '';
        for (const r of roles.names) {
            assert.ok(inline.includes(`--color-${r}: var(--role-${r});`), r);
            assert.match(css, new RegExp(`:root \\{[^}]*--role-${r}: `), r);
        }
        for (const s of Object.keys(active.surfaces).filter((s) => s !== 'default')) assert.match(css, new RegExp(`\\.surface-${s} \\{`));
    });

    it('generated css exposes every elevation level as --shadow-<n> drawn in a role colour', () => {
        const levels = Object.keys(tokens.elevation).filter((k) => !k.startsWith('$'));
        assert.ok(levels.length > 0);
        for (const l of levels) assert.match(css, new RegExp(`--shadow-${l}: [^;]*var\\(--role-`));
    });

    it('generated TS and JSON list the same roles as roles.tokens.json', () => {
        const json = JSON.parse(generated[ROLES_FILE]);
        assert.deepEqual(json.roles, roles.names);
        assert.deepEqual(json.textRoles, roles.textRoles);
        assert.deepEqual(json.surfaces, Object.keys(active.surfaces));
        assert.ok(generated[TS_FILE].includes(`export const ROLE_NAMES = ${JSON.stringify(roles.names, null, 4)} as const;`));
        assert.ok(generated[TS_FILE].includes(`export const TEXT_ROLES = ${JSON.stringify(roles.textRoles, null, 4)} as const;`));
    });

    it('globals.css and styles/* define no shadcn variables', () => {
        const dir = path.join(ROOT, 'web_client', 'app');
        const files = ['globals.css', ...fs.readdirSync(path.join(dir, 'styles')).map((f) => path.join('styles', f))];
        const shadcn = /--(background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring|sidebar)[\w-]*\s*:/;
        for (const f of files) assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), shadcn, f);
    });
});

describe('master logo', () => {
    const svg = fs.readFileSync(MASTER_FILE, 'utf8');

    it('carries roles, never colours', () => {
        assert.doesNotMatch(svg, /#[0-9a-f]{3,8}\b|\bfill=|rgb\(|style=/i);
        const roles = new Set(Object.keys(tokens.logo).filter((k) => !k.startsWith('$')));
        for (const m of svg.matchAll(/class="logo-([a-z0-9-]+)"/g)) assert.ok(roles.has(m[1]), `unknown role ${m[1]}`);
    });

    it('has the three parts every variant is built from', () => {
        assert.deepEqual(Object.keys(master.groups).sort(), ['icon', 'letters', 'wordmark']);
    });

    it('lays out the horizontal lockup inside its box', () => {
        const [, , w, h] = variantBox(master, 'horizontal');
        const nums = variantPaths(master, 'horizontal')
            .filter((p) => p.role.startsWith('wordmark'))
            .flatMap((p) => p.d.match(/-?\d+(\.\d+)?/g).map(Number));
        assert.ok(Math.max(...nums) <= w + 0.5 && Math.min(...nums) >= -0.5, 'wordmark inside the box');
        assert.ok(w > 4 * h, 'horizontal lockup is wide');
    });

    it('scales absolute path data', () => {
        assert.equal(scalePath('M1 2H3V4Q1 1 2 2Z', 2, 10, 20), 'M12 24H16V28Q12 22 14 24Z');
    });

    it('composes every variant with resolved colours only', () => {
        const palette = logoPalette(tokens);
        for (const v of Object.keys(VARIANTS)) {
            const out = composeSvg(master, v, { palette });
            assert.doesNotMatch(out, /var\(|class=/);
            assert.match(out, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="/);
        }
    });

    it('keeps a maskable icon inside the safe circle', () => {
        const out = composeSvg(master, 'icon', { palette: logoPalette(tokens), canvas: [512, 512], safeCircle: 0.8 });
        const [x, y, w, h] = out.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
        const [, , bw, bh] = variantBox(master, 'icon');
        const scale = 512 / w;
        assert.ok(Math.hypot(bw, bh) * scale <= 0.8 * 512 + 0.01);
        assert.ok(Math.abs(x + w / 2 - bw / 2) < 0.01 && Math.abs(y + h / 2 - bh / 2) < 0.01, 'centred');
    });
});

describe('ICO encoder', () => {
    it('round-trips PNG entries', () => {
        const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('data')]);
        const ico = encodeIco([
            { size: 16, png },
            { size: 256, png },
        ]);
        assert.deepEqual(decodeIco(ico).map((e) => [e.size, e.png.equals(png)]), [
            [16, true],
            [256, true],
        ]);
    });

    it('rejects non-PNG payloads', () => {
        assert.throws(() => encodeIco([{ size: 16, png: Buffer.from('nope') }]), /PNG/);
    });

    it('shipped favicon.ico holds one PNG per declared size, each of that size', () => {
        const spec = ASSETS.find((a) => a.kind === 'ico');
        const file = path.join(ROOT, 'web_client', 'public', ...spec.url.split('/').filter(Boolean));
        const entries = decodeIco(fs.readFileSync(file));
        assert.deepEqual(entries.map((e) => e.size), spec.sizes);
        for (const { size, png } of entries) {
            // PNG IHDR: width / height are big-endian uint32 at offsets 16 / 20.
            assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [size, size]);
        }
    });
});

describe('generated code', () => {
    it('is up to date with the tokens', () => {
        for (const [file, content] of renderAll(tokens)) assert.ok(sameText(fs.readFileSync(file, 'utf8'), content), file);
    });
});
