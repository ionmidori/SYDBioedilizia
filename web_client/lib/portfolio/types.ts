/**
 * Portfolio domain model, as served by the public API `GET /api/content/portfolio`.
 *
 * Golden Sync: mirrors `PortfolioOut` / `PortfolioStats` in
 * `backend_python/src/api/routes/content_routes.py`. Update both together.
 *
 * The schema is used to READ the response: it is lenient on missing fields (the
 * backend fills them with "") but strict on types, so one malformed project is
 * dropped instead of breaking the gallery (see `parsePortfolio`).
 */
import { z } from 'zod';

export const portfolioStatsSchema = z.object({
    area: z.string().default(''),
    duration: z.string().default(''),
    budget: z.string().default(''),
});
export type PortfolioStats = z.infer<typeof portfolioStatsSchema>;

export const portfolioItemSchema = z.object({
    id: z.string().min(1),
    title: z.string(),
    category: z.string(),
    location: z.string(),
    /** null when the project has no photo yet — never pass this straight to next/image. */
    image: z.string().nullable(),
    description: z.string(),
    stats: portfolioStatsSchema,
});
export type PortfolioItem = z.infer<typeof portfolioItemSchema>;

/** Keys of `PortfolioStats`, for the display configuration in `config.ts`. */
export type PortfolioStatKey = keyof PortfolioStats;

/**
 * One card of a gallery: a real project, or an example (stock photo) that fills
 * the gallery up to `PORTFOLIO_MIN_CARDS` — see `withExamples`. Examples must be
 * labelled as such and never reach structured data.
 */
export type PortfolioCard = PortfolioItem & { isExample: boolean };
