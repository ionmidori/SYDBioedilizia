// node --test scripts/theme/migrate.test.mjs
// The engine is tested with fixture rules; the real rules.json only with property tests.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { RULES_FILE, compileRules, loadRules, loadVocabulary, migrateClass, migrateSource, colorPatterns } from './migrate.mjs';

const vocab = {
    roles: ['canvas', 'ink', 'ink-muted', 'primary', 'primary-hover', 'primary-ink', 'accent', 'danger', 'danger-ink', 'danger-subtle'],
    textRoles: ['ink', 'ink-muted', 'primary-ink', 'danger-ink'],
};
const fixture = {
    utilities: ['bg', 'text', 'border', 'ring-offset', 'ring', 'placeholder'],
    textUtilities: ['text', 'placeholder'],
    colors: { site: ['site-text', 'site-bg', 'site-teal'], neutral: ['white'] },
    families: { danger: ['red'] },
    rules: [
        { match: { utility: ['text'], color: ['site-text'], opacity: [80, 100] }, to: { role: 'ink' } },
        { match: { utility: ['text'], color: ['site-text'], opacity: [0, 79] }, to: { role: 'ink-muted' } },
        { match: { utility: ['bg'], color: ['site-bg'] }, to: { role: 'canvas', keepOpacity: true } },
        { match: { utility: ['bg'], color: ['site-teal'], opacity: [85, 94] }, to: { role: 'primary-hover' } },
        { match: { utility: ['bg'], color: ['site-teal'] }, to: { role: 'primary' } },
        { match: { utility: ['ring-offset', 'ring'], color: ['site-teal'] }, to: { drop: true } },
        { match: { family: ['danger'], shade: [50, 200] }, to: { byUtility: { bg: '<family>-subtle' } } },
        { match: { family: ['danger'] }, to: { byUtility: { text: '<family>-ink', bg: '<family>' } } },
        { match: { utility: ['text', 'border'], color: ['site-teal'] }, to: { role: 'primary', byUtility: { text: 'primary-ink' } } },
        { match: { group: ['neutral'] }, to: { ambiguous: 'depends on the background' } },
    ],
};
const rules = compileRules(fixture, vocab);
const to = (cls) => migrateClass(cls, rules).to;

describe('engine', () => {
    it('parses variants, utility, color, shade and opacity', () => {
        assert.deepEqual(migrateClass('md:hover:!bg-red-500/40', rules).parsed, {
            variants: 'md:hover:',
            important: '!',
            utility: 'bg',
            color: 'red',
            shade: 500,
            opacity: 40,
        });
        assert.equal(migrateClass('text-sm', rules).status, 'none');
        assert.equal(migrateClass('text-ink', rules).status, 'none');
    });

    it('applies the first matching rule and keeps variants', () => {
        assert.equal(to('hover:text-site-text'), 'hover:text-ink');
        assert.equal(to('data-[state=open]:bg-site-teal'), 'data-[state=open]:bg-primary');
    });

    it('matches opacity and shade ranges (no opacity counts as 100)', () => {
        assert.equal(to('text-site-text/80'), 'text-ink');
        assert.equal(to('text-site-text/60'), 'text-ink-muted');
        assert.equal(to('bg-site-teal/90'), 'bg-primary-hover');
        assert.equal(to('bg-red-100'), 'bg-danger-subtle');
        assert.equal(to('bg-red-600'), 'bg-danger');
    });

    it('keeps the opacity only when the rule says so', () => {
        assert.equal(to('bg-site-bg/80'), 'bg-canvas/80');
        assert.equal(to('text-site-text/90'), 'text-ink');
    });

    it('byUtility picks the role per utility, resolving <family>', () => {
        assert.equal(to('text-red-400'), 'text-danger-ink');
        const border = migrateClass('border-red-500', rules);
        assert.equal(border.status, 'unmapped');
    });

    it('byUtility falls back to the rule role for the other utilities', () => {
        assert.equal(to('text-site-teal'), 'text-primary-ink');
        assert.equal(to('border-site-teal'), 'border-primary');
    });

    it('reports a text utility on a non-text role as misuse', () => {
        const out = migrateSource('a("text-primary text-ink placeholder-accent hover:text-primary-ink text-primary/50")', rules);
        assert.deepEqual(
            out.findings.filter((f) => f.status === 'misuse').map((f) => f.from),
            ['text-primary', 'placeholder-accent', 'text-primary/50'],
        );
    });

    it('drops a class when the rule says so', () => {
        assert.deepEqual([migrateClass('ring-site-teal', rules).status, to('ring-site-teal')], ['dropped', '']);
        assert.equal(to('ring-offset-site-teal'), '', 'longest utility prefix wins');
    });

    it('reports ambiguous classes with their reason and never rewrites them', () => {
        const r = migrateClass('text-white', rules);
        assert.deepEqual([r.status, r.to, r.reason], ['ambiguous', undefined, 'depends on the background']);
    });

    it('does not touch substrings', () => {
        const src = 'const a = "my-text-site-text text-site-text-x xtext-site-text";';
        assert.equal(migrateSource(src, rules).text, src);
    });

    it('rewrites inside cn()/cva() strings, template literals and @apply', () => {
        const src = [
            'cn("p-2 hover:bg-site-teal/90", ok && `text-site-text/60`)',
            'const v = cva("bg-site-teal ring-site-teal text-white")',
            '.x { @apply bg-site-bg text-site-text; }',
        ].join('\n');
        const out = migrateSource(src, rules);
        assert.equal(
            out.text,
            ['cn("p-2 hover:bg-primary-hover", ok && `text-ink-muted`)', 'const v = cva("bg-primary text-white")', '.x { @apply bg-canvas text-ink; }'].join('\n'),
        );
        assert.deepEqual(
            out.findings.filter((f) => f.status === 'ambiguous').map((f) => [f.line, f.from, f.reason]),
            [[2, 'text-white', 'depends on the background']],
        );
    });

    it('is idempotent', () => {
        const once = migrateSource('a("bg-site-teal/90 text-site-text/60 bg-red-50")', rules).text;
        assert.equal(migrateSource(once, rules).text, once);
    });

    it('groups recurring colour-class combinations', () => {
        const src = 'a("p-2 bg-site-teal text-white")\nb("bg-site-teal m-1 text-white")\nc("text-white")';
        assert.deepEqual(colorPatterns([['f.tsx', src]], rules, 2), [{ classes: ['bg-site-teal', 'text-white'], count: 2, files: ['f.tsx'] }]);
    });
});

