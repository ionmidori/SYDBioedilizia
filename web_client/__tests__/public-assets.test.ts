import fs from 'fs';
import path from 'path';
import { BLOG_LOGO_URL } from '@/lib/blog/seo';

/**
 * Guards for static assets served as-is (no next/image optimisation).
 *
 * The manifest used to declare `/syd-logo-v2.png` as `image/png`, `sizes: any`,
 * while the file was a 1024px JPEG: PWA tooling validates icons by their real
 * bytes and size. These checks read the files themselves, so the declared type
 * and dimensions cannot drift from what is actually shipped.
 */

const publicDir = path.resolve(__dirname, '..', 'public');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngSize(file: string): { width: number; height: number } | null {
    const buf = fs.readFileSync(file);
    if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
    // IHDR is the first chunk: width/height are big-endian uint32 at offsets 16/20.
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

type ManifestIcon = { src: string; sizes: string; type: string; purpose?: string };

const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8')) as {
    icons: ManifestIcon[];
};

describe('web app manifest icons', () => {
    it('provides the 192px and 512px icons required for installability', () => {
        const sizes = manifest.icons.map((icon) => icon.sizes);
        expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    });

    it('provides a maskable icon so Android does not shrink the logo into a white disc', () => {
        const maskable = manifest.icons.filter((icon) => icon.purpose === 'maskable');
        expect(maskable.map((icon) => icon.sizes)).toContain('512x512');
    });

    it.each(manifest.icons.map((icon) => [icon.src, icon] as const))(
        '%s exists, is a real PNG and matches its declared size',
        (_src, icon) => {
            const file = path.join(publicDir, icon.src);
            expect(fs.existsSync(file)).toBe(true);
            expect(icon.type).toBe('image/png');

            const size = pngSize(file);
            expect(size).not.toBeNull();
            expect(`${size!.width}x${size!.height}`).toBe(icon.sizes);
        }
    );
});

describe('public/ hygiene', () => {
    it('ships no file whose PNG extension hides other content', () => {
        const pngs: string[] = [];
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (entry.name.toLowerCase().endsWith('.png')) pngs.push(full);
            }
        };
        walk(publicDir);

        const mislabelled = pngs
            .filter((file) => pngSize(file) === null)
            .map((file) => path.relative(publicDir, file));

        expect(mislabelled).toEqual([]);
    });
});

describe('structured-data logo', () => {
    it('points to a real PNG of at least 112px shipped in public/', () => {
        // Google requires >= 112x112 for Organization/publisher logos.
        const file = path.join(publicDir, new URL(BLOG_LOGO_URL).pathname);
        const size = pngSize(file);
        expect(size).not.toBeNull();
        expect(size!.width).toBeGreaterThanOrEqual(112);
        expect(size!.height).toBeGreaterThanOrEqual(112);
    });
});
