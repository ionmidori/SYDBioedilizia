/**
 * Read the payload of the Firebase ID token stored in the `auth-token` cookie.
 *
 * ⚠️ NOT a security check: the signature is not verified here (the proxy runs
 * on every navigation and cannot call Firebase). It only decides early
 * redirects for a better UX. Every admin capability is enforced by the backend
 * (`require_admin`, Firebase Admin SDK verification of the same token).
 */
export type JwtClaims = Record<string, unknown>;

export function decodeJwtClaims(token: string): JwtClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded)) as unknown;
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as JwtClaims) : null;
  } catch {
    return null;
  }
}

/** True when the token is malformed or expired (10 s clock-skew tolerance). */
export function isTokenExpired(token: string, nowSeconds: number = Date.now() / 1000): boolean {
  const claims = decodeJwtClaims(token);
  if (!claims || typeof claims.exp !== 'number') return true;
  return nowSeconds > claims.exp + 10;
}

/** UX hint only: does the (unverified) token carry the admin role claim? */
export function hasAdminRoleClaim(token: string): boolean {
  return decodeJwtClaims(token)?.role === 'admin';
}
