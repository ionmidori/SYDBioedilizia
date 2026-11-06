import { PORTFOLIO_MIN_CARDS, PORTFOLIO_VISIBLE_STATS } from './config';
import { exampleProjects } from './examples';
import type { PortfolioCard, PortfolioItem } from './types';

/** Label shown on example cards (and read by screen readers). */
export const EXAMPLE_LABEL = 'Esempio';

/**
 * The cards of a gallery: every real project, then as many examples as needed
 * to reach `minimum` (never more than exist). Real projects always come first.
 */
export function withExamples(
    projects: PortfolioItem[],
    minimum: number = PORTFOLIO_MIN_CARDS,
): PortfolioCard[] {
    const real = projects.map((project) => ({ ...project, isExample: false }));
    const missing = Math.max(0, minimum - real.length);
    const examples = exampleProjects.slice(0, missing).map((project) => ({ ...project, isExample: true }));
    return [...real, ...examples];
}

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
