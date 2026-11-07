import { execFileSync } from 'child_process';
import path from 'path';

/**
 * The logo and the colours are generated from web_client/brand/ by the scripts
 * in scripts/brand (ESM, run by plain node). Running them here puts the brand
 * pipeline in CI without a workflow of its own:
 *  - its unit tests (colour maths, tones, ICO, master, variants);
 *  - the generated code and SVGs are in sync with tokens + master;
 *  - the master still matches the original logo (pixel fidelity gate).
 */
const repoRoot = path.resolve(__dirname, '..', '..');
const run = (...args: string[]) =>
    execFileSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' });

describe('brand pipeline', () => {
    it('passes its unit tests', () => {
        expect(() => run('--test', 'scripts/brand/brand.test.mjs')).not.toThrow();
    });

    it('has a theme codemod that passes its tests, covers every colour class and finds no text on a non-text role (scripts/theme)', () => {
        expect(() => run('--test', 'scripts/theme/migrate.test.mjs')).not.toThrow();
        const report = JSON.parse(run('scripts/theme/migrate.mjs', '--report'));
        expect(report.unmapped).toEqual([]);
        expect(report.misuse).toEqual([]);
    });

    it('has generated files in sync with web_client/brand (run `npm run brand:build`)', () => {
        expect(() => run('scripts/brand/build-tokens.mjs', '--check')).not.toThrow();
        expect(() => run('scripts/brand/build-assets.mjs', '--check')).not.toThrow();
    });

    it('keeps the master logo faithful to the original artwork', () => {
        expect(run('scripts/brand/check.mjs')).toMatch(/symbol \d+\.\d+ %/);
    });
});
