/**
 * Content-Security-Policy construction (issue #133).
 *
 * Two policies coexist, selected per-route by the proxy:
 *
 * 1. STRICT (nonce + 'strict-dynamic') — for dynamically rendered routes
 *    (`/dashboard/*`). Next.js reads the nonce from the CSP request header
 *    and stamps it on every <script> it emits; 'strict-dynamic' then lets
 *    those scripts load further scripts (Firebase → gapi/reCAPTCHA) while
 *    CSP3 browsers ignore 'unsafe-inline'/host allowlists entirely.
 *
 * 2. FALLBACK — for statically prerendered routes (landing, blog, FAQ,
 *    legal). Static HTML is built once, so a per-request nonce cannot be
 *    injected; 'strict-dynamic' would block the un-nonced /_next/ chunks
 *    and break the page. These routes keep the F-01 enforcing policy
 *    (script-src 'self' + trusted Google origins + 'unsafe-inline').
 *
 * In the STRICT policy, 'self'/'unsafe-inline' and the Google hosts are
 * retained ONLY as a CSP2 fallback: any browser that understands
 * 'strict-dynamic' (CSP3) is required by spec to ignore them.
 */

const SCRIPT_FALLBACK_ORIGINS =
  'https://www.google.com https://www.gstatic.com https://apis.google.com';

/** Routes rendered dynamically (force-dynamic) that receive the strict CSP. */
export function isStrictCspPath(pathname: string): boolean {
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
}

/** 128-bit random nonce, base64 — Web Crypto only (Edge-runtime safe). */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export interface BuildCspOptions {
  /** Per-request nonce. When set, emits the strict nonce+'strict-dynamic' policy. */
  nonce?: string;
  /** Adds 'unsafe-eval' to the strict policy (React Refresh needs it in dev). */
  isDev?: boolean;
}

export function buildCspHeader({ nonce, isDev = false }: BuildCspOptions = {}): string {
  const scriptSrc = nonce
    ? `'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''} 'self' 'unsafe-inline' ${SCRIPT_FALLBACK_ORIGINS}`
    : `'self' 'unsafe-inline' ${SCRIPT_FALLBACK_ORIGINS}`;

  return `
    default-src 'self';
    script-src ${scriptSrc};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.googleusercontent.com https://images.unsplash.com https://replicate.delivery;
    font-src 'self' data:;
    connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.google-analytics.com https://vitals.vercel-insights.com https://*.vercel-insights.com https://syd-brain-w6yrkh3gfa-ew.a.run.app https://www.google.com https://www.gstatic.com wss://*.firebaseio.com;
    media-src 'self' blob: https://firebasestorage.googleapis.com https://storage.googleapis.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    frame-src 'self' https://chatbotluca-a8a73.firebaseapp.com https://www.google.com https://recaptcha.google.com;
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, ' ')
    .trim();
}
