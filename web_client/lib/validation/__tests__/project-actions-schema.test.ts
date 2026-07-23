import {
    createProjectSchema,
    leadSchema,
    renameProjectSchema,
} from '../project-actions-schema';

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

describe('leadSchema', () => {
    const valid = {
        name: 'Mario Rossi',
        email: 'mario@example.com',
        contact: '+39 333 1234567',
        scope: 'Ristrutturazione completa del bagno di 6mq',
    };

    it('accepts a complete lead without the honeypot field', () => {
        expect(leadSchema.safeParse(valid).success).toBe(true);
    });

    it('accepts an empty honeypot field', () => {
        expect(leadSchema.safeParse({ ...valid, website: '' }).success).toBe(true);
    });

    it('rejects a filled honeypot field (bot detection)', () => {
        expect(leadSchema.safeParse({ ...valid, website: 'http://spam.example' }).success).toBe(
            false
        );
    });

    it.each([
        ['a one-letter name', { name: 'M' }],
        ['an invalid email', { email: 'not-an-email' }],
        ['a too-short contact', { contact: '123' }],
        ['a too-short scope', { scope: 'ciao' }],
        ['a scope over 2000 chars', { scope: 'a'.repeat(2001) }],
        ['HTML in the name (XSS guard)', { name: 'Mario <img src=x>' }],
        ['HTML in the scope (XSS guard)', { scope: `${'a'.repeat(20)}<script>` }],
    ])('rejects %s', (_label, override) => {
        expect(leadSchema.safeParse({ ...valid, ...override }).success).toBe(false);
    });
});
