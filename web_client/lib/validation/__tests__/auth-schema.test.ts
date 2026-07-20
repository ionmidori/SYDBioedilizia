import { authSchema, magicLinkSchema, resetPasswordSchema } from '../auth-schema';

const VALID_PASSWORD = 'Password1!';

describe('authSchema — email', () => {
    it('accepts a well-formed address', () => {
        expect(authSchema.safeParse({ email: 'user@example.com' }).success).toBe(true);
    });

    it.each(['not-an-email', 'user@', '@example.com', ''])('rejects %p', (email) => {
        expect(authSchema.safeParse({ email }).success).toBe(false);
    });

    it('rejects an address longer than 320 chars', () => {
        const email = `${'a'.repeat(320)}@example.com`;
        const result = authSchema.safeParse({ email });
        expect(result.success).toBe(false);
    });

    it('rejects HTML tags (XSS guard)', () => {
        const result = authSchema.safeParse({ email: '<script>@example.com' });
        expect(result.success).toBe(false);
    });
});

describe('authSchema — password', () => {
    it('is optional: an email alone validates', () => {
        const result = authSchema.safeParse({ email: 'user@example.com' });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.password).toBeUndefined();
    });

    it('accepts a password meeting every rule', () => {
        const result = authSchema.safeParse({ email: 'user@example.com', password: VALID_PASSWORD });
        expect(result.success).toBe(true);
    });

    it.each([
        ['shorter than 8 chars', 'Ab1!'],
        ['no uppercase', 'password1!'],
        ['no digit', 'Password!'],
        ['no special char', 'Password1'],
        ['longer than 100 chars', `A1!${'a'.repeat(100)}`],
        ['containing an HTML tag', 'Password1!<b>'],
    ])('rejects a password %s', (_label, password) => {
        const result = authSchema.safeParse({ email: 'user@example.com', password });
        expect(result.success).toBe(false);
    });

    it('surfaces the Italian message for a too-short password', () => {
        const result = authSchema.safeParse({ email: 'user@example.com', password: 'Ab1!' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toContain('almeno 8 caratteri');
        }
    });
});

describe('magicLinkSchema / resetPasswordSchema', () => {
    it.each([
        ['magicLinkSchema', magicLinkSchema],
        ['resetPasswordSchema', resetPasswordSchema],
    ])('%s validates on email alone', (_label, schema) => {
        expect(schema.safeParse({ email: 'user@example.com' }).success).toBe(true);
    });

    it('magicLinkSchema drops the password field', () => {
        const result = magicLinkSchema.safeParse({ email: 'user@example.com', password: VALID_PASSWORD });
        expect(result.success).toBe(true);
        if (result.success) expect('password' in result.data).toBe(false);
    });

    it('resetPasswordSchema still rejects an invalid email', () => {
        expect(resetPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
    });
});
