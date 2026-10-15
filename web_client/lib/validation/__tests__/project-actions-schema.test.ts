import { createProjectSchema, renameProjectSchema } from '../project-actions-schema';

describe('createProjectSchema', () => {
    it('accepts a normal title', () => {
        expect(createProjectSchema.safeParse({ title: 'Bagno padronale' }).success).toBe(true);
    });

    it.each([
        ['shorter than 3 chars', 'ab'],
        ['longer than 50 chars', 'a'.repeat(51)],
        ['containing an HTML tag (XSS guard)', 'Bagno <script>alert(1)</script>'],
    ])('rejects a title %s', (_label, title) => {
        expect(createProjectSchema.safeParse({ title }).success).toBe(false);
    });

    it('renameProjectSchema shares the same rules', () => {
        expect(renameProjectSchema.safeParse({ title: 'ab' }).success).toBe(false);
        expect(renameProjectSchema.safeParse({ title: 'Cucina' }).success).toBe(true);
    });
});
