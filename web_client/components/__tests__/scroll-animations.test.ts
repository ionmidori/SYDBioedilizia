import { readFileSync } from 'fs';
import path from 'path';

// JSDOM cannot run scroll timelines, so the stylesheet's two guarantees are
// checked on its source: nothing animates without browser support or against a
// reduced-motion preference, and nothing animates off the compositor thread.
const source = readFileSync(path.join(__dirname, '../../app/scroll-animations.css'), 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
const firstKeyframes = code.indexOf('@keyframes');
const rules = code.slice(0, firstKeyframes);
const keyframes = code.slice(firstKeyframes);

describe('scroll-animations.css', () => {
    it('registers every scroll-linked rule behind the support and reduced-motion gates', () => {
        expect(firstKeyframes).toBeGreaterThan(0);
        expect(rules.trimStart().startsWith('@supports (animation-timeline: view())')).toBe(true);
        expect(rules).toContain('@media (prefers-reduced-motion: no-preference)');

        // The gate is the whole rule section: its braces close exactly at its end,
        // so no selector can sit outside it and animate unconditionally.
        let depth = 0;
        let closedAt = -1;
        for (let i = 0; i < rules.length; i++) {
            if (rules[i] === '{') depth++;
            if (rules[i] === '}' && --depth === 0) {
                closedAt = i;
                break;
            }
        }
        expect(rules.slice(closedAt + 1).trim()).toBe('');

        // And the keyframes section only declares keyframes.
        expect(keyframes).not.toMatch(/animation(-name|-timeline|-range)?\s*:/);
    });

    it('animates only compositor-friendly properties', () => {
        const declared = new Set(
            Array.from(keyframes.matchAll(/([a-z-]+)\s*:/g), (match) => match[1]),
        );

        // No filter, no layout properties: those repaint or relayout every frame.
        const allowed = new Set(['translate', 'rotate', 'scale', 'opacity', 'animation-timing-function']);
        declared.forEach((property) => expect(allowed).toContain(property));
    });
});
