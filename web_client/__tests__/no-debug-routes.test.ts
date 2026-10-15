import fs from 'fs';
import path from 'path';

/**
 * Regression guard: no debug/test routes anywhere under `app/`.
 *
 * `app/api/debug/logs` read the Next dev log from disk and returned it together
 * with its absolute path. It was gated on NODE_ENV only, had no callers, and
 * `proxy.ts` does not run on `/api` — so nothing but that one check stood
 * between a misconfigured deployment and a log/path disclosure. It was removed;
 * this test keeps a `debug`/`test` route segment from coming back unnoticed.
 *
 * Route Handlers and pages can live at any depth of `app/`, and route groups
 * such as `(debug)` do not appear in the URL but still mark intent, so both
 * plain and grouped segments are checked. `__tests__` folders are not routes.
 */

const appDir = path.resolve(__dirname, '..', 'app');
const FORBIDDEN = new Set(['debug', 'test', 'tests', '_debug', '__debug']);

function routeDirs(dir: string): string[] {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== '__tests__')
        .flatMap((entry) => {
            const full = path.join(dir, entry.name);
            return [full, ...routeDirs(full)];
        });
}

export function isForbiddenSegment(name: string): boolean {
    // `(debug)` route group -> `debug`; `[debug]` is a dynamic param, not a literal.
    const bare = name.replace(/^\((.*)\)$/, '$1').toLowerCase();
    return FORBIDDEN.has(bare);
}

describe('app/ route segments', () => {
    it('contains no debug or test routes', () => {
        const offending = routeDirs(appDir)
            .filter((dir) => isForbiddenSegment(path.basename(dir)))
            .map((dir) => path.relative(appDir, dir));

        expect(offending).toEqual([]);
    });

    it('recognises plain and grouped segments', () => {
        expect(isForbiddenSegment('debug')).toBe(true);
        expect(isForbiddenSegment('(debug)')).toBe(true);
        expect(isForbiddenSegment('Test')).toBe(true);
        expect(isForbiddenSegment('testimonials')).toBe(false);
        expect(isForbiddenSegment('__tests__')).toBe(false);
    });
});
