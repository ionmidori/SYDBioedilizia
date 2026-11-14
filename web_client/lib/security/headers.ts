/**
 * Single source of truth for security response headers shared between `proxy.ts`
 * (middleware) and `next.config.ts` (`headers()`), plus safe header forwarding
 * for Next.js -> Python backend Route Handler proxies.
 */

export interface SecurityHeaderEntry {
  readonly key: string;
  readonly value: string;
}

export const COMMON_SECURITY_HEADERS: readonly SecurityHeaderEntry[] = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), browsing-topics=()' },
];

/**
 * Forward trusted App Check and client IP headers from a Next.js Route Handler
 * request onto the upstream Python backend header map.
 */
export function appendBackendForwardHeaders(
  incoming: Pick<Headers, 'get'>,
  target: Record<string, string>,
): void {
  const appCheckToken = incoming.get('X-Firebase-AppCheck');
  if (appCheckToken) {
    target['X-Firebase-AppCheck'] = appCheckToken;
  }
  const forwardedFor = incoming.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwardedFor) {
    target['X-Forwarded-For'] = forwardedFor;
  }
}
