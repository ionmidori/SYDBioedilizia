/**
 * Portfolio display settings — the one place to change what the gallery shows.
 * Content (projects, photos, categories) is NOT here: it lives in Firestore and is
 * edited from the Console admin (/admin/portfolio).
 */
import type { PortfolioStatKey } from './types';

/** How many projects the homepage rail shows before the "see all" card. */
export const PORTFOLIO_RAIL_LIMIT = 8;

/** Label for the pseudo-category that disables filtering. */
export const ALL_CATEGORIES = 'Tutti';

/**
 * Which stats the cards show, in order. `duration` and `budget` are still stored
 * and edited in the Console, but deliberately hidden: a card reads as a photo of
 * the work, not a spec sheet. Showing one again is a one-line change here.
 */
export const PORTFOLIO_VISIBLE_STATS: ReadonlyArray<{ key: PortfolioStatKey; label: string }> = [
    { key: 'area', label: 'Area' },
];

/**
 * How long a server-rendered page reuses the portfolio before asking the backend
 * again (ISR). A Console edit shows up on the public pages within this delay.
 */
export const PORTFOLIO_REVALIDATE_SECONDS = 300;

/** Public endpoint path, relative to the API root (`/api/py` in the browser). */
export const PORTFOLIO_ENDPOINT = '/content/portfolio';
