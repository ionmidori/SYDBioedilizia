import { mapAuthError } from '../auth-utils';

describe('mapAuthError', () => {
    it('explains the strong-password policy when Firebase rejects a weak password', () => {
        const msg = mapAuthError('auth/password-does-not-meet-requirements');
        expect(msg).toMatch(/almeno 10 caratteri/);
        expect(msg).toMatch(/maiuscol/);
        expect(msg).toMatch(/minuscol/);
        expect(msg).toMatch(/numer/);
        expect(msg).toMatch(/simbol/);
    });

    it('no longer claims that 6 characters are enough', () => {
        expect(mapAuthError('auth/weak-password')).not.toMatch(/6 caratteri/);
        expect(mapAuthError('auth/weak-password')).toMatch(/almeno 10 caratteri/);
    });

    it('does not reveal whether an email is registered at sign-in (anti-enumeration)', () => {
        const generic = mapAuthError('auth/invalid-credential');
        expect(mapAuthError('auth/user-not-found')).toBe(generic);
        expect(mapAuthError('auth/wrong-password')).toBe(generic);
    });

    it('keeps a generic fallback for unknown codes', () => {
        expect(mapAuthError('auth/nope')).toMatch(/Qualcosa è andato storto/);
    });

    it('maps auth/requires-recent-login to a clear Italian re-authentication message', () => {
        expect(mapAuthError('auth/requires-recent-login')).toMatch(/accedi nuovamente/i);
    });
});
