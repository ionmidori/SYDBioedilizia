import { profileUpdateSchema, userPreferencesSchema } from '../profile-schema';

describe('profileUpdateSchema', () => {
    it('accepts a plain Italian display name with accents', () => {
        expect(profileUpdateSchema.safeParse({ displayName: 'Niccolò D\'Angelo' }).success).toBe(true);
    });

    it('accepts an empty object — both fields are optional', () => {
        expect(profileUpdateSchema.safeParse({}).success).toBe(true);
    });

    it.each([
        ['a single character', 'A'],
        ['more than 50 characters', 'a'.repeat(51)],
        ['digits', 'Mario 2'],
        ['HTML tags', '<b>Mario</b>'],
    ])('rejects a displayName with %s', (_label, displayName) => {
        expect(profileUpdateSchema.safeParse({ displayName }).success).toBe(false);
    });

    it('rejects a malformed photoURL', () => {
        expect(profileUpdateSchema.safeParse({ photoURL: 'not-a-url' }).success).toBe(false);
    });

    it('accepts a valid photoURL', () => {
        expect(
            profileUpdateSchema.safeParse({ photoURL: 'https://example.com/me.png' }).success
        ).toBe(true);
    });
});

describe('userPreferencesSchema', () => {
    it('fills every default from an empty object', () => {
        const result = userPreferencesSchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.notifications).toEqual({ email: true, quoteReady: true });
            expect(result.data.ui).toBeUndefined();
        }
    });

    it('defaults sidebarCollapsed inside a provided ui object', () => {
        const result = userPreferencesSchema.safeParse({ ui: { theme: 'dark' } });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.ui).toEqual({ theme: 'dark', sidebarCollapsed: false });
        }
    });

    it('rejects an unknown theme', () => {
        expect(userPreferencesSchema.safeParse({ ui: { theme: 'sepia' } }).success).toBe(false);
    });

    it('rejects a non-boolean notification flag', () => {
        expect(
            userPreferencesSchema.safeParse({ notifications: { email: 'yes', quoteReady: true } })
                .success
        ).toBe(false);
    });
});
