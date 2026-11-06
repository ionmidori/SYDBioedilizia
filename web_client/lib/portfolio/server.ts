/**
 * Server-side portfolio read, for Server Components (homepage, /progetti).
 *
 * Rendering the projects into the HTML is what lets search engines and link
 * previews see the real photos, and it removes the flash of placeholder projects
 * that a client-only fetch showed on every visit. The response is cached by
 * Next.js and refreshed in the background every `PORTFOLIO_REVALIDATE_SECONDS`
 * (ISR), so visitors never wait for a Cloud Run cold start.
 *
 * Import this only from Server Components: it reads a server-only env var.
 */
import { requestPortfolio, withFallback } from './api';
import { PORTFOLIO_REVALIDATE_SECONDS } from './config';
import type { PortfolioData } from './types';

// Same variable as the chat/feedback proxies (app/api/*/route.ts).
const BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8080';

// Above the backend's cold start (~11–15 s): this runs at build time and in the
// background revalidation, never on a visitor's request path.
const TIMEOUT_MS = 20_000;

export async function getPortfolio(): Promise<PortfolioData> {
    const projects = await requestPortfolio(`${BACKEND_URL}/api`, {
        next: { revalidate: PORTFOLIO_REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return withFallback(projects);
}
