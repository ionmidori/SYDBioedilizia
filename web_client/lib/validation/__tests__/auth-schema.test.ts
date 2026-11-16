import {
    PASSWORD_MIN_LENGTH,
    changePasswordSchema,
    getPasswordChecks,
    resetPasswordConfirmSchema,
    resetPasswordSchema,
    setPasswordSchema,
    signinSchema,
    signupSchema,
} from '../auth-schema';

const VALID_PASSWORD = 'Password1!x';
const EMAIL = 'user@example.com';

describe('signupSchema — email', () => {
    it('accepts a well-formed address', () => {
        expect(
            signupSchema.safeParse({ email: EMAIL, password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD }).success,
        ).toBe(true);
    });

    it.each(['not-an-email', 'user@', '@example.com', ''])('rejects %p', (email) => {
        expect(
            signupSchema.safeParse({ email, password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD }).success,
        ).toBe(false);
    });

    it('rejects an address longer than 320 chars', () => {
        const email = `${'a'.repeat(320)}@example.com`;
        expect(
            signupSchema.safeParse({ email, password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD }).success,
        ).toBe(false);
    });

    it('rejects HTML tags (XSS guard)', () => {
        expect(
            signupSchema.safeParse({
                email: '<script>@example.com',
                password: VALID_PASSWORD,
                confirmPassword: VALID_PASSWORD,
            }).success,
        ).toBe(false);
    });
});

describe('signupSchema — password strength (letters, numbers, symbols)', () => {
    it('requires at least 10 characters (mirrors the Firebase password policy)', () => {
        expect(PASSWORD_MIN_LENGTH).toBe(10);
    });

    it('accepts a password meeting every rule', () => {
        expect(
            signupSchema.safeParse({ email: EMAIL, password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD }).success,
        ).toBe(true);
    });

    it.each([
        ['shorter than 10 chars', 'Passw0rd!', 'almeno 10 caratteri'],
        ['no lowercase letter', 'PASSWORD1!XY', 'lettera minuscola'],
        ['no uppercase letter', 'password1!xy', 'lettera maiuscola'],
        ['no digit', 'Password!!xy', 'numero'],
        ['no symbol', 'Password11xy', 'simbolo'],
        ['longer than 100 chars', `Aa1!${'a'.repeat(100)}`, 'troppo lunga'],
    ])('rejects a password %s with an Italian message', (_label, password, fragment) => {
        const result = signupSchema.safeParse({ email: EMAIL, password, confirmPassword: password });
        expect(result.success).toBe(false);
        if (!result.success) {
            const messages = result.error.issues.map((i) => i.message).join(' | ');
            expect(messages).toContain(fragment);
        }
    });
});

describe('signupSchema — password confirmation', () => {
    it('rejects when the confirmation differs, flagging confirmPassword', () => {
        const result = signupSchema.safeParse({
            email: EMAIL,
            password: VALID_PASSWORD,
            confirmPassword: `${VALID_PASSWORD}z`,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            const issue = result.error.issues.find((i) => i.path[0] === 'confirmPassword');
            expect(issue?.message).toBe('Le password non coincidono.');
        }
    });

    it('rejects an empty confirmation', () => {
        const result = signupSchema.safeParse({ email: EMAIL, password: VALID_PASSWORD, confirmPassword: '' });
        expect(result.success).toBe(false);
    });

    it('is case-sensitive and does not trim', () => {
        expect(
            signupSchema.safeParse({
                email: EMAIL,
                password: VALID_PASSWORD,
                confirmPassword: VALID_PASSWORD.toLowerCase(),
            }).success,
        ).toBe(false);
        expect(
            signupSchema.safeParse({
                email: EMAIL,
                password: VALID_PASSWORD,
                confirmPassword: ` ${VALID_PASSWORD}`,
            }).success,
        ).toBe(false);
    });
});

describe('signinSchema', () => {
    it('does NOT apply strength rules: accounts created under older policies can still sign in', () => {
        expect(signinSchema.safeParse({ email: EMAIL, password: 'abc123' }).success).toBe(true);
    });

    it('requires a non-empty password', () => {
        const result = signinSchema.safeParse({ email: EMAIL, password: '' });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0].message).toBe('Inserisci la password.');
    });

    it('requires a valid email', () => {
        expect(signinSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
    });
});

describe('resetPasswordSchema', () => {
    it('validates on email alone', () => {
        expect(resetPasswordSchema.safeParse({ email: EMAIL }).success).toBe(true);
    });

    it('drops any extra field', () => {
        const result = resetPasswordSchema.safeParse({ email: EMAIL, password: VALID_PASSWORD });
        expect(result.success).toBe(true);
        if (result.success) expect('password' in result.data).toBe(false);
    });

    it('rejects an invalid email', () => {
        expect(resetPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
    });
});

describe('getPasswordChecks (live checklist)', () => {
    it('reports each rule independently', () => {
        expect(getPasswordChecks('abc')).toEqual({
            length: false,
            lowercase: true,
            uppercase: false,
            number: false,
            symbol: false,
        });
        expect(Object.values(getPasswordChecks(VALID_PASSWORD)).every(Boolean)).toBe(true);
    });

    it('counts any non-alphanumeric character as a symbol (including spaces and accents)', () => {
        expect(getPasswordChecks('à').symbol).toBe(true);
        expect(getPasswordChecks('a b').symbol).toBe(true);
    });
});

describe('resetPasswordConfirmSchema', () => {
    it('requires strong password typed twice and matching', () => {
        expect(resetPasswordConfirmSchema.safeParse({ password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD }).success).toBe(true);
        expect(resetPasswordConfirmSchema.safeParse({ password: 'weak', confirmPassword: 'weak' }).success).toBe(false);
        const mismatch = resetPasswordConfirmSchema.safeParse({ password: VALID_PASSWORD, confirmPassword: `${VALID_PASSWORD}z` });
        expect(mismatch.success).toBe(false);
    });
});

describe('changePasswordSchema', () => {
    it('accepts valid current and confirmed strong new password', () => {
        expect(
            changePasswordSchema.safeParse({
                currentPassword: 'OldPassword1!',
                newPassword: VALID_PASSWORD,
                confirmPassword: VALID_PASSWORD,
            }).success,
        ).toBe(true);
    });

    it('rejects empty current password', () => {
        const res = changePasswordSchema.safeParse({
            currentPassword: '',
            newPassword: VALID_PASSWORD,
            confirmPassword: VALID_PASSWORD,
        });
        expect(res.success).toBe(false);
    });

    it('rejects when newPassword equals currentPassword', () => {
        const res = changePasswordSchema.safeParse({
            currentPassword: VALID_PASSWORD,
            newPassword: VALID_PASSWORD,
            confirmPassword: VALID_PASSWORD,
        });
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.issues[0].message).toContain('diversa');
        }
    });

    it('rejects when confirmPassword differs', () => {
        const res = changePasswordSchema.safeParse({
            currentPassword: 'OldPassword1!',
            newPassword: VALID_PASSWORD,
            confirmPassword: `${VALID_PASSWORD}z`,
        });
        expect(res.success).toBe(false);
    });
});

describe('setPasswordSchema', () => {
    it('validates new strong password typed twice', () => {
        expect(setPasswordSchema.safeParse({ newPassword: VALID_PASSWORD, confirmPassword: VALID_PASSWORD }).success).toBe(true);
        expect(setPasswordSchema.safeParse({ newPassword: VALID_PASSWORD, confirmPassword: 'other' }).success).toBe(false);
    });
});
