/**
 * Server-side company info read, for Server Components (root layout, home, /faq,
 * /chi-siamo, the vCard route). Same approach as lib/portfolio/server.ts.
 *
 * The response is cached by Next.js and refreshed in the background every
 * `COMPANY_INFO_REVALIDATE_SECONDS` (ISR). When the backend cannot be reached
 * the last good copy this server instance received is reused, else the bundled
 * seed. It never throws: the root layout calls it on every page, and a page is
 * also rendered on demand (e.g. a Server Action that sets a cookie re-renders
 * the current page), where an error would take the whole site down (PR #566).
 *
 * During the production build, after the first failure the backend is still asked
 * (every page must carry the `revalidate`, or it would stay on the seed until the
 * next deploy) but with a short timeout: a build with no backend must not wait
 * for a long timeout on every page.
 *
 * Import this only from Server Components: it reads a server-only env var.
 */
import { cache } from 'react';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import type { CompanyInfo } from '@/types/company-info';
import { requestCompanyInfo } from './api';
import { COMPANY_INFO_REVALIDATE_SECONDS } from './config';
import { isBrowser } from './runtime';
import { SEED_COMPANY_INFO } from './seed';

// Same variable as the chat/portfolio proxies (app/api/*/route.ts).
const BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8080';

const BUILD_TIMEOUT_MS = 5_000;
// Build, after a failed read: a backend that is not up fails fast or not at all.
const BUILD_RETRY_TIMEOUT_MS = 1_000;
const RUNTIME_TIMEOUT_MS = 8_000;

// Last successful response of this server instance (Fluid Compute reuses instances).
let lastGood: CompanyInfo | null = null;
let buildFailed = false;

/** Test hook: forget the remembered copy. */
export function resetServerCompanyInfoMemory(): void {
    lastGood = null;
    buildFailed = false;
}

/** The company info to render: the response, else the last good copy, else the seed. */
export function resolveServerCompanyInfo(info: CompanyInfo | null): CompanyInfo {
    if (info !== null) {
        lastGood = info;
        return info;
    }
    return lastGood ?? SEED_COMPANY_INFO;
}

async function readCompanyInfo(): Promise<CompanyInfo> {
    if (isBrowser()) {
        throw new Error('lib/company-info/server is server-only');
    }
    if (!process.env.PYTHON_BACKEND_URL && process.env.VERCEL) {
        console.error('[company-info] PYTHON_BACKEND_URL is not set: the site shows the bundled seed');
    }
    const isBuild = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
    const timeout = !isBuild ? RUNTIME_TIMEOUT_MS : buildFailed ? BUILD_RETRY_TIMEOUT_MS : BUILD_TIMEOUT_MS;

    const info = await requestCompanyInfo(`${BACKEND_URL}/api`, {
        next: { revalidate: COMPANY_INFO_REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(timeout),
    });
    if (info === null && isBuild) buildFailed = true;
    return resolveServerCompanyInfo(info);
}

/** One read per request, shared by the layout and the page that render together. */
export const getCompanyInfo = cache(readCompanyInfo);
