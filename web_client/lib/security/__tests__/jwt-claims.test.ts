import { decodeJwtClaims, hasAdminRoleClaim, isTokenExpired } from '../jwt-claims';

function token(payload: Record<string, unknown>): string {
  const b64 = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.signature`;
}

const NOW = 1_800_000_000;

describe('jwt-claims (UX-only decoding, never a security check)', () => {
  it('decodes the payload of a well-formed token', () => {
    expect(decodeJwtClaims(token({ uid: 'u1', role: 'admin' }))).toEqual({ uid: 'u1', role: 'admin' });
  });

  it.each(['', 'abc', 'a.b', 'a.!!!.c', `x.${btoa('[1,2]')}.y`])('returns null for malformed token %p', (t) => {
    expect(decodeJwtClaims(t)).toBeNull();
  });

  it('treats malformed, exp-less and expired tokens as expired', () => {
    expect(isTokenExpired('garbage', NOW)).toBe(true);
    expect(isTokenExpired(token({ uid: 'u1' }), NOW)).toBe(true);
    expect(isTokenExpired(token({ exp: NOW - 60 }), NOW)).toBe(true);
    expect(isTokenExpired(token({ exp: NOW - 5 }), NOW)).toBe(false); // skew tolerance
    expect(isTokenExpired(token({ exp: NOW + 3600 }), NOW)).toBe(false);
  });

  it('recognises only the exact admin role claim', () => {
    expect(hasAdminRoleClaim(token({ role: 'admin' }))).toBe(true);
    expect(hasAdminRoleClaim(token({ role: 'Admin' }))).toBe(false);
    expect(hasAdminRoleClaim(token({ admin: true }))).toBe(false);
    expect(hasAdminRoleClaim('garbage')).toBe(false);
  });
});
