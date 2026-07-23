import fs from 'fs';
import { getAllBlogPosts, getBlogPostBySlug, getBlogSlugs } from '../blog';

jest.mock('fs');

const mockReaddirSync = fs.readdirSync as jest.Mock;
const mockReadFileSync = fs.readFileSync as jest.Mock;

function post(frontmatter: string, body = 'Contenuto.'): string {
    return `---\n${frontmatter}\n---\n\n${body}`;
}

beforeEach(() => {
    mockReaddirSync.mockReset();
    mockReadFileSync.mockReset();
});

describe('getBlogSlugs', () => {
    it('lists .md files stripped of their extension', () => {
        mockReaddirSync.mockReturnValue(['a.md', 'b.md', 'notes.txt', '.gitkeep']);
        expect(getBlogSlugs()).toEqual(['a', 'b']);
    });

    it('returns an empty list when the directory is unreadable', () => {
        mockReaddirSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        expect(getBlogSlugs()).toEqual([]);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});

describe('getBlogPostBySlug', () => {
    it('parses frontmatter and content', () => {
        mockReadFileSync.mockReturnValue(
            post(
                'title: Bonus ristrutturazione\ndescription: Guida 2026\nauthor: SYD\ndatePublished: "2026-01-15"'
            )
        );

        const result = getBlogPostBySlug('bonus');

        expect(result).toMatchObject({
            slug: 'bonus',
            title: 'Bonus ristrutturazione',
            description: 'Guida 2026',
            author: 'SYD',
            datePublished: '2026-01-15',
        });
        expect(result?.content.trim()).toBe('Contenuto.');
    });

    it('fills defaults for missing frontmatter fields', () => {
        mockReadFileSync.mockReturnValue(post('image: /img/x.png'));

        const result = getBlogPostBySlug('minimal');

        expect(result?.title).toBe('Senza titolo');
        expect(result?.author).toBe('Team Ristrutturazioni');
        expect(result?.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(result?.image).toBe('/img/x.png');
    });

    it('returns null when the file does not exist', () => {
        mockReadFileSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        expect(getBlogPostBySlug('missing')).toBeNull();
        errorSpy.mockRestore();
    });
});

describe('getAllBlogPosts', () => {
    it('sorts posts newest first and drops unreadable ones', () => {
        mockReaddirSync.mockReturnValue(['old.md', 'new.md', 'broken.md']);
        mockReadFileSync.mockImplementation((fullPath: string) => {
            if (fullPath.includes('old')) return post('title: Old\ndatePublished: "2025-01-01"');
            if (fullPath.includes('new')) return post('title: New\ndatePublished: "2026-06-01"');
            throw new Error('corrupted');
        });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const posts = getAllBlogPosts();

        expect(posts.map((p) => p.title)).toEqual(['New', 'Old']);
        errorSpy.mockRestore();
    });
});
