import fs from 'fs';
import path from 'path';
import { BLOG_POSTS } from '../blog-posts';

// BLOG_POSTS feeds /blog and sitemap.xml; each entry must match a static
// article page in app/blog/<id>/page.tsx, or the sitemap lists a 404.
const blogDir = path.join(__dirname, '../../app/blog');

const articleDirs = fs
    .readdirSync(blogDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

describe('BLOG_POSTS', () => {
    it('has exactly one entry per article page', () => {
        const ids = BLOG_POSTS.map((post) => post.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect([...ids].sort()).toEqual([...articleDirs].sort());
    });

    it.each(BLOG_POSTS.map((post) => [post.id, post.datePublished]))(
        '%s: datePublished matches the article JSON-LD',
        (id, datePublished) => {
            const page = fs.readFileSync(path.join(blogDir, id, 'page.tsx'), 'utf8');
            expect(datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(page).toContain(`"datePublished": "${datePublished}"`);
        },
    );
});
