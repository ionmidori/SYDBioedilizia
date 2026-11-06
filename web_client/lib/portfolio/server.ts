/**
 * Server-side portfolio read, for Server Components (homepage, /progetti).
 *
 * Rendering the projects into the HTML is what lets search engines and link
 * previews see the real photos, and it removes the flash of placeholder projects
 * that a client-only fetch showed on every visit. The response is cached by
 * Next.js and refreshed in the background every `PORTFOLIO_REVALIDATE_SECONDS`
 * (ISR), so visitors never wait for a Cloud Run cold start.
 *
 * What happens when the backend cannot be reached depends on when:
 *   - `next build` / `next dev` / tests: the placeholders, so a build never fails
 *     on the backend (the browser retries, see `usePortfolioProjects`);
 *   - a background revalidation in production: an error is THROWN, so Next.js keeps
 *     serving the last good page instead of caching one made of stock photos.
 * A successful empty list is a real state (nothing published) and always gives
 * the placeholders.
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

// Build: short, two pages wait for it inside the build budget, and a cold backend
// only means placeholders until the first revalidation. Revalidation: above the
// backend's cold start (~11–15 s); it runs in the background, never on a request.
const BUILD_TIMEOUT_MS = 5_000;
const REVALIDATE_TIMEOUT_MS = 20_000;

export class PortfolioUnavailableError extends Error {
    constructor() {
        super('[portfolio] backend unreachable during revalidation: keeping the cached page');
        this.name = 'PortfolioUnavailableError';
    }
}

/** Placeholders, or a throw when a production revalidation failed (see above). */
export function resolveServerPortfolio(
    projects: PortfolioItem[] | null,
    { isBuild, isProduction }: { isBuild: boolean; isProduction: boolean },
): PortfolioData {
    if (projects === null && isProduction && !isBuild) {
        throw new PortfolioUnavailableError();
    }
    return withFallback(projects);
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
        signal: AbortSignal.timeout(isBuild ? BUILD_TIMEOUT_MS : REVALIDATE_TIMEOUT_MS),
    });
    return resolveServerPortfolio(projects, {
        isBuild,
        isProduction: process.env.NODE_ENV === 'production',
    });
}
