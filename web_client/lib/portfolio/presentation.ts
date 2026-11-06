import { PORTFOLIO_VISIBLE_STATS } from './config';
import type { PortfolioItem } from './types';

/**
 * Alt text of a project photo: what it shows and where, not just the title —
 * it is what screen readers announce and what image search indexes.
 */
export function projectImageAlt(project: PortfolioItem): string {
    const subject = [project.title, project.category].filter(Boolean).join(' · ');
    return project.location ? `${subject}, ${project.location}` : subject;
}

/** The stats the cards show, in display order, with their labels (see `config.ts`). */
export function visibleStats(
    stats: PortfolioItem['stats'],
): Array<{ key: string; label: string; value: string }> {
    return PORTFOLIO_VISIBLE_STATS.map(({ key, label }) => ({ key, label, value: stats[key] }));
}