describe('rule validation', () => {
    const withRule = (rule) => ({ ...fixture, rules: [rule] });

    it('rejects a rule whose target role is unknown', () => {
        assert.throws(() => compileRules(withRule({ match: { color: ['site-bg'] }, to: { role: 'nope' } }), vocab), /nope/);
        assert.throws(() => compileRules(withRule({ match: { family: ['danger'] }, to: { byUtility: { text: '<family>-nope' } } }), vocab), /danger-nope/);
    });

    it('rejects a rule that would put opacity on a textRole', () => {
        assert.throws(
            () => compileRules(withRule({ match: { utility: ['text'], color: ['site-text'] }, to: { role: 'ink', keepOpacity: true } }), vocab),
            /opacity.*ink/,
        );
    });

    it('rejects a <family> target on a rule that does not match a family', () => {
        assert.throws(() => compileRules(withRule({ match: { utility: ['text'] }, to: { byUtility: { text: '<family>-ink' } } }), vocab), /<family>.*family/);
    });

    it('rejects a rule matching an unknown colour, group or family', () => {
        assert.throws(() => compileRules(withRule({ match: { color: ['mauve'] }, to: { drop: true } }), vocab), /mauve/);
        assert.throws(() => compileRules(withRule({ match: { group: ['x'] }, to: { drop: true } }), vocab), /x/);
    });
});

describe('rules.json', () => {
    const real = loadRules();
    const { roles } = loadVocabulary();

    it('every target role exists in the generated roles.json', () => {
        // compileRules validates; loading without throwing is the property. Spot-check the raw file too.
        const raw = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
        for (const r of raw.rules) for (const role of [r.to.role, ...Object.values(r.to.byUtility ?? {})].filter(Boolean)) {
            if (!role.includes('<family>')) assert.ok(roles.includes(role), role);
        }
        assert.ok(real.rules.length > 0);
    });

    for (const [from, expected] of [
        ['hover:bg-luxury-teal/90 md:text-luxury-text/60', 'hover:bg-primary-hover md:text-ink-muted'],
        ['text-luxury-gold bg-luxury-gold/10 border-luxury-gold/20', 'text-accent-ink bg-accent-subtle border-line'],
        ['bg-luxury-bg/80 text-luxury-text/30', 'bg-canvas/80 text-ink-subtle'],
        ['text-red-400 bg-red-500/10 border-red-500/30', 'text-danger-ink bg-danger-subtle border-danger/30'],
        ['text-amber-400 text-emerald-400 text-sky-400', 'text-warning-ink text-success-ink text-info-ink'],
        ['bg-background text-muted-foreground border-input', 'bg-canvas text-ink-muted border-line-strong'],
    ]) {
        it(`maps "${from}"`, () => assert.equal(migrateSource(`"${from}"`, real).text, `"${expected}"`));
    }

    it('leaves the neutral palette to a human (ambiguous)', () => {
        for (const c of ['text-white', 'bg-white/5', 'border-white/10', 'bg-black/60', 'text-slate-400']) {
            assert.equal(migrateClass(c, real).status, 'ambiguous', c);
        }
    });
});
