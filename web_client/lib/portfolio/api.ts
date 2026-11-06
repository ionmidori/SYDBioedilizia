/**
 * Reading the portfolio from the backend (3-Tier: never Firestore directly).
 * Shared by the browser (`fetchPortfolio`) and the server (`server.ts`).
 */
import { PORTFOLIO_ENDPOINT } from './config';
import { defaultProjects } from './fallback';
import { portfolioItemSchema, type PortfolioData, type PortfolioItem } from './types';

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

/** Real projects when there are some, else the placeholder set. */
export function withFallback(projects: PortfolioItem[] | null): PortfolioData {
    return projects && projects.length > 0
        ? { projects, isFallback: false }
        : { projects: defaultProjects, isFallback: true };
}

/**
 * Requests the portfolio; null on any failure.
 *
 * A genuinely empty collection and a broken request end up in the same fallback
 * by design, but only the failure paths are logged: an empty response is an
 * expected state, a non-ok status or a thrown request is not.
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
 * Browser fetch, through the Next.js `/api/py` rewrite.
 * Returns `defaultProjects` on any failure or empty response.
 */
export async function fetchPortfolio(apiRoot = '/api/py'): Promise<PortfolioItem[]> {
    return withFallback(await requestPortfolio(apiRoot)).projects;
}
