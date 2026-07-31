import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import semver from 'semver';

/**
 * Regression guard for the ERR_REQUIRE_ESM production crash (Phase 107).
 *
 * `firebase-admin` -> `jwks-rsa@4` -> `jose@6`. jwks-rsa does a plain CommonJS
 * `require('jose')`, but jose 6 is pure ESM ("type": "module", no CJS build).
 * That require only works on Node versions with `require(esm)` support
 * (^20.19 || ^22.12 || >=23) — which is exactly what jwks-rsa declares in its
 * own `engines`.
 *
 * The repo declared no `engines.node` at all, so Vercel deployed on whatever
 * major was pinned in the project settings — an older one — and every Server
 * Action that verified a Firebase ID token crashed at module-load time with
 * ERR_REQUIRE_ESM. It was invisible locally because dev runs Node 24.
 *
 * These tests pin the invariant: our declared Node version must satisfy the
 * `engines.node` of every installed dependency that declares one.
 */

const webClientDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webClientDir, '..');

function readJson(file: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Lowest concrete version matching a Vercel-style major range like "24.x". */
function floorOf(range: string): string {
    const coerced = semver.coerce(range);
    if (!coerced) throw new Error(`Cannot interpret engines.node range: ${range}`);
    return coerced.version;
}

describe('declared Node.js engine', () => {
    const declared = ['package.json', 'web_client/package.json'].map((rel) => {
        const pkg = readJson(path.join(repoRoot, rel)) as { engines?: { node?: string } };
        return { rel, node: pkg.engines?.node };
    });

    it.each(declared)('$rel declares engines.node', ({ node }) => {
        // Without this, Vercel silently falls back to the project-settings major.
        expect(node).toBeDefined();
    });

    it('declares the same Node major in the monorepo root and in web_client', () => {
        const [root, web] = declared;
        expect(web.node).toBe(root.node);
    });

    it.each(declared)('$rel satisfies the engines of every installed dependency', ({ node }) => {
        const ours = floorOf(node as string);
        const modulesDir = path.join(repoRoot, 'node_modules');
        const offenders: string[] = [];

        for (const entry of fs.readdirSync(modulesDir)) {
            if (entry.startsWith('.')) continue;
            // Scoped packages nest one level deeper (@scope/name).
            const candidates = entry.startsWith('@')
                ? fs.readdirSync(path.join(modulesDir, entry)).map((n) => path.join(entry, n))
                : [entry];

            for (const name of candidates) {
                const manifest = path.join(modulesDir, name, 'package.json');
                if (!fs.existsSync(manifest)) continue;
                let required: string | undefined;
                try {
                    required = (readJson(manifest) as { engines?: { node?: string } }).engines?.node;
                } catch {
                    continue; // unreadable/!JSON manifest — not our concern here
                }
                if (!required || !semver.validRange(required)) continue;
                if (!semver.satisfies(ours, required)) {
                    offenders.push(`${name} requires node ${required}`);
                }
            }
        }

        expect(offenders).toEqual([]);
    });

    it('runs on a Node version that supports require() of an ESM-only module', () => {
        // The exact interop jwks-rsa depends on. Guards local/CI parity with
        // the deployed runtime.
        expect(semver.satisfies(process.version, '^20.19 || ^22.12 || >=23')).toBe(true);
    });

    it('can require() jose from CommonJS the way jwks-rsa does', () => {
        // Must run in a real Node process: inside Jest, `require` is Jest's own
        // module runtime, which cannot parse ESM and would fail regardless of
        // the Node version — telling us nothing about the production runtime.
        expect(() =>
            execFileSync(process.execPath, ['-e', "require('jose')"], {
                cwd: repoRoot,
                stdio: 'pipe',
            })
        ).not.toThrow();
    });
});
