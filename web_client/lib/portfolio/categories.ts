import { ALL_CATEGORIES } from './config';
import type { PortfolioItem } from './types';

/**
 * Builds the filter vocabulary from the projects themselves.
 *
 * Deriving instead of hardcoding is what keeps filters honest as the portfolio
 * grows: a chip can never point at zero projects, and no project category can
 * become unreachable. Blank categories are dropped, and order follows first
 * appearance (the backend already sorts by the `order` field).
 */
export function deriveCategories(projects: PortfolioItem[]): string[] {
    const seen: string[] = [];
    for (const project of projects) {
        const category = project.category.trim();
        if (category && !seen.includes(category)) {
            seen.push(category);
        }
    }
    return [ALL_CATEGORIES, ...seen];
}

/** Filters by category, treating `ALL_CATEGORIES` as no filter. */
export function filterByCategory(
    projects: PortfolioItem[],
    category: string,
): PortfolioItem[] {
    if (category === ALL_CATEGORIES) return projects;
    return projects.filter((p) => p.category === category);
}
