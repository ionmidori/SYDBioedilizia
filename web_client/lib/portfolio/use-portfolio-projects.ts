import { useEffect, useState } from 'react';
import { fetchPortfolio } from './api';
import type { PortfolioItem } from './types';

/**
 * The real projects a gallery shows, for Client Components (homepage rail,
 * /progetti); the gallery adds examples with `withExamples`.
 *
 * Starts from the server-rendered list and fetches from the backend (3-Tier: never
 * Firestore directly) only when the server had no real project — none published,
 * or the backend unreachable at render time: the browser gets a second chance.
 * A response after unmount is ignored.
 */
export function usePortfolioProjects(initial?: PortfolioItem[]): PortfolioItem[] {
    const [projects, setProjects] = useState<PortfolioItem[]>(initial ?? []);
    const needsFetch = !initial || initial.length === 0;

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
