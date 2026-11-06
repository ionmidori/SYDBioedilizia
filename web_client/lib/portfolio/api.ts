/**
 * Reading the portfolio from the backend (3-Tier: never Firestore directly).
 * Shared by the browser (`fetchPortfolio`) and the server (`server.ts`).
 */
import { PORTFOLIO_ENDPOINT } from './config';
import { portfolioItemSchema, type PortfolioItem } from './types';

/**
 * Keeps the well-formed projects of a response; null when it is not a list at all.
 * One malformed project must not blank the gallery (the backend applies the same rule).
 */
export function parsePortfolio(body: unknown): PortfolioItem[] | null {
    if (!Array.isArray(body)) return null;
    const projects: PortfolioItem[] = [];
    for (const raw of body) {
        const parsed = portfolioItemSchema.safeParse(raw);
        if (parsed.success) projects.push(parsed.data);
    }
    if (projects.length < body.length) {
        console.error(`[portfolio] dropped ${body.length - projects.length} malformed project(s)`);
    }
    return projects;
}

/**
 * Requests the portfolio; null on any failure.
 *
 * Only the failure paths are logged: an empty response is an expected state
 * (nothing published yet), a non-ok status or a thrown request is not.
 */
export async function requestPortfolio(
    apiRoot: string,
    init?: RequestInit,
): Promise<PortfolioItem[] | null> {
    try {
        const res = await fetch(`${apiRoot}${PORTFOLIO_ENDPOINT}`, init);
        if (!res.ok) {
            console.error(`[portfolio] fetch failed with status ${res.status}`);
            return null;
        }
        const projects = parsePortfolio(await res.json());
        if (!projects) console.error('[portfolio] response is not a list');
        return projects;
    } catch (error) {
        console.error('[portfolio] fetch threw', error);
        return null;
    }
}

/**
 * Browser fetch, through the Next.js `/api/py` rewrite: the real projects,
 * `[]` when there are none or the request failed (the gallery adds examples).
 */
export async function fetchPortfolio(apiRoot = '/api/py'): Promise<PortfolioItem[]> {
    return (await requestPortfolio(apiRoot)) ?? [];
}
