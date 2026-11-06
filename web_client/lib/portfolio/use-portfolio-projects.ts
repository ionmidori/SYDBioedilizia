import { useEffect, useState } from 'react';
import { fetchPortfolio } from './api';
import { defaultProjects } from './fallback';
import type { PortfolioData, PortfolioItem } from './types';

/**
 * The projects a gallery shows, for Client Components (homepage rail, /progetti).
 *
 * Starts from the server-rendered data and fetches from the backend (3-Tier: never
 * Firestore directly) only when the server did not provide real projects: no data
 * at all, or placeholders because the backend was unreachable at render time —
 * the browser gets a second chance. A response after unmount is ignored.
 */
export function usePortfolioProjects(initial?: PortfolioData): PortfolioItem[] {
    const [projects, setProjects] = useState<PortfolioItem[]>(initial?.projects ?? defaultProjects);
    const needsFetch = !initial || initial.isFallback;

    useEffect(() => {
        if (!needsFetch) return;
        let active = true;
        fetchPortfolio().then((fetched) => {
            if (active) setProjects(fetched);
        });
        return () => {
            active = false;
        };
    }, [needsFetch]);

    return projects;
}
