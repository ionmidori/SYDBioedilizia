/**
 * Server-side portfolio read, for Server Components (homepage, /progetti).
 *
 * Rendering the projects into the HTML is what lets search engines and link
 * previews see the real photos, and it removes the flash of placeholder projects
 * that a client-only fetch showed on every visit. The response is cached by
 * Next.js and refreshed in the background every `PORTFOLIO_REVALIDATE_SECONDS`
 * (ISR), so visitors never wait for a Cloud Run cold start.
 *
 * When the backend cannot be reached, the last real list this server instance
 * received is reused, else the placeholders (the browser then retries, see
 * `usePortfolioProjects`). It never throws: the page is not only rendered by ISR
 * but also on demand — e.g. a Server Action that sets a cookie (login, see
 * AuthProvider) re-renders the current page, and an error there broke the
 * homepage for every user logging in while the backend was down (E2E, PR #566).
 * A successful empty list is a real state (nothing published): placeholders.
 *
 * Import this only from Server Components: it reads a server-only env var.
 */
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { requestPortfolio, withFallback } from './api';
import { PORTFOLIO_REVALIDATE_SECONDS } from './config';
import { isBrowser } from './runtime';
import type { PortfolioData, PortfolioItem } from './types';

// Same variable as the chat/feedback proxies (app/api/*/route.ts).
const BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8080';

// Build: short, two pages wait for it inside the build budget. Runtime: the
// request can be on a user's path (a Server Action re-render after login), so it
// stays short too. Usually it is not even made: the response sits in the Next.js
// data cache, which serves the stale copy while refreshing it in the background
// and keeps it when the refresh fails — the timeout only matters with no copy.
const BUILD_TIMEOUT_MS = 5_000;
const RUNTIME_TIMEOUT_MS = 8_000;

// Last successful response of this server instance (Fluid Compute reuses instances).
let lastGood: PortfolioItem[] | null = null;

/** Test hook: forget the remembered list. */
export function resetServerPortfolioMemory(): void {
    lastGood = null;
}

/** The data to render: the response, else the last good list, else the placeholders. */
export function resolveServerPortfolio(projects: PortfolioItem[] | null): PortfolioData {
    if (projects !== null) {
        lastGood = projects.length > 0 ? projects : null;
        return withFallback(projects);
    }
    return lastGood ? { projects: lastGood, isFallback: false } : withFallback(null);
}

export async function getPortfolio(): Promise<PortfolioData> {
    if (isBrowser()) {
        throw new Error('lib/portfolio/server is server-only: use fetchPortfolio() in the browser');
    }
    if (!process.env.PYTHON_BACKEND_URL && process.env.VERCEL) {
        console.error('[portfolio] PYTHON_BACKEND_URL is not set: the portfolio cannot be server-rendered');
    }
    const isBuild = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
    const projects = await requestPortfolio(`${BACKEND_URL}/api`, {
        next: { revalidate: PORTFOLIO_REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(isBuild ? BUILD_TIMEOUT_MS : RUNTIME_TIMEOUT_MS),
    });
    return resolveServerPortfolio(projects);
}
