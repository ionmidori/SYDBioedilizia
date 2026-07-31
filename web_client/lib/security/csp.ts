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

/**
 * Vercel Toolbar (vercel.live) origins.
 *
 * Vercel injects the toolbar into deployments it serves; without these the
 * browser blocks it and logs "Framing 'https://vercel.live/' violates the
 * following Content Security Policy directive: frame-src …". The exact set is
 * the one Vercel documents (script-src, style-src, connect-src, frame-src,
 * img-src) — see vercel.com/docs/vercel-toolbar/managing-toolbar. font-src is
 * deliberately NOT widened: the toolbar's fonts load inside its own
 * vercel.live iframe, which is governed by that frame's CSP, not this one.
 *
 * Trust level matches the Google origins already allow-listed above: these are
 * first-party Vercel hosts, not third-party CDNs. They are added in every
 * environment — gating them on VERCEL_ENV would leave the violation unfixed on
 * production, which is where it was actually observed. If the toolbar is ever
 * disabled for production in the project settings, these can be narrowed to
 * `process.env.VERCEL_ENV !== 'production'`.
 *
 * Note for the strict policy: 'strict-dynamic' makes CSP3 browsers ignore host
 * allow-lists in script-src entirely, so TOOLBAR_SCRIPT is only a CSP2 fallback
 * on /dashboard/* — exactly like the Google origins. The other four directives
 * are unaffected by 'strict-dynamic' and do apply there.
 */
const TOOLBAR_SCRIPT_ORIGIN = 'https://vercel.live';
const TOOLBAR_STYLE_ORIGIN = 'https://vercel.live';
const TOOLBAR_FRAME_ORIGIN = 'https://vercel.live';
const TOOLBAR_IMG_ORIGINS = 'https://vercel.live https://vercel.com';
const TOOLBAR_CONNECT_ORIGINS = 'https://vercel.live wss://ws-us3.pusher.com';

const SCRIPT_FALLBACK_ORIGINS =
  `https://www.google.com https://www.gstatic.com https://apis.google.com ${TOOLBAR_SCRIPT_ORIGIN}`;

const CONNECT_ORIGINS =
  "'self' https://*.googleapis.com https://*.firebaseio.com https://*.google-analytics.com " +
  'https://vitals.vercel-insights.com https://*.vercel-insights.com ' +
  'https://syd-brain-w6yrkh3gfa-ew.a.run.app https://www.google.com https://www.gstatic.com ' +
  `wss://*.firebaseio.com ${TOOLBAR_CONNECT_ORIGINS}`;

/**
 * Firebase emulator origins, added to connect-src ONLY in the E2E build.
 *
 * The emulators listen on loopback ports (9099 auth, 8085 firestore) which are
 * *different origins* from the app's own — `'self'` does not cover them — so
 * without this every emulator call is CSP-blocked and the authenticated suite
 * cannot log in at all. `upgrade-insecure-requests` is also dropped in this
 * mode: browsers exempt loopback from the upgrade, but relying on that is a
 * bet a CI job shouldn't take.
 *
 * NEXT_PUBLIC_FIREBASE_EMULATOR is never set in production (Vercel), so this
 * compares to `undefined` there and the branch is statically false.
 */
const EMULATOR_CONNECT_ORIGINS =
  'http://127.0.0.1:9099 http://127.0.0.1:8085 ' +
  'http://localhost:9099 http://localhost:8085 ' +
  'ws://127.0.0.1:8085 ws://localhost:8085';

const USE_EMULATORS = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true';

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
    style-src 'self' 'unsafe-inline' ${TOOLBAR_STYLE_ORIGIN};
    img-src 'self' blob: data: https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.googleusercontent.com https://images.unsplash.com https://replicate.delivery ${TOOLBAR_IMG_ORIGINS};
    font-src 'self' data:;
    connect-src ${CONNECT_ORIGINS}${USE_EMULATORS ? ` ${EMULATOR_CONNECT_ORIGINS}` : ''};
    media-src 'self' blob: https://firebasestorage.googleapis.com https://storage.googleapis.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    frame-src 'self' https://chatbotluca-a8a73.firebaseapp.com https://www.google.com https://recaptcha.google.com ${TOOLBAR_FRAME_ORIGIN};
    ${USE_EMULATORS ? '' : 'upgrade-insecure-requests;'}
  `
    .replace(/\s{2,}/g, ' ')
    .trim();
}
