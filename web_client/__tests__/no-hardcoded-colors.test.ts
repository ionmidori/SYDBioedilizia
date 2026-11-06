import fs from 'fs';
import path from 'path';

/**
 * Brand colours live only in web_client/brand/tokens and reach code through the
 * generated files (app/brand-tokens.css, lib/brand/*.generated.ts). These files
 * consume the brand and must not write a colour literal of their own.
 * The light theme (PR-2) extends this list to the whole frontend.
 */
const webRoot = path.resolve(__dirname, '..');

const GUARDED = [
    'components/brand',
    'lib/brand/index.ts',
    'app/manifest.ts',
    'app/layout.tsx',
    'lib/site-share.ts',
];

const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/i;

function files(entry: string): string[] {
    const full = path.join(webRoot, entry);
    if (fs.statSync(full).isFile()) return [full];
    return fs
        .readdirSync(full, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? files(path.join(entry, e.name)) : [path.join(full, e.name)]))
        .filter((f) => /\.(ts|tsx|css)$/.test(f));
}

describe('no hard-coded colours in brand consumers', () => {
    it.each(GUARDED.flatMap(files).map((f) => [path.relative(webRoot, f).replaceAll('\\', '/'), f]))(
        '%s',
        (_rel, f) => {
            const offending = fs
                .readFileSync(f, 'utf8')
                .split('\n')
                .map((line, i) => [i + 1, line] as const)
                .filter(([, line]) => COLOR_LITERAL.test(line))
                .map(([n, line]) => `${n}: ${line.trim()}`);
            expect(offending).toEqual([]);
        }
    );
});
