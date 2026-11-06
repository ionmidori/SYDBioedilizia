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
export function projectImageAlt(project: PortfolioItem | PortfolioCard): string {
    const subject = [project.title, project.category].filter(Boolean).join(' · ');
    if (isExample(project)) return `${EXAMPLE_LABEL}: ${subject}`;
    return project.location ? `${subject}, ${project.location}` : subject;
}

// ── Card helpers: the ONE place that decides how an example differs from a real
//    project, so no card component can forget the label or show invented data. ──

function isExample(project: PortfolioItem | PortfolioCard): boolean {
    return 'isExample' in project && project.isExample;
}

/** Text of the category chip: "Esempio · Bagno" for an example, else the category. */
export function cardBadge(card: PortfolioCard): string {
    return card.isExample ? `${EXAMPLE_LABEL} · ${card.category}` : card.category;
}

/** Line under the title: the place of a real project; the badge for an example. */
export function cardSubtitle(card: PortfolioCard): string {
    return card.isExample ? cardBadge(card) : card.location;
}

/** What a screen reader hears for a card: what it is, and where for a real project. */
export function cardAccessibleName(card: PortfolioCard): string {
    if (card.isExample) return `${EXAMPLE_LABEL}: ${card.title}`;
    return card.location ? `${card.title}, ${card.location}` : card.title;
}

/** Whether the card shows its stats: never for an example (they have none). */
export function cardShowsStats(card: PortfolioCard): boolean {
    return !card.isExample;
}

/** The stats the cards show, in display order, with their labels (see `config.ts`). */
export function visibleStats(
    stats: PortfolioItem['stats'],
): Array<{ key: string; label: string; value: string }> {
    return PORTFOLIO_VISIBLE_STATS.map(({ key, label }) => ({ key, label, value: stats[key] }));
}
